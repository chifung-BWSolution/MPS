/**
 * 社媒自動化營運 · 熱點去重與熱度（移植自 B100 `src/lib/domain/{dedup,heat,cluster}.ts`）
 *
 * 用途：
 *   - `content-sources` 自動抓取：同一則新聞只進一次
 *   - `content-social` CSV／手動匯入：避免標題重複
 *   - 熱度公式：來源分級 × 24h 半衰 × 48h 窗口（與 B100 一致）
 *
 * 純函式，Deno 與瀏覽器皆可載入。
 */

// ============================================================
// 正規化
// ============================================================

/** 去掉 utm_* / fbclid 等追蹤參數，統一本站網址 */
export function normalizeUrl(url: string | null | undefined): string {
  const value = String(url ?? '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        key.startsWith('utm_') ||
        key === 'fbclid' ||
        key === 'gclid' ||
        key === 'igshid' ||
        key === 'ref' ||
        key === 'ref_src'
      ) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = '';
    let href = parsed.toString();
    if (href.endsWith('/')) href = href.slice(0, -1);
    return href;
  } catch {
    return value.toLowerCase();
  }
}

/** 只保留文字與數字（含中文），讓「同一標題不同標點」視為相同 */
export function normalizeTitle(title: string | null | undefined): string {
  return String(title ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

// ============================================================
// simhash（64-bit，BigInt）
// ============================================================

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

function fnv(text: string): bigint {
  let hash = FNV_OFFSET;
  for (const char of text) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * FNV_PRIME);
  }
  return hash;
}

export function bigrams(text: string): string[] {
  const normalized = normalizeTitle(text);
  const chars = [...normalized];
  if (chars.length < 2) return chars.length === 1 ? chars : [];
  const grams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.push(chars[index] + chars[index + 1]);
  }
  return grams;
}

/** 回傳 16 位 hex；同一標題 simhash 相同 */
export function simhash(text: string): string {
  const votes = new Array<number>(64).fill(0);
  for (const gram of bigrams(text)) {
    const hash = fnv(gram);
    for (let bit = 0; bit < 64; bit += 1) {
      votes[bit] += ((hash >> BigInt(bit)) & 1n) === 1n ? 1 : -1;
    }
  }
  let out = 0n;
  for (let bit = 0; bit < 64; bit += 1) {
    if (votes[bit] > 0) out |= 1n << BigInt(bit);
  }
  return out.toString(16).padStart(16, '0');
}

