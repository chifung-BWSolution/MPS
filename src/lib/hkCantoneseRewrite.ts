/**
 * 港式語氣改寫器 · 純函式改寫引擎
 *
 * 全程同步、無網路、無 DOM、無 localStorage；草稿不會離開瀏覽器。
 *
 * 流程：
 *   1. 正規化（換行、空白、中文標點；URL／email／hashtag 區段跳過）
 *   2. 一次過套用「簡→繁 + 非港式用詞 + 粵語口語→書面語 + 保護詞」
 *   3. 語氣檢查（反 AI 味規則）
 *   4. 以書面語版組 IG／FB／小紅書口語版，再套一次「書面語→粵語口語」
 *   5. 按平台上限截短、append hashtag
 *
 * 規則變體：由 SIMPLIFIED_TO_TRADITIONAL 自動為多字詞規則加上簡體變體，
 * 令「质量」也能命中「質量→質素」，替換表顯示使用者原本的寫法。
 */

import {
  DEFAULT_HASHTAGS,
  EXTRA_HASHTAGS,
  HK_AMBIGUOUS_SIMPLIFIED_HINTS,
  HK_COLLOQUIAL_PHRASE_RULES,
  HK_COLLOQUIAL_RULES,
  HK_FORMALIZE_PHRASE_RULES,
  HK_FORMALIZE_RULES,
  HK_PLATFORM_RULES,
  HK_PROTECT_RULES,
  HK_WRITTEN_RULES,
  SIMPLIFIED_TO_TRADITIONAL,
  detectHkTopic,
  type HkTermCategory,
  type HkTermRule,
  type SocialPlatform,
} from './hkCantoneseRules.ts';
import { buildHkRewritePrompt } from './hkCantonesePrompts.ts';

export type { HkTermCategory, SocialPlatform };
export { buildHkRewritePrompt };

export const HK_REWRITE_MAX_INPUT = 20_000;

export type HkMarkKind = 'shape' | 'written' | 'colloquial';

export interface HkMark {
  start: number;
  end: number;
  text: string;
  kind: HkMarkKind;
  ruleId: string;
  title: string;
}

export interface HkReplacement {
  ruleId: string;
  from: string;
  written: string;
  colloquial?: string;
  category: HkTermCategory;
  count: number;
  contexts: string[];
}

export interface HkSocialVariant {
  platform: SocialPlatform;
  label: string;
  text: string;
  marks: HkMark[];
  charCount: number;
  limit: number;
  hashtags: string[];
  truncated: boolean;
}

export interface HkRewriteResult {
  input: string;
  platforms: SocialPlatform[];
  inputTruncated: boolean;
  writtenText: string;
  writtenMarks: HkMark[];
  replacements: HkReplacement[];
  social: HkSocialVariant[];
  colloquialCount: number;
  issues: string[];
  stats: {
    chars: number;
    replacements: number;
    reviewedTarget: number;
  };
}

interface RuleMatch {
  rule: HkTermRule;
  from: string;
  index: number;
  context: string;
}

interface CompiledEntry {
  rule: HkTermRule;
  variant: string;
  replacement: string;
  markKind: HkMarkKind;
  protect: boolean;
}

interface CompiledSet {
  entries: CompiledEntry[];
  regex: RegExp | null;
  byVariant: Map<string, CompiledEntry>;
}

export interface HkRuleConflict {
  variant: string;
  kept: string;
  dropped: string;
}

export const ALL_SOCIAL_PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'xiaohongshu'];

const RULE_CONFLICTS: HkRuleConflict[] = [];

// ============================================================
// 規則編譯
// ============================================================

const REVERSE_SIMPLIFIED = (() => {
  const map = new Map<string, string>();
  for (const [simplified, traditional] of Object.entries(SIMPLIFIED_TO_TRADITIONAL)) {
    const existing = map.get(traditional);
    if (existing && existing !== simplified) {
      // 一繁對多簡：無法安全自動產生變體
      map.set(traditional, '');
      continue;
    }
    map.set(traditional, simplified);
  }
  return map;
})();

