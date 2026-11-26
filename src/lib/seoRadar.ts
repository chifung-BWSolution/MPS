/**
 * SEO 雷達 · 共用純函式（PRD §7）
 *
 * 這裡只放「無 I/O、可單元測試」的邏輯：正規化、GSC 聚合、選詞、
 * 建議詞種子、回應解析、評分、合併。前端（Vite）與 Edge Function（Deno）
 * 都直接 import 這個檔案，所以：
 *   - 不可用 `@/` alias（Deno 不認）
 *   - 不可用任何 Deno / 瀏覽器 API
 *
 * 口徑與 `src/lib/gscKeywords.ts` 一致：曝光即 search_volume 的替代值，
 * 曝光加權平均排名即 current_ranking。
 */

import type { RadarMarketCode } from '../types/seoRadar.ts';
import { canonicalizeDomainUrl } from './canonicalDomainUrl.ts';

// ============================================================
// 常數（要調整抓取規模只改這裡）
// ============================================================

/** GSC 回看天數，與 content-keywords 的 28 天窗口一致 */
export const RADAR_WINDOW_DAYS = 28;
/** 單次抓取最多保留幾個詞 */
export const RADAR_MAX_IDEAS = 100;
/** GSC 詞最多佔幾個名額（其餘留給建議詞） */
export const RADAR_GSC_BUDGET = 60;
/** 每次掃描最多用幾個種子去問 Google 建議 */
export const RADAR_MAX_SEEDS = 8;
/** GSC 完全沒有資料時（低信度模式）建議詞最多取幾個 */
export const RADAR_SUGGEST_LOW_CONFIDENCE_LIMIT = 40;
/** cron 每次最多掃幾個站點 */
export const RADAR_SITE_LIMIT = 10;
/** 使用者手動按「全站自動抓取」時，一次最多處理幾個站點（其餘留給每日 cron） */
export const RADAR_MANUAL_SITE_LIMIT = 60;
/** 手動全站抓取的時間預算（Edge Function 有牆鐘上限） */
export const RADAR_MANUAL_BUDGET_MS = 100_000;
export const RADAR_MIN_KEYWORD_LENGTH = 2;
export const RADAR_MAX_KEYWORD_LENGTH = 80;
/** 整段建議詞抓取的時間預算 */
export const RADAR_SCAN_BUDGET_MS = 90_000;
/** 單個建議詞請求的 timeout */
export const RADAR_SUGGEST_TIMEOUT_MS = 6_000;

// ============================================================
// 基本工具
// ============================================================