export function hamming(a: string, b: string): number {
  if (!a || !b) return 64;
  let xor = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (xor) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

/**
 * 去重鍵：有 URL 用正規化 URL，沒有就用標題 simhash。
 * 兩個鍵前綴不同，讓資料庫能一眼看出是哪一種。
 */
export function dedupeKey(url: string | null | undefined, title: string): string {
  const normalized = normalizeUrl(url);
  return normalized ? `url:${normalized}` : `sim:${simhash(title)}`;
}

/** 以 simhash 距離判斷兩則是否為同一事件（≤ 3 視為重複，B100 的做法） */
export function isNearDuplicate(titleA: string, titleB: string, maxDistance = 3): boolean {
  return hamming(simhash(titleA), simhash(titleB)) <= maxDistance;
}

// ============================================================
// 成稿內容指紋（輸出層去重）
//
// 事件層去重解決「同一件事被抓到兩次」；這一層解決「同一件事被生成兩份」。
// 指紋只做「標題 + 正文」的文字化，不看 Markdown 語法，所以換寫法、換標點
// 不影響判斷；資料庫會保存指紋，方便日後稽核與回填。
// ============================================================

/** 去掉 Markdown 語法、連結與多餘空白，只留可比較的正文 */
export function normalizeBody(markdown: string | null | undefined): string {
  return String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#>*_~`|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 字符 bigram 集合；短字串才穩定，長文本先截斷再取 */
export function charBigrams(text: string | null | undefined, size = 2): Set<string> {
  const chars = [...String(text ?? '').replace(/\s+/g, '')];
  const grams = new Set<string>();
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.add(chars.slice(index, index + size).join(''));
  }
  return grams;
}

/**
 * 重疊係數＝交集 ÷ 較小集合大小（AIHOT 的 lexicalSimilarity）。
 * 用「較小集合」當分母，長短標題才不會被長度差異懲罰。
 */
export function overlapCoefficient(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / Math.min(left.size, right.size);
}

/**
 * Jaccard＝交集 ÷ 聯集。
 * 只用重疊係數會被「短標題剛好被長標題包含」騙到（例：標題只有「保濕精華實測」，
 * 長文清單裡出現同一組字就會拿滿分），所以實際比對時與重疊係數各佔一半。
 */
export function jaccardCoefficient(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

/** 兩種係數的平均：夠寬容（同義改寫）又不會被短字串包含關係騙到 */
export function blendedSimilarity(left: Set<string>, right: Set<string>): number {
  return (overlapCoefficient(left, right) + jaccardCoefficient(left, right)) / 2;
}

/** 正文前 N 字（標題已另外比較，正文只看開頭就足以分辨是不是同一篇） */
export const FINGERPRINT_BODY_CHARS = 1_200;

/**
 * 成稿指紋：標題 + 正文前 1200 字的 simhash（16 位 hex）。
 * 同一份內容即使改了標點、空行、連結參數，指紋仍然相同。
 */
export function contentFingerprint(
  title: string | null | undefined,
  bodyMarkdown: string | null | undefined,
): string {
  const body = normalizeBody(bodyMarkdown).slice(0, FINGERPRINT_BODY_CHARS);
  return simhash(`${normalizeTitle(title)} ${body}`);
}

/**
 * 兩篇成稿的相似度（0–1）：指紋漢明距離與正文重疊各佔一半。
 * 只用來「找可疑重複」給人／模型覆核，不會單獨自動刪稿。
 */
export function postSimilarity(
  left: { title?: string | null; body_md?: string | null },
  right: { title?: string | null; body_md?: string | null },
  bodyChars = 600,
): number {
  const leftBody = normalizeBody(left.body_md).slice(0, bodyChars);
  const rightBody = normalizeBody(right.body_md).slice(0, bodyChars);
  const hashScore =
    1 -
    hamming(
      contentFingerprint(left.title, left.body_md),
      contentFingerprint(right.title, right.body_md),
    ) / 64;
  const textScore = overlapCoefficient(charBigrams(leftBody), charBigrams(rightBody));
  return Math.round((hashScore * 0.5 + textScore * 0.5) * 1000) / 1000;
}

// ============================================================
// 同事件多稿的保留規則（前端、函式、migration 共用同一順序）
// ============================================================

/** 稿件狀態的保留優先級：已發佈 > 待發佈 > 待審 > 草稿 > 失敗／取消 */
export const POST_KEEPER_STATUS_RANK: Record<string, number> = {
  published: 6,
  publishing: 5,
  scheduled: 4,
  approved: 3,
  pending_review: 2,
  changes_requested: 2,
  draft: 1,
  failed: 0,
  cancelled: 0,
};

export interface DedupePostLike {
  id: string;
  status: string;
  generator?: string | null;
  created_at: string;
  /** 已綁定的導流帳號數（呼叫端先算好；DB 端用 count 子查詢） */
  target_count?: number | null;
}

/**
 * 保留哪一篇：狀態最先進、其次 AI 生成（grok）優先於模板、
 * 再其次導流帳號最多（合併後不漏帳號）、最後最早建立（看板上原本就在的那張）。
 */
export function comparePostForKeep(left: DedupePostLike, right: DedupePostLike): number {
  const rank = (post: DedupePostLike) => POST_KEEPER_STATUS_RANK[post.status] ?? 1;
  if (rank(left) !== rank(right)) return rank(right) - rank(left);
  const generator = (post: DedupePostLike) => (post.generator === 'grok' ? 1 : 0);
  if (generator(left) !== generator(right)) return generator(right) - generator(left);
  const targets = (post: DedupePostLike) => Number(post.target_count ?? 0);
  if (targets(left) !== targets(right)) return targets(right) - targets(left);
  const byTime = String(left.created_at).localeCompare(String(right.created_at));
  if (byTime !== 0) return byTime;
  return String(left.id).localeCompare(String(right.id));
}

/** 同一事件的多篇稿件裡，回傳應該保留的那一篇 */
export function pickCanonicalPost<T extends DedupePostLike>(posts: readonly T[]): T | null {
  if (posts.length === 0) return null;
  return [...posts].sort(comparePostForKeep)[0] ?? null;
}

// ============================================================
// 熱度（B100 公式）
// ============================================================

export const TIER_WEIGHT: Record<number, number> = { 1: 1, 2: 0.6, 3: 0.3 };
export const HEAT_WINDOW_HOURS = 48;

export function sourceContribution(tier: number, ageHours: number): number {
  if (!Number.isFinite(ageHours) || ageHours > HEAT_WINDOW_HOURS) return 0;
  const weight = TIER_WEIGHT[tier] ?? 0.3;
  return weight * Math.pow(0.5, Math.max(0, ageHours) / 24) * 10;
}

export function eventHeat(parts: { tier: number; ageHours: number }[]): number {
  return parts.reduce((sum, part) => sum + sourceContribution(part.tier, part.ageHours), 0);
}

export type HeatMark = 'NEW' | 'UP' | null;

export function heatMark(input: {
  firstSeenAt: string;
  heat: number;
  heat6hAgo: number;
  now?: Date;
}): HeatMark {
  const age =
    ((input.now ?? new Date()).getTime() - new Date(input.firstSeenAt).getTime()) / 3_600_000;
  if (age <= 6) return 'NEW';
  if (input.heat6hAgo > 0 && input.heat > input.heat6hAgo * 1.15) return 'UP';
  return null;
}

/**
 * 把 B100 的小數熱度（0–30）映射成 0–100 的看板分數。
 * 保留一位小數，讓排序仍可分辨。
 */
export function heatScore(tier: number, ageHours: number): number {
  const raw = sourceContribution(tier, ageHours) * 3.4;
  return Math.round(Math.min(100, Math.max(1, raw)) * 10) / 10;
}
