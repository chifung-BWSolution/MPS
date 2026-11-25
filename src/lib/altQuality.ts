/**
 * ALT Pilot · 品質規則
 *
 * 硬規則 = 不可批准（空、超長、關鍵字堆砌、重複、語言錯、檔名外洩、HTML）。
 * 軟規則 = 扣分與提示（太短、沒有視覺細節、照抄標題、全大寫、與頁面無關）。
 *
 * 分數只用作排序與提示，不會自動批准。
 */

import {
  cjkRatio,
  containsCjk,
  countChars,
  normalizeForCompare,
} from './altText.ts';
import type {
  AltImageCandidate,
  AltIssue,
  AltPageContext,
  AltRisk,
} from './altTypes.ts';

export interface AltQualityInput {
  alt: string;
  page: AltPageContext;
  image: AltImageCandidate;
  keyword?: string;
  /** 同頁其他建議（不含這一張），用來偵測重複。 */
  existingAlts?: string[];
  decorative?: boolean;
}

export interface AltQualityResult {
  issues: AltIssue[];
  score: number;
  risk: AltRisk;
}

const HARD_PENALTY = 40;
const SOFT_PENALTY = 8;

const GENERIC_PREFIX = /^(圖片|照片|圖像|相片|image|photo|picture|pic)(\s|$|[：:，,、-])/i;
const FILENAME_ONLY = /^img[_-]?\d+$/i;
const VISUAL_DETAIL =
  /(紅|橙|黃|綠|藍|紫|粉|黑|白|灰|金|銀|木|石|玻璃|金屬|不鏽鋼|水泥|混凝土|布|皮|光|影|窗|門|牆|地板|天花|燈|桌|椅|櫃|床|沙發|植物|花|樹|人|設計師|客戶|團隊|男|女|手|站|坐|走|討論|閱讀|示範|施工|安裝|種植|煮|喝|吃|長條圖|圓餅圖|折線圖|散點圖|表格|地圖|標誌|logo|red|orange|yellow|green|blue|purple|pink|black|white|grey|gray|gold|silver|wood|stone|glass|metal|steel|concrete|fabric|leather|light|shadow|window|door|wall|floor|ceiling|lamp|desk|chair|table|sofa|plant|tree|person|people|designer|client|team|standing|sitting|walking|discussing|reading|installing|chart|graph|map|\d+)/i;

function addIssue(
  issues: AltIssue[],
  id: string,
  severity: 'hard' | 'soft',
  message: string,
): void {
  issues.push({ id, severity, message });
}

function countOccurrences(text: string, needle: string): number {
  const haystack = String(text ?? '').toLowerCase();
  const target = String(needle ?? '').toLowerCase().trim();
  if (!haystack || !target) return 0;
  let count = 0;
  let index = 0;
  while (index <= haystack.length - target.length) {
    const found = haystack.indexOf(target, index);
    if (found === -1) break;
    count += 1;
    index = found + target.length;
  }
  return count;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return 1 - levenshtein(a, b) / max;
}

function bigrams(value: string): Set<string> {
  const normalized = normalizeForCompare(value);
  const chars = Array.from(normalized);
  const result = new Set<string>();
  for (let i = 0; i < chars.length - 1; i += 1) {
    result.add(chars[i] + chars[i + 1]);
  }
  return result;
}

function sharesTopicWithPage(alt: string, page: AltPageContext, keyword: string): boolean {
  const altTokens = bigrams(alt);
  if (altTokens.size === 0) return false;
  const pageTokens = bigrams(
    [page.title, page.h1, ...page.h2s, keyword].filter(Boolean).join(' '),
  );
  for (const token of altTokens) {
    if (pageTokens.has(token)) return true;
  }
  return false;
}

function effectiveLanguage(page: AltPageContext): 'zh' | 'en' | 'other' {
  if (/^zh/i.test(page.lang || '')) return 'zh';
  if (/^en/i.test(page.lang || '')) return 'en';
  return 'other';
}

/**
 * 評估單一 ALT。`decorative` 由模型或 DOM 判斷；裝飾圖允許空字串。
 */
