/**
 * 熱點聚簇（參考 AIHOT 的「候選 → 模型判斷 → 聚成事件」）
 *
 * 為什麼不能只比 URL：
 *   Google News 同一件事常有不同媒體、不同連結；URL 不同，標題措辭也不同。
 *   這裡先用「中文 bigram + 英數詞」的重合度找候選，再由 Grok 判斷是否同一事件；
 *   同一事件只留一個 content_hot_events，其餘報導掛到 content_hot_items。
 *
 * 純函式，Deno 與 Node 皆可載入。
 */

import {
  blendedSimilarity,
  charBigrams,
  hamming,
  normalizeTitle,
  simhash,
} from './contentSocialDedupe.ts';

/** 這些詞在新聞標題裡很常見，會讓不同事件看起來很像，先剔除 */
const STOPWORDS = new Set([
  '的', '了', '是', '在', '有', '和', '與', '及', '這', '那', '你', '我', '他', '她', '它',
  '們', '個', '款', '種', '如何', '什麼', '怎樣', '為何', '可以', '沒有', '一個', '一次',
  '推薦', '推介', '必買', '優惠', '折扣', '折', '懶人包', '開箱', '實測', '分享', '整理',
  '香港', '新聞', '報導', '記者', '編輯', '獨家', '最新', '2026', '2025',
]);

function pushBigrams(target: Set<string>, text: string): void {
  const chars = [...text];
  for (let index = 0; index < chars.length - 1; index += 1) {
    const gram = chars[index] + chars[index + 1];
    if (!STOPWORDS.has(gram)) target.add(gram);
  }
}

/** 中文用 bigram、英文用單詞；去掉促銷／通用詞，留下品牌、人物、產品等辨識詞 */
export function clusterTokens(title: string): Set<string> {
  const normalized = normalizeTitle(title);
  const tokens = new Set<string>();
  pushBigrams(tokens, normalized);
  for (const word of normalized.match(/[a-z]{2,}/g) ?? []) {
    if (!STOPWORDS.has(word)) tokens.add(word);
  }
  return tokens;
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

/**
 * 0–1 的相似度：文字重合度為主，simhash 距離為輔。
 * 標題很短時 simhash 不穩，所以權重壓低。
 */
export function titleSimilarity(titleA: string, titleB: string): number {
  const tokensA = clusterTokens(titleA);
  const tokensB = clusterTokens(titleB);
  const overlap = jaccard(tokensA, tokensB);
  const hashScore = 1 - hamming(simhash(titleA), simhash(titleB)) / 64;
  return Math.round((overlap * 0.65 + hashScore * 0.35) * 1000) / 1000;
}

/** 0.75 以上視為幾乎同一標題，直接合併；0.32–0.75 交给模型判斷 */
export const STRONG_MATCH = 0.75;
export const WEAK_MATCH = 0.32;

export interface ClusterCandidate<T> {
  item: T;
  score: number;
}

export function findBestCandidate<T>(
  title: string,
  items: readonly T[],
  titleOf: (item: T) => string,
): ClusterCandidate<T> | null {
  const [best] = findTopCandidates(title, items, titleOf, 1);
  return best ?? null;
}

/** 取相似度最高的前 N 個候選；聚簇時逐一讓模型判斷，避免「最佳候選不對就漏掉真配對」 */
export function findTopCandidates<T>(
  title: string,
  items: readonly T[],
  titleOf: (item: T) => string,
  limit = 3,
): ClusterCandidate<T>[] {
  return items
    .map((item) => ({ item, score: titleSimilarity(title, titleOf(item)) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));
}

// ============================================================
// 事件層相似度（移植 AIHOT 的「標題 + 摘要」召回）
//
// 只比標題會漏：同一件事，不同媒體的標題措辭可以差很遠，但摘要講的是同一件事。
// AIHOT 用「標題＋摘要」召回候選，再交給模型判斷關係；這裡沿用同一套召回方式。
//
// 分數 = 0.7 × 標題相似 + 0.3 × 摘要相似，兩者都用「重疊係數與 Jaccard 的平均」：
//   只用重疊係數時，短標題「保濕精華實測」會被長清單標題騙到滿分（實測 0.60），
//   混合後降到 0.27，才分得開「同一件事」與「只是同類話題」。
//
// 門檻用本專案真實資料校準（見 docs/content-dedupe.md）：
//   ≥ 0.66 直接視為同一事件（真重複對實測 0.68–0.91；不同事件 ≤ 0.31）
//   0.32–0.66 交給模型判斷（Just Makeup 同節目 0.43）
//   < 0.32 視為不同事件（不同文章、同品類話題，不浪費模型呼叫）
// ============================================================

/** 事件比較文字：標題 + 摘要前 300 字（與 AIHOT 的 reportText 一致） */
export function eventText(title: string | null | undefined, summary?: string | null): string {
  return `${title ?? ''}。${String(summary ?? '').slice(0, 300)}`;
}

function eventGrams(title: string | null | undefined, summary?: string | null): {
  title: Set<string>;
  summary: Set<string>;
} {
  return {
    title: charBigrams(normalizeTitle(title)),
    summary: charBigrams(String(summary ?? '').replace(/[#>*_~`|]+/g, ' ').slice(0, 300)),
  };
}

/**
 * 兩則熱點是否同一事件的召回分數（0–1）：標題 0.7 + 摘要 0.3。
 * 沒有摘要時只比標題，不會因為缺摘要而被壓低。
 */
export function eventSimilarity(
  left: { title: string | null | undefined; summary?: string | null },
  right: { title: string | null | undefined; summary?: string | null },
): number {
  const a = eventGrams(left.title, left.summary);
  const b = eventGrams(right.title, right.summary);
  const titleScore = blendedSimilarity(a.title, b.title);
  const hasBothSummaries = a.summary.size > 0 && b.summary.size > 0;
  if (!hasBothSummaries) return Math.round(titleScore * 1000) / 1000;
  const summaryScore = blendedSimilarity(a.summary, b.summary);
  return Math.round((titleScore * 0.7 + summaryScore * 0.3) * 1000) / 1000;
}

/** ≥ 這個分數直接視為同一事件，不必再問模型 */
export const EVENT_DUPLICATE = 0.66;
/** ≥ 這個分數（但未達 EVENT_DUPLICATE）交給模型判斷 */
export const EVENT_REVIEW = 0.32;

export type DuplicateVerdict = 'duplicate' | 'review' | 'distinct';

/** 召回分數 → 處置方式：直接合併／模型覆核／不同事件 */
export function duplicateVerdict(score: number): DuplicateVerdict {
  if (!Number.isFinite(score)) return 'distinct';
  if (score >= EVENT_DUPLICATE) return 'duplicate';
  if (score >= EVENT_REVIEW) return 'review';
  return 'distinct';
}

/** 依「標題＋摘要」找最像的既有事件（回傳前 N 個，分數高到低） */
export function findSimilarEvents<T>(
  query: { title: string | null | undefined; summary?: string | null },
  items: readonly T[],
  eventOf: (item: T) => { title: string | null | undefined; summary?: string | null },
  limit = 3,
): ClusterCandidate<T>[] {
  return items
    .map((item) => ({ item, score: eventSimilarity(query, eventOf(item)) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));
}