function toSimplifiedVariant(text: string): string {
  let out = '';
  for (const char of text) {
    const simplified = REVERSE_SIMPLIFIED.get(char);
    out += simplified || char;
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SHAPE_RULES: HkTermRule[] = Object.entries(SIMPLIFIED_TO_TRADITIONAL).map(
  ([simplified, traditional]) => ({
    id: `s:${simplified}`,
    from: [simplified],
    written: traditional,
    category: '簡體字',
    note: '簡體字轉繁體',
  }),
);

function colloquialOf(rule: HkTermRule): string {
  if (rule.colloquial) return rule.colloquial;
  if (rule.category === '粵語口語') return rule.from[0] ?? rule.written;
  return rule.written;
}

function compileSet(mode: 'written' | 'colloquial'): CompiledSet {
  const byVariant = new Map<string, CompiledEntry>();
  const conflicts: HkRuleConflict[] = [];

  const add = (
    rule: HkTermRule,
    variant: string,
    replacement: string,
    markKind: HkMarkKind,
    protect: boolean,
  ) => {
    if (!variant) return;
    const existing = byVariant.get(variant);
    if (existing) {
      if (existing.replacement === replacement) return;
      conflicts.push({ variant, kept: existing.rule.id, dropped: rule.id });
      return;
    }
    byVariant.set(variant, { rule, variant, replacement, markKind, protect });
  };

  const addWithVariants = (
    rule: HkTermRule,
    replacement: string,
    markKind: HkMarkKind,
  ) => {
    const variants = new Set(rule.from);
    for (const from of rule.from) {
      const simplified = toSimplifiedVariant(from);
      if (simplified !== from) variants.add(simplified);
    }
    for (const variant of variants) {
      add(rule, variant, replacement, markKind, Boolean(rule.protect));
    }
  };

  // 保護詞優先，避免短規則拆字
  for (const rule of HK_PROTECT_RULES) {
    addWithVariants(rule, rule.written, 'written');
  }

  if (mode === 'written') {
    // 單字簡→繁最後才進場；因為按長度排序，多字詞規則會先命中
    for (const rule of SHAPE_RULES) {
      add(rule, rule.from[0], rule.written, 'shape', false);
    }
    for (const rule of [
      ...HK_WRITTEN_RULES,
      ...HK_FORMALIZE_RULES,
      ...HK_FORMALIZE_PHRASE_RULES,
    ]) {
      addWithVariants(rule, rule.written, rule.category === '簡體字' ? 'shape' : 'written');
    }
  } else {
    for (const rule of [...HK_COLLOQUIAL_RULES, ...HK_COLLOQUIAL_PHRASE_RULES]) {
      addWithVariants(rule, rule.written, 'colloquial');
    }
  }

  const entries = [...byVariant.values()].sort(
    (a, b) => b.variant.length - a.variant.length || a.variant.localeCompare(b.variant),
  );
  const regex = entries.length
    ? new RegExp(entries.map((entry) => escapeRegExp(entry.variant)).join('|'), 'g')
    : null;

  for (const conflict of conflicts) {
    // 測試會斷言為空；保留 console.warn 方便日後加詞時發現
    RULE_CONFLICTS.push(conflict);
    if (typeof console !== 'undefined') {
      console.warn('[hk-rewrite] rule variant conflict', conflict);
    }
  }

  return { entries, regex, byVariant };
}

const WRITTEN_SET = compileSet('written');
const COLLOQUIAL_SET = compileSet('colloquial');

/** 測試用：正常應為空陣列 */
export const HK_RULE_CONFLICTS: HkRuleConflict[] = RULE_CONFLICTS;
export const HK_COMPILED_RULE_COUNT = WRITTEN_SET.entries.length + COLLOQUIAL_SET.entries.length;

// ============================================================
// 文字處理
// ============================================================

const PUNCTUATION_MAP: Record<string, string> = {
  ',': '，',
  ';': '；',
  ':': '：',
  '?': '？',
  '!': '！',
  '(': '（',
  ')': '）',
};

const PROTECTED_SEGMENT_PATTERN =
  /(https?:\/\/[^\s]+|www\.[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|#[^\s#]+|@[^\s@]+)/g;

function isCjk(char: string): boolean {
  return /[\u3400-\u9FFF]/.test(char);
}

function convertPunctuation(segment: string): string {
  let out = '';
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    const mapped = PUNCTUATION_MAP[char];
    if (!mapped) {
      out += char;
      continue;
    }
    // 容許「香港 , 九龍」這種標點前後有空格；仍要求左右至少一邊是中文
    let before = index - 1;
    while (before >= 0 && (segment[before] === ' ' || segment[before] === '\t')) before -= 1;
    let after = index + 1;
    while (after < segment.length && (segment[after] === ' ' || segment[after] === '\t')) after += 1;
    const previous = segment[before] ?? '';
    const next = segment[after] ?? '';
    out += isCjk(previous) || isCjk(next) ? mapped : char;
  }
  return out;
}

function normalizePunctuation(text: string): string {
  const parts: string[] = [];
  const pattern = new RegExp(PROTECTED_SEGMENT_PATTERN.source, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    parts.push(convertPunctuation(text.slice(last, match.index)));
    parts.push(match[0]);
    last = match.index + match[0].length;
  }
  parts.push(convertPunctuation(text.slice(last)));
  return parts.join('');
}

function normalizeInput(text: string): string {
  let out = text.replace(/\r\n?/g, '\n').replace(/\u3000/g, ' ');
  out = out
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  // 去掉中文字之間多餘的半形空格，但保留換行
  out = out.replace(/([\u3400-\u9FFF])[ \t]+(?=[\u3400-\u9FFF])/g, '$1');
  // 先把相鄰中文的 ASCII 標點轉全形，再清掉標點前後空格
  return normalizePunctuation(out.trim())
    .replace(/([，。！？；：、（）])[ \t]+/g, '$1')
    .replace(/[ \t]+([，。！？；：、（）])/g, '$1');
}

function makeContext(text: string, index: number, variant: string): string {
  const before = text.slice(Math.max(0, index - 8), index).replace(/\s+/g, ' ').trim();
  const after = text
    .slice(index + variant.length, index + variant.length + 8)
    .replace(/\s+/g, ' ')
    .trim();
  return `${before ? '…' : ''}${before}「${variant}」${after}${after ? '…' : ''}`;
}

function applyCompiled(
  text: string,
  set: CompiledSet,
): { text: string; marks: HkMark[]; matches: RuleMatch[] } {
  if (!set.regex || !text) return { text, marks: [], matches: [] };

  const regex = set.regex;
  regex.lastIndex = 0;
  let out = '';
  let last = 0;
  const marks: HkMark[] = [];
  const matches: RuleMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const variant = match[0];
    const index = match.index;
    const entry = set.byVariant.get(variant);
    if (!entry) {
      last = index + variant.length;
      continue;
    }

    out += text.slice(last, index);

    if (entry.protect) {
      // 保護詞：輸出正式寫法（可順便修簡體），但不進替換表、不加標記
      out += entry.replacement;
    } else if (entry.replacement !== variant) {
      const start = out.length;
      out += entry.replacement;
      marks.push({
        start,
        end: out.length,
        text: entry.replacement,
        kind: entry.markKind,
        ruleId: entry.rule.id,
        title: `${variant} → ${entry.replacement}（${entry.rule.category}）`,
      });
      matches.push({
        rule: entry.rule,
        from: variant,
        index,
        context: makeContext(text, index, variant),
      });
    } else {
      out += variant;
    }

    last = index + variant.length;
    if (match[0].length === 0) regex.lastIndex += 1;
  }

  out += text.slice(last);
  return { text: out, marks, matches };
}

// ============================================================
// 替換表 / 語氣檢查
// ============================================================

function aggregateReplacements(matches: RuleMatch[]): HkReplacement[] {
  const rows = new Map<string, HkReplacement>();

  for (const match of matches) {
    if (match.rule.category === '簡體字') continue;
    let row = rows.get(match.rule.id);
    if (!row) {
      const colloquial = colloquialOf(match.rule);
      row = {
        ruleId: match.rule.id,
        from: match.from,
        written: match.rule.written,
        colloquial: colloquial !== match.rule.written ? colloquial : undefined,
        category: match.rule.category,
        count: 0,
        contexts: [],
      };
      rows.set(match.rule.id, row);
    }
    row.count += 1;
    if (row.contexts.length < 2 && !row.contexts.includes(match.context)) {
      row.contexts.push(match.context);
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.count - a.count || a.from.localeCompare(b.from),
  );
}

const CLICHE_WORDS = [
  '賦能',
  '閉環',
  '顛覆',
  '劃時代',
  '天花板',
  '神器',
  '乾貨滿滿',
  '狠狠',
  '絕絕子',
  '沉浸式',
  '種草無數',
  '全網瘋傳',
  'yyds',
];

const DEAD_TRANSITIONS = [
  '值得注意的是',
  '不可否認',
  '毋庸置疑',
  '眾所周知',
  '總而言之',
  '綜上所述',
  '首先讓我們',
  '讓我們一起',
  '隨著時代',
  '在當今',
  '不得不說',
];

const PUFFERY = ['徹底改變', '革命性', '前所未有', '史無前例', '顛覆性', '極致體驗', '完美解決'];

const LINK_PATTERN =
  /(https?:\/\/[^\s\u3400-\u9FFF\uFF00-\uFFEF]+|www\.[^\s\u3400-\u9FFF\uFF00-\uFFEF]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g;

/**
 * 把 URL／email 換成私有區佔位符，避免 splitSentences／splitClauses 在
 * `?`、`:`、`#` 等字元把連結切斷；split 後再 restore。
 */
function maskLinks(text: string): { text: string; restore: (value: string) => string } {
  const store: string[] = [];
  const masked = text.replace(LINK_PATTERN, (match) => {
    const token = `\uE000L${store.length}\uE001`;
    store.push(match);
    return token;
  });
  return {
    text: masked,
    restore: (value: string) =>
      value.replace(/\uE000L(\d+)\uE001/g, (_, index: string) => store[Number(index)] ?? ''),
  };
}

function splitSentences(text: string): string[] {
  const masked = maskLinks(text);
  const matches = masked.text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g);
  return (matches ?? []).map((sentence) => masked.restore(sentence).trim()).filter(Boolean);
}

function lintHkCopy(text: string): string[] {
  const issues: string[] = [];
  const sentences = splitSentences(
    text.replace(/[#＃][^\s#]+/g, '').replace(/https?:\/\/\S+/g, ''),
  );

  if (sentences.length >= 4) {
    const lengths = sentences.map((sentence) => sentence.length);
    const mean = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
    const variance =
      lengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) / lengths.length;
    if (Math.sqrt(variance) < 4) {
      issues.push('句長太均勻，讀起來像機器寫；試下長短句交替');
    }
  }

  const flat = text.replace(/\s+/g, '');
  for (const word of CLICHE_WORDS) {
    if (flat.includes(word)) issues.push(`「${word}」係宣傳腔，換成具體講法`);
  }
  for (const phrase of DEAD_TRANSITIONS) {
    if (flat.includes(phrase)) issues.push(`「${phrase}」係 AI 慣用過渡，直接刪咗佢`);
  }
  for (const phrase of PUFFERY) {
    if (flat.includes(phrase)) issues.push(`「${phrase}」太浮誇，冇數據就唔好咁寫`);
  }
  if (/不是.{1,12}[，,。]而是/.test(flat)) {
    issues.push('「不是 X，而是 Y」係典型 AI 句式，直接講結論');
  }
  if (/在.{1,12}的旅程中|開啟.{1,8}之旅|解鎖|探索.{0,6}奧秘|重新定義/.test(flat)) {
    issues.push('有解鎖／之旅／重新定義呢類 AI 用語，換白話');
  }
  if (/(首先|第一)[，,].{0,80}(其次|第二)[，,]/.test(flat) && sentences.length <= 6) {
    issues.push('「首先、其次」的排列太工整，換成自然的說法');
  }

  const ambiguous = findAmbiguousSimplified(text);
  if (ambiguous) {
    issues.push(`可能有未轉換的簡體字：${ambiguous}（請人手確認）`);
  }

  return issues.slice(0, 8);
}

function findAmbiguousSimplified(text: string): string {
  const found: string[] = [];
  for (const char of text) {
    if (HK_AMBIGUOUS_SIMPLIFIED_HINTS.includes(char) && !found.includes(char)) {
      found.push(char);
    }
    if (found.length >= 8) break;
  }
  return found.join('、');
}

// ============================================================
// 社群版本
// ============================================================

function stripTrailingPunctuation(text: string): string {
  return text.replace(/[。！？!?；;，,、\s]+$/g, '').trim();
}

function splitClauses(text: string): string[] {
  const masked = maskLinks(text);
  return masked.text
    .split(/[，,。！？!?；;：:\n]+/)
    .map((clause) => masked.restore(clause).trim())
    .filter(Boolean);
}

function truncatePlain(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function truncateWithMarks(
  text: string,
  marks: HkMark[],
  max: number,
): { text: string; marks: HkMark[]; truncated: boolean } {
  if (text.length <= max) return { text, marks, truncated: false };
  const cut = Math.max(0, max - 1);
  return {
    text: `${text.slice(0, cut)}…`,
    marks: marks.filter((mark) => mark.end <= cut).map((mark) => ({ ...mark })),
    truncated: true,
  };
}

function normalizeHashtag(raw: string): string {
  const cleaned = raw.replace(/\s+/g, '').replace(/^#+/, '');
  return cleaned ? `#${cleaned}` : '';
}

function buildHashtags(platform: SocialPlatform, text: string): string[] {
  const rule = HK_PLATFORM_RULES[platform];
  if (rule.hashtagMax <= 0) return [];

  const topic = detectHkTopic(text);
  const pool = [...(topic?.tags ?? []), ...DEFAULT_HASHTAGS, ...EXTRA_HASHTAGS];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of pool) {
    const tag = normalizeHashtag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }

  const targetMax = platform === 'facebook' ? 3 : 8;
  const count = Math.min(
    rule.hashtagMax,
    Math.max(rule.hashtagMin, Math.min(tags.length, targetMax)),
  );
  return tags.slice(0, count);
}

function hasLink(text: string): boolean {
  return maskLinks(text).text !== text;
}

function composeSocialBody(platform: SocialPlatform, writtenText: string): string {
  const sentences = splitSentences(writtenText);
  const first = sentences[0] ?? writtenText;
  const firstIndex = writtenText.indexOf(first);
  const rest = firstIndex >= 0 ? writtenText.slice(firstIndex + first.length).trim() : '';
  const clauses = splitClauses(first);
  const titleClause = clauses[0] ?? stripTrailingPunctuation(first);
  const tailClause = clauses.slice(1).join('，');
  const rule = HK_PLATFORM_RULES[platform];
  const topic = detectHkTopic(writtenText);
  const titleHasLink = hasLink(titleClause);
  const fallbackTitle = topic?.label ?? '重點分享';

  if (platform === 'instagram') {
    // 連結開頭的貼文不要把 URL 截斷；保留完整第一句作 hook
    const firstHasLink = hasLink(first);
    const hook = firstHasLink
      ? first
      : first.length > 60
        ? first.slice(0, 60)
        : stripTrailingPunctuation(first);
    const hookRemainder = firstHasLink || first.length <= 60 ? '' : first.slice(60).trim();
    const body = [hookRemainder, rest].filter(Boolean).join('\n\n');
    return [hook, body, rule.cta].filter(Boolean).join('\n\n');
  }

  if (platform === 'facebook') {
    const titleLimit = 40;
    const title = titleHasLink
      ? fallbackTitle
      : titleClause.length > titleLimit
        ? titleClause.slice(0, titleLimit)
        : stripTrailingPunctuation(titleClause);
    const titleRemainder = titleHasLink || titleClause.length <= titleLimit
      ? ''
      : titleClause.slice(titleLimit).trim();
    const body = titleHasLink
      ? [first, rest].filter(Boolean).join('\n\n')
      : [
          titleRemainder ? `${titleRemainder}。` : '',
          tailClause ? `${tailClause}。` : '',
          rest,
        ]
          .filter(Boolean)
          .join('\n\n');
    const audience = topic
      ? `適合同關注${topic.label}嘅香港讀者睇。`
      : '啱晒想了解多啲嘅香港讀者。';
    return [title, body, audience, rule.cta].filter(Boolean).join('\n\n');
  }

  const emoji = topic?.emoji ?? '✨';
  const title = titleHasLink
    ? fallbackTitle
    : truncatePlain(stripTrailingPunctuation(titleClause), 20);
  const bulletSentences = titleHasLink
    ? sentences
    : rest
      ? splitSentences(rest)
      : clauses.slice(1);
  const bullets = bulletSentences
    .slice(0, 5)
    .map((sentence) => (hasLink(sentence) ? sentence.trim() : stripTrailingPunctuation(sentence)))
    .filter(Boolean)
    .map((sentence) => `・${sentence}`)
    .join('\n');
  return [`${emoji}${title}`, bullets, rule.cta].filter(Boolean).join('\n\n');
}

function buildSocialVariant(
  platform: SocialPlatform,
  writtenText: string,
): HkSocialVariant {
  const rule = HK_PLATFORM_RULES[platform];
  const body = composeSocialBody(platform, writtenText);
  const colloquial = applyCompiled(body, COLLOQUIAL_SET);
  const hashtags = buildHashtags(platform, writtenText);
  const hashtagText = hashtags.join(' ');
  const maxBody = Math.max(0, rule.limit - (hashtagText ? hashtagText.length + 2 : 0));
  const truncated = truncateWithMarks(colloquial.text, colloquial.marks, maxBody);
  const text = hashtagText ? `${truncated.text}\n\n${hashtagText}` : truncated.text;

  return {
    platform,
    label: rule.label,
    text,
    marks: truncated.marks,
    charCount: text.length,
    limit: rule.limit,
    hashtags,
    truncated: truncated.truncated,
  };
}

// ============================================================
// 對外 API
// ============================================================

function emptyResult(
  input: string,
  platforms: SocialPlatform[],
  inputTruncated: boolean,
): HkRewriteResult {
  return {
    input,
    platforms,
    inputTruncated,
    writtenText: '',
    writtenMarks: [],
    replacements: [],
    social: [],
    colloquialCount: 0,
    issues: [],
    stats: { chars: 0, replacements: 0, reviewedTarget: 0 },
  };
}

export function rewriteHkDraft(
  input: string,
  options?: { platforms?: SocialPlatform[] },
): HkRewriteResult {
  const raw = typeof input === 'string' ? input : '';
  const requested = options?.platforms ?? ALL_SOCIAL_PLATFORMS;
  const platforms = ALL_SOCIAL_PLATFORMS.filter((platform) => requested.includes(platform));

  const inputTruncated = raw.length > HK_REWRITE_MAX_INPUT;
  const limited = inputTruncated ? raw.slice(0, HK_REWRITE_MAX_INPUT) : raw;
  const normalized = normalizeInput(limited);

  if (!normalized) return emptyResult(raw, platforms, inputTruncated);

  const writtenPass = applyCompiled(normalized, WRITTEN_SET);
  const writtenText = writtenPass.text;
  const replacements = aggregateReplacements(writtenPass.matches);
  const social = platforms.map((platform) => buildSocialVariant(platform, writtenText));

  const colloquialRuleIds = new Set<string>();
  for (const variant of social) {
    for (const mark of variant.marks) {
      if (mark.kind === 'colloquial') colloquialRuleIds.add(mark.ruleId);
    }
  }

  const issues = lintHkCopy(writtenText);
  if (!/[\u3400-\u9FFF]/.test(writtenText)) {
    issues.unshift('此工具針對中文草稿；英文商務語氣改寫器將於第二批加入。');
  }
  const totalReplacements = replacements.reduce((sum, row) => sum + row.count, 0);

  return {
    input: raw,
    platforms,
    inputTruncated,
    writtenText,
    writtenMarks: writtenPass.marks,
    replacements,
    social,
    colloquialCount: colloquialRuleIds.size,
    issues: issues.slice(0, 8),
    stats: {
      chars: [...writtenText].length,
      replacements: totalReplacements,
      reviewedTarget: replacements.length,
    },
  };
}
