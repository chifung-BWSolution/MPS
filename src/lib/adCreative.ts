/**
 * AI文案工坊 · 文案多角度轉寫與 A/B 文案矩陣 · 共用純函式層
 *
 * 這個檔案同時被三邊載入：
 *   1. 瀏覽器（Vite / React）
 *   2. Edge Function（Deno，以相對路徑 import）
 *   3. Node 自測腳本（node --experimental-strip-types）
 *
 * 因此：不得 import 其他專案模組、不得使用 window / document / Deno / Node API。
 */

// ============================================================
// 型別與常數
// ============================================================

export const AD_ANGLE_IDS = ['pain', 'time', 'offer', 'proof', 'social', 'contrast'] as const;
export type AdAngleId = (typeof AD_ANGLE_IDS)[number];

export const AD_PLATFORMS = ['meta', 'google', 'redbook'] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export const AD_GOALS = ['conversion', 'lead', 'traffic', 'awareness'] as const;
export type AdGoal = (typeof AD_GOALS)[number];

export const AD_TONES = ['professional', 'friendly', 'urgent', 'premium'] as const;
export type AdTone = (typeof AD_TONES)[number];

export const AD_VARIANTS = ['A', 'B'] as const;
export type AdVariantKey = (typeof AD_VARIANTS)[number];

export type AdCopyField = 'headline' | 'body' | 'cta';
export type AdProvider = 'grok' | 'gemini' | null;

export const AD_MIN_ANGLES = 3;
export const AD_MAX_ANGLES = 5;

export const AD_INPUT_LIMITS = {
  productName: 80,
  sellingPoints: 600,
  offer: 200,
  audience: 120,
} as const;

export const AD_LIMIT_RANGES = {
  headline: [8, 80] as const,
  body: [40, 2000] as const,
  cta: [4, 30] as const,
};

export interface AdLimits {
  headline: number;
  body: number;
  cta: number;
}

export interface AdBrief {
  productName: string;
  sellingPoints: string;
  offer: string;
  audience: string;
  goal: AdGoal;
  platform: AdPlatform;
  tone: AdTone;
  angleIds: AdAngleId[];
  limits: AdLimits;
  /** 每次「重新生成」+1；只影響 prompt 的換句式指示，不參與 stale 比對。 */
  variation: number;
}

export interface AdVariantCopy {
  hookType: string;
  headline: string;
  body: string;
  cta: string;
}

export interface AdAngleResult {
  id: AdAngleId;
  label: string;
  why: string;
  testVariable: string;
  variants: Record<AdVariantKey, AdVariantCopy>;
  ctaVariants: string[];
  /** AI 的 CTA 不足 3 個時，是否用通用 CTA 補齊。 */
  ctaPadded: boolean;
  /** 哪些欄位曾被 AI 輸出超過上限而修剪。 */
  truncatedFields: AdCopyField[];
}

export interface AdCreativeResult {
  brief: AdBrief;
  angles: AdAngleResult[];
  provider: AdProvider;
  model: string;
  latencyMs: number;
  generatedAt: string;
  warnings: string[];
}

export interface AdBriefIssue {
  field: 'productName' | 'sellingPoints' | 'offer' | 'audience' | 'limits' | 'angleIds';
  code: string;
  message: string;
}

export interface AdAngleDefinition {
  id: AdAngleId;
  label: string;
  description: string;
  needsOffer?: boolean;
  needsEvidence?: boolean;
}

export const AD_ANGLES: Record<AdAngleId, AdAngleDefinition> = {
  pain: {
    id: 'pain',
    label: '痛點切入',
    description: '先講中受眾的困擾，再用產品／服務提供解法。',
  },
  time: {
    id: 'time',
    label: '省時效率',
    description: '把流程、時間或步驟變短，適合忙碌、怕麻煩的族群。',
  },
  offer: {
    id: 'offer',
    label: '限時優惠',
    description: '用價格、折扣、期限或名額制造行動理由。',
    needsOffer: true,
  },
  proof: {
    id: 'proof',
    label: '專業背書',
    description: '用年資、認證、客戶數或獎項降低疑慮。',
    needsEvidence: true,
  },
  social: {
    id: 'social',
    label: '口碑見證',
    description: '用真實評價、案例或推薦人數建立信任。',
    needsEvidence: true,
  },
  contrast: {
    id: 'contrast',
    label: '對比煥新',
    description: '對比舊方法與新方法，突出今次選擇的分別。',
  },
};

export const AD_ANGLE_ORDER: readonly AdAngleId[] = AD_ANGLE_IDS;

export const AD_GOAL_LABELS: Record<AdGoal, string> = {
  conversion: '轉換購買',
  lead: '名單查詢',
  traffic: '網站流量',
  awareness: '品牌曝光',
};

export const AD_GOAL_HINTS: Record<AdGoal, string> = {
  conversion: 'CTA 以立即購買、查看優惠、輸入優惠碼為主。',
  lead: 'CTA 以立即查詢、預約諮詢、領取報價為主。',
  traffic: 'CTA 以了解更多、查看詳情、立即瀏覽為主。',
  awareness: 'CTA 以認識品牌、追蹤專頁、了解理念為主。',
};

export const AD_TONE_LABELS: Record<AdTone, string> = {
  professional: '專業可信',
  friendly: '親切溫暖',
  urgent: '急迫促銷',
  premium: '高級簡約',
};

export const AD_TONE_HINTS: Record<AdTone, string> = {
  professional: '用字準確、少誇張，重點講清楚好處與依據。',
  friendly: '像朋友解釋，短句、口語、少硬銷。',
  urgent: '突出期限、名額或今日行動，但不得制造虚假急迫。',
  premium: '語氣克制、重質感與細節，避免大減價式叫賣。',
};