export function evaluateAlt(input: AltQualityInput): AltQualityResult {
  const alt = String(input.alt ?? '').trim();
  const decorative = Boolean(input.decorative ?? input.image.decorative);
  const keyword = String(input.keyword ?? '').trim();
  const language = effectiveLanguage(input.page);
  const normalized = normalizeForCompare(alt);
  const issues: AltIssue[] = [];

  if (!decorative && !alt) {
    addIssue(issues, 'empty', 'hard', '非裝飾圖的 ALT 不可空白。');
  }

  if (alt) {
    if (countChars(alt) > 125) {
      addIssue(issues, 'too_long', 'hard', `ALT 長度 ${countChars(alt)} 字元，超過 125 上限。`);
    }
    if (GENERIC_PREFIX.test(alt)) {
      addIssue(issues, 'generic_prefix', 'hard', '不要以「圖片／照片／image」開頭。');
    }
    if (/<[^>]+>/.test(alt)) {
      addIssue(issues, 'html', 'hard', 'ALT 不可包含 HTML 標籤。');
    }
    if (FILENAME_ONLY.test(normalized) || normalized === normalizeForCompare(input.image.filename)) {
      addIssue(issues, 'filename_leak', 'hard', 'ALT 不可直接等於檔名。');
    }

    const duplicates = (input.existingAlts || [])
      .map((item) => normalizeForCompare(item))
      .filter(Boolean);
    if (normalized && duplicates.includes(normalized)) {
      addIssue(issues, 'duplicate', 'hard', '與同頁其他圖片的 ALT 重複。');
    }

    if (keyword) {
      const occurrences = countOccurrences(alt, keyword);
      if (occurrences > 1) {
        addIssue(issues, 'keyword_stuffing', 'hard', `主關鍵字出現 ${occurrences} 次，超過一次。`);
      } else if (normalized && normalized === normalizeForCompare(keyword)) {
        addIssue(issues, 'keyword_stuffing', 'hard', 'ALT 不可以只有主關鍵字。');
      }
    }

    if (language === 'zh' && cjkRatio(alt) < 0.2 && countChars(alt) >= 8) {
      addIssue(issues, 'language_mismatch', 'hard', '頁面是中文，但 ALT 幾乎全英文。');
    }
    if (language === 'en' && cjkRatio(alt) > 0.5) {
      addIssue(issues, 'language_mismatch', 'hard', '頁面是英文，但 ALT 以中文為主。');
    }

    if (!decorative) {
      const minChars = language === 'en' ? 25 : 12;
      if (countChars(alt) < minChars) {
        addIssue(issues, 'too_short', 'soft', `ALT 只有 ${countChars(alt)} 字元，可能過短。`);
      }
      if (!VISUAL_DETAIL.test(alt)) {
        addIssue(issues, 'no_visual_detail', 'soft', '沒有明顯的視覺細節（物件／材質／顏色／動作）。');
      }
      if (input.image.nearbyCaption && normalizeForCompare(input.image.nearbyCaption) === normalized) {
        addIssue(issues, 'caption_copy', 'soft', '與圖片下方 caption 逐字重複。');
      }
      if (
        !keyword &&
        (input.page.title || input.page.h1) &&
        !sharesTopicWithPage(alt, input.page, '')
      ) {
        addIssue(issues, 'no_page_link', 'soft', '與頁面主題沒有明顯關聯。');
      }
    }

    if (input.page.h1) {
      const titleSimilarity = similarity(normalized, normalizeForCompare(input.page.h1));
      if (titleSimilarity >= 0.82) {
        addIssue(issues, 'title_copy', 'soft', '與 H1 過於相似，沒有補充畫面資訊。');
      }
    }

    const latinOnly = !containsCjk(alt) && /[A-Z]/.test(alt);
    if (latinOnly && alt.length > 6 && alt === alt.toUpperCase()) {
      addIssue(issues, 'all_caps', 'soft', '英文 ALT 不建議全大寫。');
    }
  }

  const hardCount = issues.filter((issue) => issue.severity === 'hard').length;
  const softCount = issues.filter((issue) => issue.severity === 'soft').length;
  const score = Math.max(0, 100 - hardCount * HARD_PENALTY - softCount * SOFT_PENALTY);
  const risk: AltRisk = hardCount > 0 || score < 60 ? 'high' : score < 80 ? 'medium' : 'low';

  return { issues, score, risk };
}

/** 把模型自帶的 issues 轉成同一個結構，方便存入 jsonb 與 UI 顯示。 */
export function normalizeModelIssues(values: string[] | undefined): AltIssue[] {
  return (values || [])
    .map((message) => String(message || '').trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((message) => ({ id: 'model_note', severity: 'soft' as const, message }));
}

export function combineIssues(issues: AltIssue[], modelIssues: AltIssue[]): AltIssue[] {
  const seen = new Set<string>();
  const result: AltIssue[] = [];
  for (const issue of [...issues, ...modelIssues]) {
    const key = `${issue.id}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}