export function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundTo(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** 小寫、NFKC、壓縮空白；空字串代表不可用 */
export function normalizeKeywordPhrase(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** 顯示用的乾淨詞：保留原大小寫，只做 NFKC 與空白壓縮 */
export function toDisplayKeyword(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

/** 長度 2–80 且至少含一個字母或數字（擋掉純標點與空詞） */
export function isUsableKeywordPhrase(raw: unknown): boolean {
  const display = toDisplayKeyword(raw);
  if (display.length < RADAR_MIN_KEYWORD_LENGTH) return false;
  if (display.length > RADAR_MAX_KEYWORD_LENGTH) return false;
  return /[\p{L}\p{N}]/u.test(display);
}

/** 近 N 天的起始日（YYYY-MM-DD，UTC），可注入 now 以便測試 */
export function radarWindowStart(days = RADAR_WINDOW_DAYS, now: Date = new Date()): string {
  const safeDays = Math.max(1, Math.floor(days));
  return new Date(now.getTime() - (safeDays - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** 把前端／外部傳來的 limit 收斂到 10–300，預設 100 */
export function clampLimit(value: unknown, fallback = RADAR_MAX_IDEAS): number {
  const parsed = Math.floor(toFiniteNumber(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(parsed, 10), 300);
}

// ============================================================
// GSC 聚合
// ============================================================

export type RadarIdeaSource = 'gsc' | 'suggest';

export interface GscMetricRow {
  query: string;
  impressions?: number | string | null;
  clicks?: number | string | null;
  position?: number | string | null;
  metric_date?: string | null;
}

export interface RadarGscAggregate {
  display: string;
  normalized: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  avg_position: number | null;
  last_date: string;
}

/** 候選詞（尚未寫庫） */
export interface RadarIdeaDraft {
  keyword: string;
  normalized_keyword: string;
  source: RadarIdeaSource;
  impressions: number;
  clicks: number;
  ctr: number | null;
  avg_position: number | null;
  seed_keyword: string | null;
  score: number;
}

interface AggregateAccumulator {
  display: string;
  normalized: string;
  impressions: number;
  clicks: number;
  positionWeighted: number;
  last_date: string;
}

/**
 * 把逐日 metric 列合併成每個查詢詞一列。
 * - 曝光／點擊加總
 * - 平均排名以曝光加權（曝光 0 的列不影響排名）
 * - 顯示詞取「最近日期」那一列的寫法
 */
export function aggregateGscRows(rows: readonly GscMetricRow[]): RadarGscAggregate[] {
  const byKey = new Map<string, AggregateAccumulator>();

  for (const row of rows) {
    const display = toDisplayKeyword(row.query);
    if (!isUsableKeywordPhrase(display)) continue;
    const normalized = normalizeKeywordPhrase(display);
    if (!normalized) continue;

    const impressions = toFiniteNumber(row.impressions);
    const clicks = toFiniteNumber(row.clicks);
    const position = toFiniteNumber(row.position);
    const metricDate = String(row.metric_date ?? '');

    const previous = byKey.get(normalized);
    if (!previous) {
      byKey.set(normalized, {
        display,
        normalized,
        impressions,
        clicks,
        positionWeighted: position * impressions,
        last_date: metricDate,
      });
      continue;
    }

    previous.impressions += impressions;
    previous.clicks += clicks;
    previous.positionWeighted += position * impressions;
    if (metricDate >= previous.last_date) {
      previous.display = display;
      previous.last_date = metricDate;
    }
  }

  return [...byKey.values()].map((item) => ({
    display: item.display,
    normalized: item.normalized,
    impressions: item.impressions,
    clicks: item.clicks,
    ctr: item.impressions > 0 ? roundTo(item.clicks / item.impressions, 4) : null,
    avg_position:
      item.impressions > 0 ? roundTo(item.positionWeighted / item.impressions, 1) : null,
    last_date: item.last_date,
  }));
}

/**
 * 排序啟發值（不是搜尋量！）
 * 曝光為主、點擊加權、排名進前 10／20 給加成。
 */
export function scoreGscIdea(input: {
  impressions: number;
  clicks: number;
  avg_position?: number | null;
}): number {
  const position = input.avg_position;
  const bonus =
    position != null && position > 0 ? (position <= 10 ? 25 : position <= 20 ? 10 : 0) : 0;
  return roundTo(Math.max(0, input.impressions) + Math.max(0, input.clicks) * 5 + bonus);
}

/** 種子分級 → 分數權重：GSC 一手最高，品牌縮寫最低 */
const SEED_TIER_WEIGHT: Record<RadarSeedSource, number> = {
  gsc: 1,
  domain: 0.85,
  site: 0.7,
  brand: 0.5,
};

/**
 * 建議詞沒有曝光數據，用「產生它的種子在 GSC 的曝光」給基準分，
 * 再依種子分級打折（對照 AIHOT 的分級門檻：來源越弱越難入選）。
 */
export function scoreSuggestIdea(
  seedImpressions: number,
  source: RadarSeedSource = 'gsc',
): number {
  const weight = SEED_TIER_WEIGHT[source] ?? 1;
  return roundTo((Math.max(0, seedImpressions) * 0.35 + 5) * weight);
}

/** 取曝光前 N（同曝光比點擊，再比排名），轉成候選詞 */
export function selectGscIdeas(
  rows: readonly GscMetricRow[],
  budget = RADAR_GSC_BUDGET,
): RadarIdeaDraft[] {
  const safeBudget = Math.max(0, Math.floor(budget));
  if (safeBudget === 0) return [];

  return aggregateGscRows(rows)
    .filter((row) => row.impressions >= 1)
    .sort(
      (a, b) =>
        b.impressions - a.impressions ||
        b.clicks - a.clicks ||
        (a.avg_position ?? Number.POSITIVE_INFINITY) - (b.avg_position ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, safeBudget)
    .map((row) => ({
      keyword: row.display,
      normalized_keyword: row.normalized,
      source: 'gsc' as const,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
      avg_position: row.avg_position,
      seed_keyword: null,
      score: scoreGscIdea({
        impressions: row.impressions,
        clicks: row.clicks,
        avg_position: row.avg_position,
      }),
    }));
}

// ============================================================
// 搜尋建議
// ============================================================

export class SuggestFormatError extends Error {
  constructor(message = 'Google 搜尋建議回應格式無法解析') {
    super(message);
    this.name = 'SuggestFormatError';
  }
}

export interface SuggestSeedInput {
  gscTop?: readonly string[];
  websiteName?: string | null;
  brand?: string | null;
  /** 站點域名，用來推出域名種子（food-channels.com → food channels） */
  domainUrl?: string | null;
  maxSeeds?: number;
}

/** 種子來源分級：GSC 詞是一手需求證據，品牌縮寫最弱 */
export type RadarSeedSource = 'gsc' | 'domain' | 'site' | 'brand';

export interface RadarSeed {
  phrase: string;
  source: RadarSeedSource;
}

/** 常見 TLD／ccTLD；用來把域名主體剝出來當種子 */
const DOMAIN_TLDS = new Set([
  'com', 'net', 'org', 'info', 'biz', 'edu', 'gov', 'app', 'dev', 'ai', 'news',
  'shop', 'site', 'online', 'store', 'io', 'co',
  'hk', 'tw', 'sg', 'my', 'us', 'uk', 'au', 'ca', 'nz', 'jp', 'kr', 'cn', 'mo',
  'ph', 'id', 'th', 'vn', 'in', 'de', 'fr', 'es', 'it', 'nl', 'ch', 'se', 'no',
  'dk', 'fi', 'ru', 'br', 'mx', 'za', 'ae', 'il', 'tr', 'pl', 'pt', 'gr', 'ie',
  'be', 'at', 'cz', 'hu', 'ro',
]);

/** `food-channels.com` → `food channels`；沒有可用主體時回空字串 */
export function domainSeedPhrase(domainUrl: string | null | undefined): string {
  const host = canonicalizeDomainUrl(domainUrl);
  if (!host) return '';
  const parts = host.split('.').filter(Boolean);
  while (parts.length > 1 && DOMAIN_TLDS.has(parts[parts.length - 1])) parts.pop();
  return parts.join('-').replace(/[-_]+/g, ' ').trim();
}

/**
 * 站名／品牌常帶「｜公司」「- 香港」之類的尾巴，取第一段當種子。
 * 只切常見分隔符，避免把複合詞切壞。
 */
export function cleanSeedPhrase(raw: string | null | undefined): string {
  const first = toDisplayKeyword(raw).split(/[|｜:：–—-]/)[0] ?? '';
  return first.trim();
}

/**
 * 種子順序（對照 AIHOT 的信源分級：越一手越優先）：
 *   GSC 前 5 → 域名 → 站名 → 品牌 → 其餘 GSC 詞，去重後最多 8 個。
 */
export function buildSuggestSeeds(input: SuggestSeedInput): RadarSeed[] {
  const maxSeeds = Math.max(1, Math.floor(input.maxSeeds ?? RADAR_MAX_SEEDS));
  const gscTop = (input.gscTop ?? []).map((item) => toDisplayKeyword(item));
  const seeds: RadarSeed[] = [];
  const seen = new Set<string>();

  const push = (raw: string | null | undefined, source: RadarSeedSource): void => {
    if (seeds.length >= maxSeeds) return;
    const phrase = cleanSeedPhrase(raw);
    if (!isUsableKeywordPhrase(phrase)) return;
    const key = normalizeKeywordPhrase(phrase);
    if (!key || seen.has(key)) return;
    seen.add(key);
    seeds.push({ phrase, source });
  };

  gscTop.slice(0, 5).forEach((item) => push(item, 'gsc'));
  push(domainSeedPhrase(input.domainUrl), 'domain');
  push(input.websiteName, 'site');
  push(input.brand, 'brand');
  gscTop.slice(5).forEach((item) => push(item, 'gsc'));

  return seeds;
}

/** 純 2–4 個英文字母的縮寫（FCC／BWA…）——這類種子最容易產生噪音 */
export function isAcronymSeed(phrase: string): boolean {
  return /^[a-z]{2,4}$/.test(normalizeKeywordPhrase(phrase));
}

/** 去掉空白與標點後再比：`fcc hk` 與 `fcchk` 視為同一個詞 */
export function dedupeKey(keyword: string): string {
  return normalizeKeywordPhrase(keyword).replace(
    /[\s\-_·・,，。.!！?？'"“”‘’()（）[\]【】/\\]+/g,
    '',
  );
}

function sharesCjkBigram(keyword: string, seed: string): boolean {
  const k = dedupeKey(keyword);
  const s = dedupeKey(seed);
  if (!s) return false;
  for (let i = 0; i + 2 <= s.length; i += 1) {
    if (k.includes(s.slice(i, i + 2))) return true;
  }
  return false;
}

function sharesLatinToken(keyword: string, seed: string): boolean {
  const k = normalizeKeywordPhrase(keyword);
  const tokens = normalizeKeywordPhrase(seed)
    .split(/[\s\-_]+/)
    .filter((token) => token.length >= 2);
  return tokens.some((token) => k.includes(token));
}

/**
 * 預篩（對照 AIHOT 的 prefilter：只攔明顯無關的）。
 *
 * 分級門檻：
 *   - 縮寫種子（FCC／BWA）：建議詞必須完整包含縮寫 → 擋掉「復仇者聯盟」這類雜訊
 *   - 中文種子：至少共享一個 2 字窗口 → 保留「生暗瘡成因」這種換序詞
 *   - 英文種子：至少共享一個 2 字以上的詞 → 擋掉 attitude / aptitude 這種拼寫相近
 *   - 與種子完全相同：丟（沒有新資訊）
 */
export function passesSeedGate(keyword: string, seed: string): boolean {
  const k = normalizeKeywordPhrase(keyword);
  const s = normalizeKeywordPhrase(seed);
  if (!k || !s || k === s) return false;
  if (isAcronymSeed(s)) return k.includes(s);
  if (/[\u3400-\u9fff]/.test(s) && sharesCjkBigram(keyword, seed)) return true;
  return sharesLatinToken(keyword, seed);
}

/**
 * 解析 Google suggest 回應。
 * `client=firefox` 回 `["query",["a","b"]]`；舊格式 `["query",[["a",0]]]` 也吃。
 * 空建議清單是合法回應（回空陣列），不是錯誤。
 */
export function parseSuggestPayload(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < 2) throw new SuggestFormatError();
  const list = raw[1];
  if (!Array.isArray(list)) throw new SuggestFormatError();

  const terms: string[] = [];
  for (const item of list) {
    let text: unknown = item;
    if (Array.isArray(item)) {
      text = item[0];
    } else if (item && typeof item === 'object') {
      const shape = item as { phrase?: unknown; suggestion?: unknown };
      text = shape.phrase ?? shape.suggestion ?? '';
    }
    const phrase = toDisplayKeyword(text);
    if (isUsableKeywordPhrase(phrase)) terms.push(phrase);
  }
  return terms;
}

export interface SuggestTermPair {
  seed: string;
  keyword: string;
}

export interface BuildSuggestIdeasInput {
  suggestions: readonly SuggestTermPair[];
  /** 種子清單（含來源分級）；不給時一律當 site 級 */
  seeds?: readonly RadarSeed[];
  /** 正規化後的種子詞 → 該種子的 GSC 曝光 */
  seedImpressions?: ReadonlyMap<string, number> | Record<string, number>;
}

function lookupSeedImpressions(
  source: BuildSuggestIdeasInput['seedImpressions'],
  seedKey: string,
): number {
  if (!source) return 0;
  if (typeof (source as ReadonlyMap<string, number>).get === 'function') {
    return toFiniteNumber((source as ReadonlyMap<string, number>).get(seedKey));
  }
  return toFiniteNumber((source as Record<string, number>)[seedKey]);
}

export function buildSuggestIdeas(input: BuildSuggestIdeasInput): RadarIdeaDraft[] {
  const tierBySeed = new Map<string, RadarSeedSource>();
  for (const seed of input.seeds ?? []) {
    tierBySeed.set(normalizeKeywordPhrase(seed.phrase), seed.source);
  }

  const ideas: RadarIdeaDraft[] = [];
  const seen = new Set<string>();

  for (const pair of input.suggestions) {
    const display = toDisplayKeyword(pair.keyword);
    if (!isUsableKeywordPhrase(display)) continue;

    // 預篩：與產生它的種子沒有實質交集就直接丟，不入庫
    if (pair.seed && !passesSeedGate(display, pair.seed)) continue;

    // 判重：去掉空白與標點後再比，避免同一詞以不同寫法重複入庫
    const key = dedupeKey(display);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const normalized = normalizeKeywordPhrase(display);
    const seedKey = normalizeKeywordPhrase(pair.seed);
    const seedImpressions = lookupSeedImpressions(input.seedImpressions, seedKey);
    const tier = tierBySeed.get(seedKey) ?? 'site';

    ideas.push({
      keyword: display,
      normalized_keyword: normalized,
      source: 'suggest',
      impressions: 0,
      clicks: 0,
      ctr: null,
      avg_position: null,
      seed_keyword: pair.seed ? toDisplayKeyword(pair.seed) : null,
      score: scoreSuggestIdea(seedImpressions, tier),
    });
  }

  return ideas;
}

// ============================================================
// 合併
// ============================================================

export interface MergeScanResultsInput {
  gscIdeas: readonly RadarIdeaDraft[];
  suggestIdeas: readonly RadarIdeaDraft[];
  limit?: number;
}

/** GSC 詞優先、建議詞補位、同詞去重、總數受 limit 限制 */
export function mergeScanResults(input: MergeScanResultsInput): RadarIdeaDraft[] {
  const limit = clampLimit(input.limit, RADAR_MAX_IDEAS);
  const seen = new Set<string>();
  const merged: RadarIdeaDraft[] = [];

  for (const idea of [...input.gscIdeas, ...input.suggestIdeas]) {
    if (merged.length >= limit) break;
    const normalized = idea.normalized_keyword || normalizeKeywordPhrase(idea.keyword);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push({ ...idea, normalized_keyword: normalized });
  }

  return merged;
}

/** 依 market_code 產生寫庫要用的 market／language 值（呼叫端已判定過） */
export function marketColumns(market: { code: RadarMarketCode; hl: string }): {
  market_code: RadarMarketCode;
  language_code: string;
} {
  return { market_code: market.code, language_code: market.hl };
}