export interface AdPlatformRule {
  id: AdPlatform;
  label: string;
  headlineLimit: number;
  bodyLimit: number;
  ctaLimit: number;
  note: string;
  promptHint: string;
}

export const AD_PLATFORM_RULES: Record<AdPlatform, AdPlatformRule> = {
  meta: {
    id: 'meta',
    label: 'Meta（FB／IG）',
    headlineLimit: 40,
    bodyLimit: 125,
    ctaLimit: 12,
    note: '主文超過 125 字會被「查看更多」截斷；標題建議 40 字內。',
    promptHint:
      'Meta 貼文：主文前 125 字是關鍵，標題 40 字內；不要 hashtag；不要 emoji 連發。',
  },
  google: {
    id: 'google',
    label: 'Google RSA',
    headlineLimit: 30,
    bodyLimit: 90,
    ctaLimit: 12,
    note: 'Google RSA 標題 30 字元、說明 90 字元；CTA 只作行動號召概念。',
    promptHint:
      'Google RSA：標題 30 字元、說明 90 字元；不要 emoji；CTA 只作行動號召概念，不假設有獨立 CTA 欄位。',
  },
  redbook: {
    id: 'redbook',
    label: '小紅書',
    headlineLimit: 20,
    bodyLimit: 1000,
    ctaLimit: 12,
    note: '小紅書標題 20 字內；正文可較長，但建議 2 段內。',
    promptHint:
      '小紅書：標題 20 字內、口語種草、最多 1 個 emoji；不要 hashtag。',
  },
};

export const AD_PLATFORM_ORDER: readonly AdPlatform[] = AD_PLATFORMS;
export const AD_GOAL_ORDER: readonly AdGoal[] = AD_GOALS;
export const AD_TONE_ORDER: readonly AdTone[] = AD_TONES;

export const AD_DEFAULT_ANGLE_IDS: readonly AdAngleId[] = ['pain', 'time', 'proof', 'social'];

export const AD_ERROR_MESSAGES: Record<string, string> = {
  invalid_input: '輸入未完整，請檢查產品名稱、賣點與切角。',
  unauthorized: '登入已逾時，請重新整理。',
  not_deployed: '生成服務未部署（404）：請先部署 ad-creative-writer。',
  config_missing: '系統未設定 Supabase 連線。',
  llm_not_configured: '系統未設定 AI，請聯絡管理員。',
  rate_limited: 'AI 額度暫時用盡，請 60 秒後再試。',
  timeout: '生成逾時，請重試；可先減少切角數。',
  bad_json: 'AI 回傳格式不符，已自動重試一次；請再試。',
  llm_unavailable: 'AI 暫時無法使用，請重試。',
  network: '網絡連線失敗，請檢查網絡後重試。',
  network_or_cors: '無法連線到生成服務，可能尚未部署或被瀏覽器阻擋。',
  empty_result: 'AI 沒有回傳可用的切角，請重試。',
};

export function adErrorMessage(code: string | null | undefined, fallback?: string): string {
  const key = String(code || '').trim();
  return AD_ERROR_MESSAGES[key] || fallback || '生成失敗，請重試。';
}

// ============================================================
// 小工具
// ============================================================

export function countChars(value: string | null | undefined): number {
  return Array.from(String(value ?? '')).length;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function isAdAngleId(value: unknown): value is AdAngleId {
  return typeof value === 'string' && (AD_ANGLE_IDS as readonly string[]).includes(value);
}

export function isAdPlatform(value: unknown): value is AdPlatform {
  return typeof value === 'string' && (AD_PLATFORMS as readonly string[]).includes(value);
}

export function isAdGoal(value: unknown): value is AdGoal {
  return typeof value === 'string' && (AD_GOALS as readonly string[]).includes(value);
}

export function isAdTone(value: unknown): value is AdTone {
  return typeof value === 'string' && (AD_TONES as readonly string[]).includes(value);
}

export function limitsForPlatform(platform: AdPlatform): AdLimits {
  const rule = AD_PLATFORM_RULES[platform] ?? AD_PLATFORM_RULES.meta;
  return {
    headline: rule.headlineLimit,
    body: rule.bodyLimit,
    cta: rule.ctaLimit,
  };
}

export function clampAdLimits(
  limits: Partial<AdLimits> | null | undefined,
  platform: AdPlatform,
): AdLimits {
  const preset = limitsForPlatform(platform);
  return {
    headline: clampInt(
      limits?.headline,
      AD_LIMIT_RANGES.headline[0],
      AD_LIMIT_RANGES.headline[1],
      preset.headline,
    ),
    body: clampInt(
      limits?.body,
      AD_LIMIT_RANGES.body[0],
      AD_LIMIT_RANGES.body[1],
      preset.body,
    ),
    cta: clampInt(
      limits?.cta,
      AD_LIMIT_RANGES.cta[0],
      AD_LIMIT_RANGES.cta[1],
      preset.cta,
    ),
  };
}

function cleanSingleLine(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function cleanMultiline(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, list) => line.length > 0 || (index > 0 && index < list.length - 1))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 切角選擇：移除不可用（例如沒有優惠時的 offer）、去重、補到至少 3 個、最多 5 個。
 * 若完全沒有選擇，預設取可用切角的前 4 個。
 */
export function resolveAngleSelection(
  selected: readonly AdAngleId[] | null | undefined,
  hasOffer: boolean,
): AdAngleId[] {
  const available = AD_ANGLE_ORDER.filter((id) => id !== 'offer' || hasOffer);
  const requested = Array.isArray(selected) ? selected.filter(isAdAngleId) : [];
  let result: AdAngleId[] = Array.from(new Set(requested)).filter((id) => available.includes(id));

  if (result.length === 0) {
    result = available.slice(0, 4);
  }

  if (result.length < AD_MIN_ANGLES) {
    for (const id of available) {
      if (result.length >= AD_MIN_ANGLES) break;
      if (!result.includes(id)) result.push(id);
    }
  }

  return result.slice(0, AD_MAX_ANGLES);
}

export function createDefaultAdBrief(platform: AdPlatform = 'meta'): AdBrief {
  return {
    productName: '',
    sellingPoints: '',
    offer: '',
    audience: '',
    goal: 'conversion',
    platform,
    tone: 'professional',
    angleIds: resolveAngleSelection(AD_DEFAULT_ANGLE_IDS, false),
    limits: limitsForPlatform(platform),
    variation: 0,
  };
}

export function normalizeAdBrief(input: Partial<AdBrief> | null | undefined): AdBrief {
  const platform = isAdPlatform(input?.platform) ? input.platform : 'meta';
  const goal = isAdGoal(input?.goal) ? input.goal : 'conversion';
  const tone = isAdTone(input?.tone) ? input.tone : 'professional';
  const offer = cleanSingleLine(input?.offer);

  return {
    productName: cleanSingleLine(input?.productName),
    sellingPoints: cleanMultiline(input?.sellingPoints),
    offer,
    audience: cleanSingleLine(input?.audience),
    goal,
    platform,
    tone,
    angleIds: resolveAngleSelection(input?.angleIds as AdAngleId[] | undefined, offer.length > 0),
    limits: clampAdLimits(input?.limits, platform),
    variation: clampInt(input?.variation, 0, 999, 0),
  };
}

export function validateAdBrief(brief: AdBrief): AdBriefIssue[] {
  const issues: AdBriefIssue[] = [];

  if (!brief.productName.trim()) {
    issues.push({
      field: 'productName',
      code: 'required',
      message: '請填寫產品／服務名稱',
    });
  } else if (countChars(brief.productName) > AD_INPUT_LIMITS.productName) {
    issues.push({
      field: 'productName',
      code: 'too_long',
      message: `產品／服務名稱不可超過 ${AD_INPUT_LIMITS.productName} 字`,
    });
  }

  if (!brief.sellingPoints.trim()) {
    issues.push({
      field: 'sellingPoints',
      code: 'required',
      message: '請至少填寫一個賣點',
    });
  } else if (countChars(brief.sellingPoints) > AD_INPUT_LIMITS.sellingPoints) {
    issues.push({
      field: 'sellingPoints',
      code: 'too_long',
      message: `賣點不可超過 ${AD_INPUT_LIMITS.sellingPoints} 字`,
    });
  }

  if (brief.offer && countChars(brief.offer) > AD_INPUT_LIMITS.offer) {
    issues.push({
      field: 'offer',
      code: 'too_long',
      message: `優惠條件不可超過 ${AD_INPUT_LIMITS.offer} 字`,
    });
  }

  if (brief.audience && countChars(brief.audience) > AD_INPUT_LIMITS.audience) {
    issues.push({
      field: 'audience',
      code: 'too_long',
      message: `目標受眾不可超過 ${AD_INPUT_LIMITS.audience} 字`,
    });
  }

  if (brief.angleIds.length < AD_MIN_ANGLES) {
    issues.push({
      field: 'angleIds',
      code: 'too_few_angles',
      message: `至少選 ${AD_MIN_ANGLES} 個切角`,
    });
  }
  if (brief.angleIds.length > AD_MAX_ANGLES) {
    issues.push({
      field: 'angleIds',
      code: 'too_many_angles',
      message: `最多選 ${AD_MAX_ANGLES} 個切角`,
    });
  }
  if (!brief.offer.trim() && brief.angleIds.includes('offer')) {
    issues.push({
      field: 'angleIds',
      code: 'offer_without_offer',
      message: '未填優惠條件，不能使用限時優惠切角',
    });
  }

  if (
    brief.limits.headline < AD_LIMIT_RANGES.headline[0] ||
    brief.limits.headline > AD_LIMIT_RANGES.headline[1]
  ) {
    issues.push({
      field: 'limits',
      code: 'headline_limit',
      message: `標題上限需在 ${AD_LIMIT_RANGES.headline[0]}–${AD_LIMIT_RANGES.headline[1]} 字之間`,
    });
  }
  if (
    brief.limits.body < AD_LIMIT_RANGES.body[0] ||
    brief.limits.body > AD_LIMIT_RANGES.body[1]
  ) {
    issues.push({
      field: 'limits',
      code: 'body_limit',
      message: `主文上限需在 ${AD_LIMIT_RANGES.body[0]}–${AD_LIMIT_RANGES.body[1]} 字之間`,
    });
  }
  if (
    brief.limits.cta < AD_LIMIT_RANGES.cta[0] ||
    brief.limits.cta > AD_LIMIT_RANGES.cta[1]
  ) {
    issues.push({
      field: 'limits',
      code: 'cta_limit',
      message: `CTA 上限需在 ${AD_LIMIT_RANGES.cta[0]}–${AD_LIMIT_RANGES.cta[1]} 字之間`,
    });
  }

  return issues;
}

// ============================================================
// 文字修剪（code point）
// ============================================================

const SENTENCE_BREAKS = new Set(['。', '！', '？', '!', '?', '；', ';', '\n']);
const CLAUSE_BREAKS = new Set(['，', ',', '、', '：', ':', ' ']);
const PROTECTED_PATTERN =
  /(?:https?:\/\/|www\.)[^\s，。；！？、]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;

interface ProtectedRange {
  start: number;
  end: number;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function protectedRanges(text: string): ProtectedRange[] {
  const ranges: ProtectedRange[] = [];
  for (const match of text.matchAll(PROTECTED_PATTERN)) {
    if (match.index === undefined) continue;
    const start = codePointLength(text.slice(0, match.index));
    const end = start + codePointLength(match[0]);
    ranges.push({ start, end });
  }
  return ranges;
}

function lastBreakAtOrBefore(
  chars: string[],
  cut: number,
  breaks: Set<string>,
  minCut: number,
): number {
  for (let index = Math.min(cut, chars.length); index > minCut; index -= 1) {
    if (breaks.has(chars[index - 1])) return index;
  }
  return -1;
}

export interface FitTextResult {
  text: string;
  truncated: boolean;
}

/**
 * 把文字修剪到 limit 個 code point 內：
 * - 先對齊句號／問號／分號，再退到逗號／頓號／空格，最後才硬切。
 * - URL／email 視為原子，不會在中間切斷。
 * - 截短時補「…」，總長不超過 limit。
 */
export function fitText(value: string, limit: number, options?: { singleLine?: boolean }): FitTextResult {
  const singleLine = options?.singleLine ?? false;
  let text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (singleLine) text = text.replace(/\s*\n+\s*/g, ' ').trim();

  const chars = Array.from(text);
  if (chars.length <= limit) return { text, truncated: false };
  if (!Number.isFinite(limit) || limit <= 0) return { text: '', truncated: true };
  if (limit === 1) return { text: chars[0] ?? '', truncated: true };

  const budget = limit - 1;
  let cut = budget;

  for (const range of protectedRanges(text)) {
    if (cut > range.start && cut < range.end) {
      cut = range.start;
      break;
    }
  }

  const minCut = Math.max(1, Math.floor(budget * 0.55));
  const sentenceCut = lastBreakAtOrBefore(chars, cut, SENTENCE_BREAKS, minCut);
  if (sentenceCut > 0) {
    cut = sentenceCut;
  } else {
    const clauseCut = lastBreakAtOrBefore(chars, cut, CLAUSE_BREAKS, minCut);
    if (clauseCut > 0) cut = clauseCut;
  }

  let body = chars
    .slice(0, cut)
    .join('')
    .replace(/[\s，,、；;：:]+$/g, '');

  if (!body) {
    body = chars.slice(0, Math.max(1, budget)).join('').replace(/\s+$/g, '');
  }

  let output = `${body}…`;
  if (codePointLength(output) > limit) {
    output = `${chars.slice(0, budget).join('').replace(/\s+$/g, '')}…`;
  }
  if (codePointLength(output) > limit) {
    output = chars.slice(0, limit).join('');
  }
  return { text: output, truncated: true };
}

// ============================================================
// Prompt
// ============================================================

export const AD_SYSTEM_PROMPT = `你是香港資深效果廣告文案主管，熟悉 Meta（FB／IG）、Google RSA、小紅書的廣告格式與香港市場語氣。
你只會根據使用者提供的資料寫文案，不會自行補充數字、客戶名、獎項、認證、評價、療效或推薦人數。
你只輸出一個合法 JSON 物件，不要 Markdown 圍欄、不要解釋、不要前言後語。
所有文字使用繁體中文（香港），避免簡體字與內地用語（例如質量、信息、視頻、空調、軟件）。`;

export const AD_OUTPUT_SCHEMA_EXAMPLE = {
  angles: [
    {
      id: 'pain',
      label: '痛點切入',
      why: '針對受眾的明確困擾切入。',
      testVariable: '開頭鉤子：痛點問句（A） vs 結果描述（B）',
      variants: {
        A: {
          hookType: '痛點問句',
          headline: '短標題 A',
          body: '主文 A',
          cta: 'CTA A',
        },
        B: {
          hookType: '結果描述',
          headline: '短標題 B',
          body: '主文 B',
          cta: 'CTA A',
        },
      },
      ctaVariants: ['CTA A', 'CTA B', 'CTA C'],
    },
  ],
};

export type AdPromptRetryReason = 'json' | 'angles' | 'truncated';

export interface BuildAdPromptOptions {
  retry?: AdPromptRetryReason;
  missingAngleIds?: AdAngleId[];
}

export function buildAdCreativePrompt(
  brief: AdBrief,
  options: BuildAdPromptOptions = {},
): string {
  const rule = AD_PLATFORM_RULES[brief.platform];
  const points = brief.sellingPoints
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  const lines: string[] = [];

  lines.push('## 本次廣告 brief');
  lines.push(`- 產品／服務：${brief.productName}`);
  lines.push('- 主要賣點：');
  if (points.length === 0) {
    lines.push('  - （未提供）');
  } else {
    points.forEach((point, index) => lines.push(`  ${index + 1}. ${point}`));
  }
  if (brief.offer.trim()) {
    lines.push(`- 優惠條件：${brief.offer}`);
  } else {
    lines.push('- 優惠條件：（未提供；不得提及任何優惠、折扣、期限、名額、價格減免或「限時」）');
  }
  if (brief.audience.trim()) {
    lines.push(`- 目標受眾：${brief.audience}`);
  } else {
    lines.push('- 目標受眾：（未提供；用「你」或一般香港讀者，不要自行捏造年齡、性別、職業）');
  }
  lines.push(`- 投放目標：${AD_GOAL_LABELS[brief.goal]}（${brief.goal}）`);
  lines.push(`- 投放平台：${rule.label}`);
  lines.push(`- 語氣：${AD_TONE_LABELS[brief.tone]}`);
  lines.push(
    `- 指定切角（必須且只可以輸出這些，順序一致）：${brief.angleIds
      .map((id) => `${AD_ANGLES[id].label}（${id}）`)
      .join('、')}`,
  );
  lines.push(
    `- 長度上限（以 code point 計，中文／emoji 各算 1）：標題 ≤ ${brief.limits.headline}；主文 ≤ ${brief.limits.body}；每個 CTA ≤ ${brief.limits.cta}`,
  );
  lines.push(`- 平台規則：${rule.promptHint}`);
  lines.push(`- 目標提示：${AD_GOAL_HINTS[brief.goal]}`);
  lines.push(`- 語氣提示：${AD_TONE_HINTS[brief.tone]}`);

  lines.push('');
  lines.push('## 切角庫與判斷');
  for (const id of brief.angleIds) {
    const angle = AD_ANGLES[id];
    lines.push(`- ${angle.label}（${angle.id}）：${angle.description}`);
  }

  lines.push('');
  lines.push('## 輸出規則');
  lines.push(
    `1. 只輸出 ${brief.angleIds.length} 個切角，id 必須是 ${brief.angleIds.join('、')}，不可多、不可少、不可改順序。`,
  );
  lines.push(
    '2. 每個切角要有 why（≤40 字）、testVariable（≤40 字）、variants.A、variants.B、ctaVariants（3 個）。',
  );
  lines.push(
    '3. A/B 是單一變數測試：主文核心（賣點、優惠、CTA）相同；只改標題與開頭 1–2 句；A 用痛點／問句鉤子，B 用結果／數字鉤子（沒有數字時用結果描述）。',
  );
  lines.push('4. 標題不可換行；CTA 不可換行；主文最多 2 段，用 \\n 分段。');
  lines.push(
    `5. 不可超過長度上限：標題 ${brief.limits.headline}、主文 ${brief.limits.body}、CTA ${brief.limits.cta}。`,
  );
  lines.push('6. 不可自行補充 brief 沒有的數字、客戶名、獎項、認證、評價、推薦人數、療效或「全港第一」等絕對化字眼。');
  lines.push('7. 沒有提供優惠時，不可提及優惠、折扣、期限、名額或「限時」。');
  lines.push('8. 沒有提供證明／口碑資料時，不可提及年資、客戶數、獎項、認證、評價、口碑或推薦人數。');
  lines.push('9. 不要貶低對手、不要制造虚假急迫、不要醫療療效、不要 hashtag、不要圖片建議、不要預算建議。');
  lines.push('10. 所有欄位使用繁體中文（香港）；產品名稱原樣保留；不要輸出 JSON 以外的任何文字。');

  if (brief.variation > 0) {
    lines.push(
      `11. 這是第 ${brief.variation + 1} 次生成；請換不同的開頭、句式與 CTA 組合，避免與上一版重複。`,
    );
  }

  lines.push('');
  lines.push('## 輸出 JSON 格式（只輸出這個物件）');
  lines.push(JSON.stringify(AD_OUTPUT_SCHEMA_EXAMPLE, null, 2));

  if (options.retry === 'json') {
    lines.push('');
    lines.push(
      '## 修正指示：上一次輸出不是合法 JSON 或被截斷。請只輸出一個完整 JSON 物件，不要 Markdown 圍欄、不要解釋；必要時縮短每個欄位。',
    );
  } else if (options.retry === 'angles') {
    const missing = (options.missingAngleIds ?? [])
      .map((id) => `${AD_ANGLES[id].label}（${id}）`)
      .join('、');
    lines.push('');
    lines.push(
      `## 修正指示：上一次缺少以下切角：${missing || '（全部）'}。請補齊，其他已合格的切角不用重複。`,
    );
  } else if (options.retry === 'truncated') {
    lines.push('');
    lines.push(
      '## 修正指示：上一次輸出被截斷或欄位過長。請縮短每個欄位，確保 JSON 完整閉合。',
    );
  }

  return lines.join('\n');
}

// ============================================================
// 解析 AI 回應
// ============================================================

export type AdCreativeParseCode = 'invalid_json' | 'invalid_shape' | 'angles_insufficient';

export class AdCreativeParseError extends Error {
  readonly code: AdCreativeParseCode;
  readonly missingAngleIds?: AdAngleId[];

  constructor(
    code: AdCreativeParseCode,
    message: string,
    options: { missingAngleIds?: AdAngleId[] } = {},
  ) {
    super(message);
    this.name = 'AdCreativeParseError';
    this.code = code;
    this.missingAngleIds = options.missingAngleIds;
  }
}

const ANGLE_ALIASES: Record<string, AdAngleId> = {
  pain: 'pain',
  '痛點': 'pain',
  '痛點切入': 'pain',
  '痛點式': 'pain',
  time: 'time',
  '省時': 'time',
  '省時效率': 'time',
  '效率': 'time',
  offer: 'offer',
  '優惠': 'offer',
  '限時優惠': 'offer',
  '優惠促銷': 'offer',
  proof: 'proof',
  '背書': 'proof',
  '專業背書': 'proof',
  '專業': 'proof',
  social: 'social',
  '口碑': 'social',
  '口碑見證': 'social',
  '見證': 'social',
  contrast: 'contrast',
  '對比': 'contrast',
  '對比煥新': 'contrast',
  '煥新': 'contrast',
};

function resolveAngleId(value: unknown): AdAngleId | null {
  if (isAdAngleId(value)) return value;
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  if (ANGLE_ALIASES[key]) return ANGLE_ALIASES[key];
  const raw = value.trim();
  if (ANGLE_ALIASES[raw]) return ANGLE_ALIASES[raw];
  const match = AD_ANGLE_IDS.find((id) => raw.includes(AD_ANGLES[id].label));
  return match ?? null;
}

function cleanGeneratedText(value: unknown, singleLine = false): string {
  if (typeof value !== 'string') return '';
  let text = value.replace(/\r\n?/g, '\n').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  text = text.replace(/^\s*[-*•]\s+/gm, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^["“”'](.*)["“”']$/s, '$1');
  text = text.replace(/[ \t]+/g, ' ');
  if (singleLine) text = text.replace(/\s*\n+\s*/g, ' ');
  else text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function parseJsonValue(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') {
    throw new AdCreativeParseError('invalid_json', 'AI 沒有回傳內容');
  }

  const trimmed = raw.trim();
  if (!trimmed) throw new AdCreativeParseError('invalid_json', 'AI 沒有回傳內容');

  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const candidate = (fenced ? fenced[1] : trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
  }

  throw new AdCreativeParseError('invalid_json', 'AI 輸出不是合法 JSON');
}

function unwrapPayload(raw: unknown): Record<string, unknown> {
  const parsed = parseJsonValue(raw);
  if (Array.isArray(parsed)) return { angles: parsed };
  if (!parsed || typeof parsed !== 'object') {
    throw new AdCreativeParseError('invalid_shape', 'AI 輸出的不是物件');
  }
  const row = parsed as Record<string, unknown>;
  if (row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
    return row.data as Record<string, unknown>;
  }
  return row;
}

function readVariant(
  raw: unknown,
  limits: AdLimits,
): { copy: AdVariantCopy; truncatedFields: AdCopyField[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const headline = cleanGeneratedText(row.headline, true);
  const body = cleanGeneratedText(row.body, false);
  const cta = cleanGeneratedText(row.cta, true);
  if (!headline || !body || !cta) return null;

  const headlineFit = fitText(headline, limits.headline, { singleLine: true });
  const bodyFit = fitText(body, limits.body);
  const ctaFit = fitText(cta, limits.cta, { singleLine: true });

  if (!headlineFit.text || !bodyFit.text || !ctaFit.text) return null;

  const truncatedFields: AdCopyField[] = [];
  if (headlineFit.truncated) truncatedFields.push('headline');
  if (bodyFit.truncated) truncatedFields.push('body');
  if (ctaFit.truncated) truncatedFields.push('cta');

  return {
    copy: {
      hookType: cleanGeneratedText(row.hookType, true) || '未標示',
      headline: headlineFit.text,
      body: bodyFit.text,
      cta: ctaFit.text,
    },
    truncatedFields,
  };
}

const FALLBACK_CTAS: Record<AdGoal, string[]> = {
  conversion: ['立即購買', '查看優惠', '輸入優惠碼'],
  lead: ['立即查詢', '預約諮詢', '領取報價'],
  traffic: ['了解更多', '查看詳情', '立即瀏覽'],
  awareness: ['認識品牌', '追蹤專頁', '了解理念'],
};

function buildCtas(
  raw: unknown,
  limit: number,
  goal: AdGoal,
): { ctas: string[]; padded: boolean } {
  const source = Array.isArray(raw) ? raw : [];
  const result: string[] = [];
  for (const item of source) {
    if (typeof item !== 'string') continue;
    const clean = cleanGeneratedText(item, true);
    if (!clean) continue;
    const fit = fitText(clean, limit, { singleLine: true });
    if (!fit.text) continue;
    if (result.includes(fit.text)) continue;
    result.push(fit.text);
    if (result.length >= 3) break;
  }

  let padded = false;
  if (result.length < 3) {
    padded = true;
    for (const fallback of FALLBACK_CTAS[goal]) {
      if (result.length >= 3) break;
      const fit = fitText(fallback, limit, { singleLine: true });
      if (fit.text && !result.includes(fit.text)) result.push(fit.text);
    }
  }

  return { ctas: result, padded };
}

function stripFirstSentence(text: string): string {
  const index = text.search(/[。！？!?\n]/);
  if (index < 0) return '';
  return text.slice(index + 1).trim();
}

function bigrams(text: string): Set<string> {
  const chars = Array.from(text.replace(/\s+/g, ''));
  const result = new Set<string>();
  for (let index = 0; index < chars.length - 1; index += 1) {
    result.add(`${chars[index]}${chars[index + 1]}`);
  }
  return result;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function briefNumbers(brief: AdBrief): Set<string> {
  const text = [brief.productName, brief.sellingPoints, brief.offer, brief.audience].join('\n');
  const matches = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return new Set(matches.map((value) => value.replace(/,/g, '')));
}

function collectUnverifiedNumbers(brief: AdBrief, texts: string[]): string[] {
  const known = briefNumbers(brief);
  const unknown = new Set<string>();
  const numberPattern =
    /\d+(?:[.,]\d+)?\s*(?:%|％|折|元|蚊|年|個月|月|日|天|小時|分鐘|秒|位|個|次|萬|千)?/g;

  for (const text of texts) {
    const matches = text.match(numberPattern) ?? [];
    for (const match of matches) {
      const digits = (match.match(/\d+(?:[.,]\d+)?/) ?? [''])[0].replace(/,/g, '');
      if (!digits) continue;
      if (!known.has(digits)) unknown.add(match.trim());
    }
  }
  return Array.from(unknown).slice(0, 6);
}

const ABSOLUTE_CLAIM_PATTERN =
  /(全港第一|業界第一|全港最|業界最|第一|唯一|保證|永久|根治|療效|100\s*%|必瘦|必好|零風險|無敵)/g;

function collectAbsoluteClaims(texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    const matches = text.match(ABSOLUTE_CLAIM_PATTERN) ?? [];
    for (const match of matches) found.add(match.trim());
  }
  return Array.from(found).slice(0, 6);
}

export interface ParseAdCreativeOptions {
  brief: AdBrief;
  provider?: AdProvider;
  model?: string;
  latencyMs?: number;
  generatedAt?: string;
}

/**
 * 把 AI 原始回應收斂成 UI 可用的矩陣。
 * - 只保留指定切角；缺 3 個以上直接丟錯，讓函式 retry。
 * - A/B 必須齊全；缺一個就丟該切角。
 * - 超長欄位用 fitText 修剪，並記錄 truncatedFields。
 * - 不修改語意，只做安全修剪與 warning。
 */
export function parseAdCreativeResponse(
  raw: unknown,
  options: ParseAdCreativeOptions,
): AdCreativeResult {
  const brief = normalizeAdBrief(options.brief);
  const payload = unwrapPayload(raw);
  const rawAngles = Array.isArray(payload.angles) ? payload.angles : [];
  const warnings: string[] = [];
  const parsed = new Map<AdAngleId, AdAngleResult>();
  const extraIds = new Set<AdAngleId>();

  for (const item of rawAngles) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = resolveAngleId(row.id) ?? resolveAngleId(row.label);
    if (!id) continue;

    if (!brief.angleIds.includes(id)) {
      extraIds.add(id);
      continue;
    }
    if (parsed.has(id)) continue;

    const why = cleanGeneratedText(row.why, true) || AD_ANGLES[id].description;
    const testVariable =
      cleanGeneratedText(row.testVariable, true) || '開頭鉤子：A／B 兩版';

    const rawVariants =
      row.variants && typeof row.variants === 'object'
        ? (row.variants as Record<string, unknown>)
        : {};
    const variantA = readVariant(rawVariants.A ?? rawVariants.a, brief.limits);
    const variantB = readVariant(rawVariants.B ?? rawVariants.b, brief.limits);
    if (!variantA || !variantB) continue;

    const ctaResult = buildCtas(row.ctaVariants, brief.limits.cta, brief.goal);
    const truncatedFields = Array.from(
      new Set<AdCopyField>([...variantA.truncatedFields, ...variantB.truncatedFields]),
    );

    parsed.set(id, {
      id,
      label: AD_ANGLES[id].label,
      why: fitText(why, 60, { singleLine: true }).text,
      testVariable: fitText(testVariable, 60, { singleLine: true }).text,
      variants: { A: variantA.copy, B: variantB.copy },
      ctaVariants: ctaResult.ctas,
      ctaPadded: ctaResult.padded,
      truncatedFields,
    });
  }

  const angles = brief.angleIds
    .map((id) => parsed.get(id))
    .filter((angle): angle is AdAngleResult => Boolean(angle));

  if (angles.length < AD_MIN_ANGLES) {
    const missingForRetry = brief.angleIds.filter((id) => !parsed.has(id));
    throw new AdCreativeParseError(
      'angles_insufficient',
      `AI 只回傳 ${angles.length} 個有效切角，至少需要 ${AD_MIN_ANGLES} 個`,
      { missingAngleIds: missingForRetry.length > 0 ? missingForRetry : brief.angleIds },
    );
  }

  const missing = brief.angleIds.filter((id) => !parsed.has(id));
  if (missing.length > 0) {
    warnings.push(`AI 未回傳指定切角：${missing.map((id) => AD_ANGLES[id].label).join('、')}`);
  }
  if (extraIds.size > 0) {
    warnings.push(`AI 多回了未指定的切角，已忽略：${Array.from(extraIds).map((id) => AD_ANGLES[id].label).join('、')}`);
  }

  const truncatedCount = angles.reduce((sum, angle) => sum + angle.truncatedFields.length, 0);
  if (truncatedCount > 0) {
    warnings.push(`${truncatedCount} 個欄位已按上限縮短`);
  }

  const allTexts: string[] = [];
  for (const angle of angles) {
    allTexts.push(angle.why, angle.testVariable);
    for (const variant of AD_VARIANTS) {
      const copy = angle.variants[variant];
      allTexts.push(copy.headline, copy.body, copy.cta);
    }
  }
  if (angles.some((angle) => angle.ctaPadded)) {
    warnings.push('AI 未提供足夠 CTA，已補上通用選項');
  }

  const unverified = collectUnverifiedNumbers(brief, allTexts);
  if (unverified.length > 0) {
    warnings.push(`文案含未在輸入出現的數字：${unverified.join('、')}，請核對`);
  }

  const claims = collectAbsoluteClaims(allTexts);
  if (claims.length > 0) {
    warnings.push(`文案含絕對化／療效字眼：${claims.join('、')}，請人手核對`);
  }

  for (const angle of angles) {
    const a = angle.variants.A;
    const b = angle.variants.B;
    if (a.headline === b.headline) {
      warnings.push(`${angle.label}：A/B 標題相同，較難判斷測試變數`);
    }
    const bodyA = stripFirstSentence(a.body);
    const bodyB = stripFirstSentence(b.body);
    if (bodyA.length > 20 && bodyB.length > 20) {
      const similarity = jaccard(bigrams(bodyA), bigrams(bodyB));
      if (similarity < 0.35) {
        warnings.push(
          `${angle.label}：A/B 主文差異較大，較像兩版獨立文案；如要做單一變數測試，建議手動統一主文`,
        );
      }
    }
  }

  const provider =
    options.provider ??
    (payload.provider === 'grok' || payload.provider === 'gemini' ? payload.provider : null);
  const model =
    options.model ??
    (typeof payload.model === 'string' ? payload.model : '');
  const latencyMs =
    options.latencyMs ??
    (typeof payload.latencyMs === 'number' ? payload.latencyMs : 0);
  const generatedAt =
    options.generatedAt ??
    (typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString());

  return {
    brief,
    angles,
    provider,
    model,
    latencyMs,
    generatedAt,
    warnings: Array.from(new Set(warnings)),
  };
}

// ============================================================
// 編輯覆寫、CSV、可讀文字
// ============================================================

export type AdCopyOverrides = Record<string, string>;

export function adCopyKey(
  angleId: AdAngleId,
  variant: AdVariantKey,
  field: AdCopyField,
): string {
  return `${angleId}:${variant}:${field}`;
}

export function applyAdCopyOverrides(
  result: AdCreativeResult,
  overrides: AdCopyOverrides,
): AdCreativeResult {
  const hasOverrides = Object.keys(overrides).length > 0;
  if (!hasOverrides) return result;

  return {
    ...result,
    angles: result.angles.map((angle) => ({
      ...angle,
      variants: {
        A: applyVariantOverrides(angle.id, 'A', angle.variants.A, overrides),
        B: applyVariantOverrides(angle.id, 'B', angle.variants.B, overrides),
      },
    })),
  };
}

function applyVariantOverrides(
  angleId: AdAngleId,
  variant: AdVariantKey,
  copy: AdVariantCopy,
  overrides: AdCopyOverrides,
): AdVariantCopy {
  const next = { ...copy };
  for (const field of ['headline', 'body', 'cta'] as const) {
    const key = adCopyKey(angleId, variant, field);
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      next[field] = overrides[key];
    }
  }
  return next;
}

export const AD_CSV_HEADERS = [
  '切角',
  '切角說明',
  '測試變數',
  '版本',
  '鉤子類型',
  '短標題',
  '主文',
  'CTA',
  'CTA 變體',
  '標題字數',
  '主文字數',
  '平台',
  '標題上限',
  '主文上限',
  '生成時間',
] as const;

export type AdCsvRow = Record<string, string | number>;

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function buildAdCsvRows(result: AdCreativeResult): AdCsvRow[] {
  const rule = AD_PLATFORM_RULES[result.brief.platform];
  const rows: AdCsvRow[] = [];

  for (const angle of result.angles) {
    for (const variant of AD_VARIANTS) {
      const copy = angle.variants[variant];
      rows.push({
        切角: angle.label,
        切角說明: angle.why,
        測試變數: angle.testVariable,
        版本: variant,
        鉤子類型: copy.hookType,
        短標題: copy.headline,
        主文: copy.body,
        CTA: copy.cta,
        'CTA 變體': angle.ctaVariants.join(' / '),
        標題字數: countChars(copy.headline),
        主文字數: countChars(copy.body),
        平台: rule.label,
        標題上限: result.brief.limits.headline,
        主文上限: result.brief.limits.body,
        生成時間: formatDateTime(result.generatedAt),
      });
    }
  }

  return rows;
}

function escapeCsvCell(value: string | number): string {
  let text = String(value ?? '');
  // CSV injection：Excel 會把 = + - @ 開頭的 cell 當公式。
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: AdCsvRow[]): string {
  const header = AD_CSV_HEADERS.map((key) => escapeCsvCell(key)).join(',');
  const body = rows.map((row) =>
    AD_CSV_HEADERS.map((key) => escapeCsvCell(row[key] ?? '')).join(','),
  );
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

export function safeFilenamePart(value: string): string {
  return String(value ?? '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function buildCsvFilename(productName: string, date: Date = new Date()): string {
  const safe = safeFilenamePart(productName) || 'ad-copy';
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}`;
  return `ad-copy-matrix-${safe}-${stamp}.csv`;
}

export function providerLabel(provider: AdProvider): string {
  if (provider === 'grok') return 'Grok';
  if (provider === 'gemini') return 'Gemini';
  return 'AI';
}

export function buildAdCopyAllText(result: AdCreativeResult): string {
  const rule = AD_PLATFORM_RULES[result.brief.platform];
  const lines: string[] = [];
  lines.push('AI文案工坊｜文案多角度轉寫');
  lines.push(`產品：${result.brief.productName}`);
  lines.push(
    `平台：${rule.label}｜目標：${AD_GOAL_LABELS[result.brief.goal]}｜語氣：${
      AD_TONE_LABELS[result.brief.tone]
    }`,
  );
  lines.push(
    `生成：${providerLabel(result.provider)}${
      result.model ? ` / ${result.model}` : ''
    } / ${formatDateTime(result.generatedAt)}`,
  );
  lines.push('');

  result.angles.forEach((angle, index) => {
    lines.push(`【${index + 1}. ${angle.label}】測試變數：${angle.testVariable}`);
    lines.push(`為何用：${angle.why}`);
    for (const variant of AD_VARIANTS) {
      const copy = angle.variants[variant];
      lines.push(`${variant} 版（${copy.hookType}）`);
      lines.push(`標題：${copy.headline}`);
      lines.push(`主文：${copy.body}`);
      lines.push(`CTA：${copy.cta}`);
    }
    lines.push(`CTA 變體：${angle.ctaVariants.join(' / ')}`);
    lines.push('');
  });

  return lines.join('\n').trim();
}

export function buildAdMatrixTsv(result: AdCreativeResult): string {
  const rows = buildAdCsvRows(result);
  const header = AD_CSV_HEADERS.join('\t');
  const body = rows.map((row) =>
    AD_CSV_HEADERS.map((key) =>
      String(row[key] ?? '')
        .replace(/\t/g, ' ')
        .replace(/\r?\n/g, ' '),
    ).join('\t'),
  );
  return [header, ...body].join('\n');
}

export function buildVariantText(
  angle: AdAngleResult,
  variant: AdVariantKey,
  productName = '',
): string {
  const copy = angle.variants[variant];
  const lines: string[] = [];
  if (productName) lines.push(`產品：${productName}`);
  lines.push(`【${angle.label}・${variant} 版】測試變數：${angle.testVariable}`);
  lines.push(`標題：${copy.headline}`);
  lines.push(`主文：${copy.body}`);
  lines.push(`CTA：${copy.cta}`);
  return lines.join('\n');
}
