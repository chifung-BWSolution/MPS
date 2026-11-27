/**
 * 熱點雷達 · 共用純函式（PRD §7）
 *
 * 這裡只放「無 I/O、可單元測試」的邏輯：正規化、映射、中位數、相對熱度、
 * 排序、預算。前端（Vite）與 Edge Function（Deno）都直接 import 這個檔案，所以：
 *   - 不可用 `@/` alias（Deno 不認）
 *   - 不可用任何 Deno / 瀏覽器 / React / supabase API
 */

import type {
  HotspotKind,
  HotspotMediaType,
  HotspotPlatform,
  HotspotSortKey,
} from '../types/hotspotRadar.ts';

// ============================================================
// 常數（要調整抓取規模只改這裡）
// ============================================================

/** 單次 run 最多處理幾個目標 */
export const HOTSPOT_MAX_TARGETS_PER_RUN = 40;
/** Edge Function 牆鐘預算（留 buffer 給平台 150 秒上限） */
export const HOTSPOT_TIME_BUDGET_MS = 90_000;
/** 帳號類每次抓幾則（要算中位數，最少 5） */
export const HOTSPOT_ACCOUNT_ITEMS = 12;
/** Hashtag 類每次抓幾則 */
export const HOTSPOT_TAG_ITEMS = 20;
/** 廣告類每次抓幾條 */
export const HOTSPOT_AD_ITEMS = 20;
/** 中位數回看窗（天） */
export const HOTSPOT_MEDIAN_WINDOW_DAYS = 30;
/** 少於這個樣本數就不算相對熱度（避免 1 則貼文算出 10× 的假爆款） */
export const HOTSPOT_MEDIAN_MIN_SAMPLE = 5;
/** 算中位數時最多取幾則 */
export const HOTSPOT_MEDIAN_SAMPLE_CAP = 50;
/** 出廠月費上限（US$） */
export const HOTSPOT_MONTHLY_BUDGET_USD = 40;
/** 出廠入池門檻（自然內容的互動總量） */
export const HOTSPOT_MIN_ENGAGEMENT = 300;
/** 非收藏項目的保留天數 */
export const HOTSPOT_RETENTION_DAYS = 120;
/** 「🔥 爆款」門檻：相對熱度倍數 */
export const HOTSPOT_RELATIVE_HEAT_MIN = 2.0;
/** 廣告「長投爆款」門檻：已投放天數 */
export const HOTSPOT_AD_LONG_RUNNING_DAYS = 21;
/** 10 分鐘內有 running run 視為「抓取中」 */
export const HOTSPOT_RUNNING_STALE_MS = 10 * 60_000;
/** 查已存在 external_id 時每批幾個 */
export const HOTSPOT_CHUNK_SIZE = 200;
/** 收藏備註長度上限 */
export const HOTSPOT_MAX_NOTE_LENGTH = 500;
/** IG 類抓取的出廠單價（US$ / 1,000 筆） */
export const DEFAULT_UNIT_PRICE_USD_PER_1000 = 1.75;
/** 廣告類抓取的出廠單價（US$ / 1,000 條） */
export const DEFAULT_AD_UNIT_PRICE_USD_PER_1000 = 0.7;
/** 測試目標時最多預覽幾筆 */
export const HOTSPOT_TEST_TARGET_PREVIEW = 5;

/** 可選排序（UI 用它產生下拉選單，避免兩處各寫一份） */
export const HOTSPOT_SORT_KEYS: readonly HotspotSortKey[] = [
  'composite',
  'engagement',
  'relative',
  'newest',
  'ad_days',
];

/** 來源類型中文標籤（UI 與 Edge Function 共用，避免各寫一份） */
export const HOTSPOT_KIND_LABEL: Record<HotspotKind, string> = {
  account: '對標帳號',
  hashtag: 'Hashtag',
  ad_keyword: '廣告關鍵字',
};

// ============================================================
// 基本工具
// ============================================================

export function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function roundTo(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.floor(toFiniteNumber(value));
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

export function isHotspotKind(value: unknown): value is HotspotKind {
  return value === 'account' || value === 'hashtag' || value === 'ad_keyword';
}

/** 由 kind 決定平台：廣告走 Meta 廣告庫，其餘走 Instagram */
export function platformForKind(kind: HotspotKind): HotspotPlatform {
  return kind === 'ad_keyword' ? 'facebook' : 'instagram';
}

// ============================================================
// 監測目標正規化
// ============================================================

const HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
const HASHTAG_PATTERN = /^[\p{L}\p{N}_]{1,50}$/u;
const AD_KEYWORD_MIN = 2;
const AD_KEYWORD_MAX = 80;

export interface NormalizedTarget {
  kind: HotspotKind;
  platform: HotspotPlatform;
  /** 顯示用（保留原大小寫、去掉 @ / #） */
  value: string;
  /** 唯一鍵用（小寫、去空白） */
  value_normalized: string;
  valid: boolean;
  reason: string | null;
}

/** `@foo`、`instagram.com/foo/`、`foo` → `foo`；不合法回空字串 */
export function normalizeHandle(raw: unknown): string {
  let text = String(raw ?? '').trim();
  if (!text) return '';
  const urlMatch = text.match(/instagram\.com\/([^/?#\s]+)/i);
  if (urlMatch) {
    try {
      text = decodeURIComponent(urlMatch[1]);
    } catch {
      text = urlMatch[1];
    }
  }
  text = text.replace(/^@+/, '').trim();
  return HANDLE_PATTERN.test(text) ? text : '';
}

/** `#foo`、`instagram.com/explore/tags/foo/`、`foo` → `foo`（去掉所有空白） */
export function normalizeHashtag(raw: unknown): string {
  let text = String(raw ?? '').trim();
  if (!text) return '';
  const urlMatch = text.match(/instagram\.com\/explore\/tags\/([^/?#\s]+)/i);
  if (urlMatch) {
    try {
      text = decodeURIComponent(urlMatch[1]);
    } catch {
      text = urlMatch[1];
    }
  }
  text = text.replace(/^#+/, '').replace(/\s+/g, '');
  return HASHTAG_PATTERN.test(text) ? text : '';
}

/** 廣告關鍵字：trim、壓縮空白、2–80 字且至少含一個字母或數字 */
export function normalizeAdKeyword(raw: unknown): string {
  const text = String(raw ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
  if (text.length < AD_KEYWORD_MIN || text.length > AD_KEYWORD_MAX) return '';
  if (!/[\p{L}\p{N}]/u.test(text)) return '';
  return text;
}

/** 單一入口：kind + 使用者輸入 → 正規化結果（前端與 Edge Function 共用） */
export function normalizeTarget(kind: HotspotKind, raw: unknown): NormalizedTarget {
  const platform = platformForKind(kind);
  const base: NormalizedTarget = {
    kind,
    platform,
    value: '',
    value_normalized: '',
    valid: false,
    reason: null,
  };

  if (kind === 'account') {
    const handle = normalizeHandle(raw);
    if (!handle) return { ...base, reason: 'handle_invalid' };
    return { ...base, value: handle, value_normalized: handle.toLowerCase(), valid: true };
  }

  if (kind === 'hashtag') {
    const hashtag = normalizeHashtag(raw);
    if (!hashtag) return { ...base, reason: 'hashtag_invalid' };
    return { ...base, value: hashtag, value_normalized: hashtag.toLowerCase(), valid: true };
  }

  const keyword = normalizeAdKeyword(raw);
  if (!keyword) return { ...base, reason: 'keyword_invalid' };
  return { ...base, value: keyword, value_normalized: keyword.toLowerCase(), valid: true };
}

// ============================================================
// 中位數與相對熱度
// ============================================================

/** 空陣列回 0；偶數取中間兩數平均；忽略非有限數 */
export function computeMedian(values: readonly unknown[]): number {
  const numbers = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (numbers.length === 0) return 0;
  const middle = Math.floor(numbers.length / 2);
  if (numbers.length % 2 === 1) return numbers[middle];
  return roundTo((numbers[middle - 1] + numbers[middle]) / 2, 2);
}

/** 互動＝讚＋留言（播放數只顯示，不進熱度計算） */
export function engagementOf(likes: unknown, comments: unknown): number {
  return Math.max(0, Math.floor(toFiniteNumber(likes))) + Math.max(0, Math.floor(toFiniteNumber(comments)));
}

export interface RelativeHeatResult {
  relative_heat: number | null;
  low_sample: boolean;
}

/**
 * 樣本不足（<5）→ 不算相對熱度並標 low_sample；
 * 中位數 <=0 → 不算（但不算 low_sample，資料本身有效）。
 */
export function computeRelativeHeat(
  engagement: unknown,
  median: unknown,
  sample: unknown,
): RelativeHeatResult {
  const sampleSize = Math.floor(toFiniteNumber(sample));
  if (sampleSize < HOTSPOT_MEDIAN_MIN_SAMPLE) return { relative_heat: null, low_sample: true };
  const medianValue = toFiniteNumber(median);
  if (medianValue <= 0) return { relative_heat: null, low_sample: false };
  const engagementValue = Math.max(0, toFiniteNumber(engagement));
  return { relative_heat: roundTo(engagementValue / medianValue, 2), low_sample: false };
}

/**
 * 「爆款」標記（只作篩選／標記，不是預設門檻）：
 *   - 自然內容：相對熱度 ≥ 2× 中位數（沒有互動數據的來源不會命中）
 *   - 廣告：投放 ≥ 21 天
 */
export function isHotItem(item: {
  source_kind: HotspotKind;
  relative_heat?: number | null;
  ad_active_days?: number | null;
}): boolean {
  if (item.source_kind === 'ad_keyword') {
    return toFiniteNumber(item.ad_active_days) >= HOTSPOT_AD_LONG_RUNNING_DAYS;
  }
  return toNullableNumber(item.relative_heat) !== null &&
    toFiniteNumber(item.relative_heat) >= HOTSPOT_RELATIVE_HEAT_MIN;
}

// ============================================================
// 排序（五種，全部為全序）
// ============================================================

export interface HotspotSortableItem {
  id?: string | null;
  source_kind: HotspotKind;
  engagement: number;
  relative_heat: number | null;
  posted_at: string | null;
  ad_active_days: number | null;
}

/** 相對熱度分層：≥3 → 0；≥2 → 1；≥1.5 → 2；其餘（含 NULL）→ 3 */
export function relativeHeatLayer(relativeHeat: number | null | undefined): 0 | 1 | 2 | 3 {
  const value = toNullableNumber(relativeHeat);
  if (value === null) return 3;
  if (value >= 3) return 0;
  if (value >= 2) return 1;
  if (value >= 1.5) return 2;
  return 3;
}

function isAdItem(item: HotspotSortableItem): boolean {
  return item.source_kind === 'ad_keyword';
}

function timestampMs(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** 降序比較（-Infinity 代表 NULL，天然排最後；兩邊都是 NULL 回 0） */
function compareDesc(a: number, b: number): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function compareId(a: HotspotSortableItem, b: HotspotSortableItem): number {
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

/** 相對熱度：NULL 排最後，其餘 desc，同值比互動再比 id */
function compareRelative(a: HotspotSortableItem, b: HotspotSortableItem): number {
  const av = toNullableNumber(a.relative_heat);
  const bv = toNullableNumber(b.relative_heat);
  if (av === null && bv === null) return compareId(a, b);
  if (av === null) return 1;
  if (bv === null) return -1;
  return compareDesc(av, bv) || compareDesc(toFiniteNumber(a.engagement), toFiniteNumber(b.engagement)) || compareId(a, b);
}

export function compareBySort(
  a: HotspotSortableItem,
  b: HotspotSortableItem,
  sort: HotspotSortKey,
): number {
  if (sort === 'engagement') {
    return (
      compareDesc(toFiniteNumber(a.engagement), toFiniteNumber(b.engagement)) ||
      compareDesc(timestampMs(a.posted_at), timestampMs(b.posted_at)) ||
      compareId(a, b)
    );
  }

  if (sort === 'relative') {
    return compareRelative(a, b);
  }

  if (sort === 'newest') {
    return (
      compareDesc(timestampMs(a.posted_at), timestampMs(b.posted_at)) ||
      compareDesc(toFiniteNumber(a.engagement), toFiniteNumber(b.engagement)) ||
      compareId(a, b)
    );
  }

  if (sort === 'ad_days') {
    const av = toNullableNumber(a.ad_active_days);
    const bv = toNullableNumber(b.ad_active_days);
    if (av === null && bv === null) {
      return compareDesc(toFiniteNumber(a.engagement), toFiniteNumber(b.engagement)) || compareId(a, b);
    }
    if (av === null) return 1;
    if (bv === null) return -1;
    return (
      compareDesc(av, bv) ||
      compareDesc(toFiniteNumber(a.engagement), toFiniteNumber(b.engagement)) ||
      compareId(a, b)
    );
  }

  // composite（預設）：先分層 → 自然內容先於廣告 → 自然比互動、廣告比投放天數 → 最新 → id
  const layerDiff = relativeHeatLayer(a.relative_heat) - relativeHeatLayer(b.relative_heat);
  if (layerDiff !== 0) return layerDiff;

  const adDiff = (isAdItem(a) ? 1 : 0) - (isAdItem(b) ? 1 : 0);
  if (adDiff !== 0) return adDiff;

  if (isAdItem(a)) {
    const byDays = compareDesc(toFiniteNumber(a.ad_active_days), toFiniteNumber(b.ad_active_days));
    if (byDays !== 0) return byDays;
  } else {
    const byEngagement = compareDesc(toFiniteNumber(a.engagement), toFiniteNumber(b.engagement));
    if (byEngagement !== 0) return byEngagement;
  }

  return compareDesc(timestampMs(a.posted_at), timestampMs(b.posted_at)) || compareId(a, b);
}

export function sortHotspotItems<T extends HotspotSortableItem>(
  items: readonly T[],
  sort: HotspotSortKey,
): T[] {
  return [...items].sort((a, b) => compareBySort(a, b, sort));
}

// ============================================================
// 預算
// ============================================================

export interface HotspotBudgetPrices {
  /** IG 類（帳號／Hashtag）單價，US$ / 1,000 筆 */
  standardUsd: number;
  /** 廣告類單價，US$ / 1,000 條 */
  adsUsd: number;
}

export function unitPriceForKind(kind: HotspotKind, prices: HotspotBudgetPrices): number {
  const value = kind === 'ad_keyword' ? prices.adsUsd : prices.standardUsd;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** 每個目標實際取幾筆：受設定上限與類型預設同時限制；非法設定值 → 用該類型上限 */
export function itemsForKind(kind: HotspotKind, itemsPerTarget: unknown): number {
  const cap =
    kind === 'account'
      ? HOTSPOT_ACCOUNT_ITEMS
      : kind === 'hashtag'
        ? HOTSPOT_TAG_ITEMS
        : HOTSPOT_AD_ITEMS;
  const requested = Math.floor(toFiniteNumber(itemsPerTarget));
  const safe = Number.isFinite(requested) && requested > 0 ? requested : cap;
  return Math.min(Math.max(safe, 1), cap);
}

export function estimateCostUsd(itemCount: unknown, unitPricePer1000: unknown): number {
  const count = Math.max(0, toFiniteNumber(itemCount));
  const unit = Math.max(0, toFiniteNumber(unitPricePer1000));
  return roundTo((count * unit) / 1000, 4);
}

export interface HotspotBudgetPlan {
  allowed: number;
  trimmed: number;
  blocked: boolean;
  estimatedUsd: number;
}

/**
 * 逐個目標累加成本（不是一次除法）：三類目標每目標筆數不同，
 * 用單一 items_per_target 算會高估帳號類成本、把還能抓的目標白白裁掉。
 */
export function planBudget(input: {
  kinds: readonly HotspotKind[];
  itemsPerTarget: unknown;
  spentUsd: unknown;
  budgetUsd: unknown;
  prices: HotspotBudgetPrices;
}): HotspotBudgetPlan {
  const kinds = input.kinds;
  if (kinds.length === 0) return { allowed: 0, trimmed: 0, blocked: false, estimatedUsd: 0 };

  const budget = Math.max(0, toFiniteNumber(input.budgetUsd));
  const spent = Math.max(0, toFiniteNumber(input.spentUsd));

  if (spent >= budget) {
    return { allowed: 0, trimmed: kinds.length, blocked: true, estimatedUsd: 0 };
  }

  let remaining = budget - spent;
  let allowed = 0;
  let estimated = 0;

  for (const kind of kinds) {
    const cost = estimateCostUsd(
      itemsForKind(kind, input.itemsPerTarget),
      unitPriceForKind(kind, input.prices),
    );
    // 容許浮點誤差：成本剛好等於剩餘額度時仍然可抓
    if (cost > remaining + 1e-9) break;
    remaining -= cost;
    estimated += cost;
    allowed += 1;
  }

  return {
    allowed,
    trimmed: kinds.length - allowed,
    blocked: allowed === 0,
    estimatedUsd: roundTo(estimated, 4),
  };
}

// ============================================================
// 月花費（以香港時區切月）
// ============================================================

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

/** `YYYY-MM`（Asia/Hong_Kong）；非法日期回空字串 */
export function hongKongMonthKey(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) return '';
  const shifted = new Date(time + HK_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** 本月（HK）已花費；now 可注入以便測試 */
export function monthSpend(
  runs: readonly { started_at: string; cost_usd: number }[],
  now: Date = new Date(),
): number {
  const key = hongKongMonthKey(now);
  if (!key) return 0;
  let total = 0;
  for (const run of runs) {
    if (hongKongMonthKey(run.started_at) !== key) continue;
    total += Math.max(0, toFiniteNumber(run.cost_usd));
  }
  return roundTo(total, 4);
}

export type HotspotBudgetState = 'ok' | 'warn' | 'block';

/**
 * 這次 run 之後還有多少目標沒抓到。
 * 「手動指定目標」的 scan 不能用「全部啟用數」算，否則會回一個永遠不準的剩餘數。
 */
export function computeTargetsRemaining(input: {
  scope: 'all' | 'selected';
  totalActive: number;
  selected: number;
  fetched: number;
}): number {
  const fetched = Math.max(0, Math.floor(toFiniteNumber(input.fetched)));
  const basis = input.scope === 'selected' ? input.selected : input.totalActive;
  return Math.max(0, Math.floor(toFiniteNumber(basis)) - fetched);
}

/** 80% 黃色、100% 紅色；上限 0 且已有花費視為超支 */
export function budgetState(spent: unknown, budget: unknown): HotspotBudgetState {
  const budgetValue = Math.max(0, toFiniteNumber(budget));
  const spentValue = Math.max(0, toFiniteNumber(spent));
  if (budgetValue <= 0) return spentValue > 0 ? 'block' : 'ok';
  const ratio = spentValue / budgetValue;
  if (ratio >= 1) return 'block';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

/** 用量百分比（0–100，1 位小數）；上限 0 且超支回 100 */
export function budgetPercent(spent: unknown, budget: unknown): number {
  const budgetValue = Math.max(0, toFiniteNumber(budget));
  const spentValue = Math.max(0, toFiniteNumber(spent));
  if (budgetValue <= 0) return spentValue > 0 ? 100 : 0;
  return Math.round((spentValue / budgetValue) * 1000) / 10;
}

// ============================================================
// Provider payload 映射（容錯，不拋錯）
// ============================================================

/** 供應商回來的原始一列 → 統一草稿（由 persist 補 engagement／median 等欄位） */
export interface HotspotItemDraft {
  platform: HotspotPlatform;
  source_kind: HotspotKind;
  external_id: string;
  url: string;
  media_type: HotspotMediaType;
  caption: string | null;
  thumbnail_url: string | null;
  author_handle: string | null;
  author_name: string | null;
  author_followers: number | null;
  posted_at: string | null;
  likes: number;
  comments: number;
  plays: number | null;
  ad_started_at: string | null;
  ad_active_days: number | null;
  ad_status: string | null;
  raw: Record<string, unknown>;
}

const ID_KEYS = ['id', 'shortcode', 'shortCode', 'code', 'pk', 'adArchiveId', 'ad_archive_id', 'archiveId', 'adId', 'ad_id'];
const URL_KEYS = ['url', 'permalink', 'postUrl', 'post_url', 'link', 'adUrl', 'ad_url', 'snapshotUrl', 'snapshot_url', 'displayUrl'];
const CAPTION_KEYS = ['caption', 'text', 'adText', 'ad_text', 'body', 'title', 'description'];
const THUMB_KEYS = ['displayUrl', 'thumbnailUrl', 'thumbnail_url', 'thumbnail', 'thumb', 'previewImage', 'imageUrl'];
const AUTHOR_HANDLE_KEYS = ['ownerUsername', 'owner_username', 'username', 'authorUsername', 'author_username', 'pageName', 'page_name', 'owner'];
const AUTHOR_NAME_KEYS = ['ownerFullName', 'owner_full_name', 'fullName', 'authorName', 'author_name', 'advertiserName', 'advertiser'];
const FOLLOWERS_KEYS = ['ownerFollowers', 'owner_followers', 'followersCount', 'followers_count', 'followers'];
const DATE_KEYS = ['timestamp', 'takenAt', 'taken_at', 'createTime', 'createdAt', 'created_at', 'publishedAt', 'published_at', 'date', 'startDate', 'start_date', 'startedAt'];
const LIKES_KEYS = ['likes', 'like_count', 'likeCount', 'likesCount', 'likes_count', 'reactions'];
const COMMENTS_KEYS = ['comments', 'comment_count', 'commentCount', 'commentsCount', 'comments_count'];
const PLAYS_KEYS = ['plays', 'videoPlayCount', 'video_play_count', 'play_count', 'playCount', 'videoViewCount', 'viewCount', 'views'];
const MEDIA_TYPE_KEYS = ['mediaType', 'media_type', 'productType', 'product_type', 'type'];
const AD_STATUS_KEYS = ['isActive', 'is_active', 'status', 'adStatus', 'ad_status'];

function coerceText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['username', 'name', 'handle', 'text', 'displayName', 'title']) {
      const nested = record[key];
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
  }
  return '';
}

function pickText(source: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const text = coerceText(source[key]);
    if (text) return text;
  }
  return '';
}

function pickNumber(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = toNullableNumber(source[key]);
    if (value !== null) return value;
  }
  return null;
}

/** 接受 ISO、`YYYY-MM-DD HH:mm:ss`、unix 秒／毫秒；非法回 null */
export function parseLooseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value > 1e8 ? value * 1000 : NaN;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    return parseLooseDate(Number(text));
  }

  // 沒有時區標記的日期時間一律當 UTC：否則同一筆資料在本機（+8）與
  // Supabase Edge Function（UTC）會算出不同時間，是不可接受的環境相依 bug。
  const hasOffset = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text);
  const looksLikeNaiveDateTime = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text);
  const normalized =
    !hasOffset && looksLikeNaiveDateTime ? `${text.replace(' ', 'T')}Z` : text;

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function pickDate(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const parsed = parseLooseDate(source[key]);
    if (parsed) return parsed;
  }
  return null;
}

/** 這些字只表示「在動態裡」，不是 Reel／影片／圖文／輪播。不能拿來當媒體類型。 */
const NON_MEDIA_TYPE_VALUES = new Set(['feed', 'post', 'story', 'media', 'item', 'graph']);

function normalizeMediaType(raw: string, kind: HotspotKind): HotspotMediaType {
  if (kind === 'ad_keyword') return 'ad';
  const value = raw.toLowerCase().trim();
  if (!value || NON_MEDIA_TYPE_VALUES.has(value)) return 'unknown';
  if (value.includes('reel') || value.includes('clip')) return 'reel';
  if (value.includes('carousel') || value.includes('sidecar') || value === 'album') return 'carousel';
  if (value.includes('igtv') || value.includes('video')) return 'video';
  if (value.includes('image') || value.includes('photo') || value.includes('picture')) return 'image';
  return 'unknown';
}

/**
 * 依序看每個類型欄位，跳過認不出來的值。
 *
 * Apify 常見 `productType: "feed"` 排在真正的 `type: "Image"` 前面；
 * 只取第一個欄位會把整批貼文寫成 unknown。
 */
function mediaTypeFromSource(source: Record<string, unknown>, kind: HotspotKind): HotspotMediaType {
  if (kind === 'ad_keyword') return 'ad';
  for (const key of MEDIA_TYPE_KEYS) {
    const mapped = normalizeMediaType(coerceText(source[key]), kind);
    if (mapped !== 'unknown') return mapped;
  }
  if (source.is_video === true || source.isVideo === true) return 'video';
  return 'unknown';
}

/**
 * IG 官方 oEmbed 的標準網址＋封面 CDN。
 *
 * - permalink 含 `/reel/` → Reel（即使封面也在影片 CDN）
 * - permalink 含 `/tv/`，或封面在影片縮圖桶 `t51.*`（排除頭像桶 `t51.2885`）→ 影片
 * - 其餘帳號貼文 → 圖文
 *
 * RSS 本身沒有媒體類型。帳號貼文不回 unknown：沒有訊號時圖文是這個來源的保底，
 * 輪播要有多張素材才分得出來，這個來源沒有。
 */
export function classifyInstagramMediaType(input: {
  permalink?: string | null;
  thumbnailUrl?: string | null;
}): 'reel' | 'video' | 'image' {
  const permalink = String(input.permalink ?? '').replace(/&amp;/g, '&');
  if (/instagram\.com\/reel\//i.test(permalink)) return 'reel';
  if (/instagram\.com\/tv\//i.test(permalink)) return 'video';
  const thumb = String(input.thumbnailUrl ?? '');
  if (/\/t51\.(?!2885\b)/i.test(thumb)) return 'video';
  return 'image';
}

/** 從 oEmbed HTML 取出標準網址（含 `/reel/` 或 `/p/`）。 */
export function instagramPermalinkFromOEmbedHtml(html: string): string {
  const match = String(html ?? '').match(/data-instgrm-permalink=["']([^"']+)["']/i);
  return match?.[1]?.replace(/&amp;/g, '&').trim() ?? '';
}

function normalizeAdStatus(raw: unknown): string | null {
  if (typeof raw === 'boolean') return raw ? 'active' : 'inactive';
  const text = coerceText(raw).toLowerCase();
  if (!text) return null;
  if (text.includes('inactive') || text === 'false' || text === 'stopped' || text === 'ended') return 'inactive';
  if (text.includes('active') || text === 'true' || text === 'running') return 'active';
  return null;
}

/**
 * 只有 http(s) 可以放進 <a href>。
 *
 * 供應商 payload 是不可信輸入；`javascript:`／`data:` 之類 scheme 會被瀏覽器執行，
 * 因此在寫庫前就擋掉（不合格時退回由 external_id 組出的原帖網址）。
 */
export function safeExternalUrl(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildItemUrl(platform: HotspotPlatform, kind: HotspotKind, externalId: string): string {
  if (kind === 'ad_keyword' || platform === 'facebook') {
    return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(externalId)}`;
  }
  if (/^[A-Za-z0-9_-]{5,30}$/.test(externalId)) {
    return `https://www.instagram.com/p/${encodeURIComponent(externalId)}/`;
  }
  return '';
}

function daysBetween(startIso: string, nowMs: number): number | null {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((nowMs - start) / 86_400_000));
}

/**
 * 把供應商 payload 轉成統一草稿。
 * 任何缺欄位都容錯；連 id 都沒有就回 null（不入庫）。
 * 不拋錯：外層仍包 try/catch 保底。
 */
export function mapProviderItem(
  raw: unknown,
  options: { kind: HotspotKind; platform?: HotspotPlatform; now?: Date },
): HotspotItemDraft | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw as Record<string, unknown>;
    const kind = options.kind;
    const platform = options.platform ?? platformForKind(kind);
    const nowMs = (options.now ?? new Date()).getTime();

    const externalId = pickText(source, ID_KEYS);
    if (!externalId) return null;

    const urlFromPayload = pickText(source, URL_KEYS);
    const url = safeExternalUrl(urlFromPayload) ?? buildItemUrl(platform, kind, externalId);
    if (!url) return null;

    const postedAt = pickDate(source, DATE_KEYS);
    const adStartedAt = kind === 'ad_keyword' ? pickDate(source, DATE_KEYS) : null;
    const adStartDate = adStartedAt ? adStartedAt.slice(0, 10) : null;

    const likes = Math.max(0, Math.floor(pickNumber(source, LIKES_KEYS) ?? 0));
    const comments = Math.max(0, Math.floor(pickNumber(source, COMMENTS_KEYS) ?? 0));
    const playsRaw = pickNumber(source, PLAYS_KEYS);

    const caption = pickText(source, CAPTION_KEYS);
    const thumbnail = pickText(source, THUMB_KEYS);

    return {
      platform,
      source_kind: kind,
      external_id: externalId,
      url,
      media_type: mediaTypeFromSource(source, kind),
      caption: caption || null,
      thumbnail_url: thumbnail || null,
      author_handle: pickText(source, AUTHOR_HANDLE_KEYS) || null,
      author_name: pickText(source, AUTHOR_NAME_KEYS) || null,
      author_followers:
        pickNumber(source, FOLLOWERS_KEYS) === null
          ? null
          : Math.max(0, Math.floor(pickNumber(source, FOLLOWERS_KEYS) as number)),
      posted_at: postedAt,
      likes,
      comments,
      plays: playsRaw === null ? null : Math.max(0, Math.floor(playsRaw)),
      ad_started_at: adStartDate,
      ad_active_days: adStartDate ? daysBetween(`${adStartDate}T00:00:00.000Z`, nowMs) : null,
      ad_status: kind === 'ad_keyword' ? normalizeAdStatus(pickStatusSource(source)) : null,
      raw: source,
    };
  } catch {
    return null;
  }
}

function pickStatusSource(source: Record<string, unknown>): unknown {
  for (const key of AD_STATUS_KEYS) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

/** 供應商錯誤 → 內部錯誤碼（給 Edge Function 用；純函式方便測試） */
export function classifyProviderStatus(status: number): {
  code: 'provider_auth_failed' | 'provider_rate_limited' | 'provider_unavailable';
  retryable: boolean;
} {
  if (status === 401 || status === 403) {
    return { code: 'provider_auth_failed', retryable: false };
  }
  if (status === 429) {
    return { code: 'provider_rate_limited', retryable: true };
  }
  return { code: 'provider_unavailable', retryable: true };
}

// ============================================================
// 寫庫 payload（在純函式層組裝，讓 DB 契約可被自測守住）
// ============================================================

export interface HotspotComputedFields {
  engagement: number;
  account_median_engagement: number | null;
  relative_heat: number | null;
  sample_size: number;
  low_sample: boolean;
}

/**
 * 算出一則內容的衍生欄位。
 * - 帳號類才會有 median／relative_heat；非帳號類一律 NULL（樣本 0、low_sample false）
 * - 帳號類樣本 <5 → low_sample true
 */
export function computeItemComputed(
  draft: Pick<HotspotItemDraft, 'source_kind' | 'likes' | 'comments'>,
  median: number | null,
  sample: number,
): HotspotComputedFields {
  const engagement = engagementOf(draft.likes, draft.comments);

  if (draft.source_kind !== 'account' || median === null) {
    return {
      engagement,
      account_median_engagement: null,
      relative_heat: null,
      sample_size: 0,
      low_sample: false,
    };
  }

  const heat = computeRelativeHeat(engagement, median, sample);
  return {
    engagement,
    account_median_engagement: roundTo(toFiniteNumber(median), 2),
    relative_heat: heat.relative_heat,
    sample_size: Math.max(0, Math.floor(toFiniteNumber(sample))),
    low_sample: heat.low_sample,
  };
}

/**
 * upsert 用的 payload。
 * 刻意不含 `first_seen_at`（保留首次）與 `captured_at`；也不含任何 favorites／status 欄位，
 * 否則會把使用者已做的判斷覆蓋掉。
 */
export function buildItemPayload(
  draft: HotspotItemDraft,
  computed: HotspotComputedFields,
  targetId: string | null = null,
  capturedAt: Date = new Date(),
): Record<string, unknown> {
  return {
    platform: draft.platform,
    source_kind: draft.source_kind,
    target_id: targetId,
    external_id: draft.external_id,
    url: draft.url,
    media_type: draft.media_type,
    caption: draft.caption,
    thumbnail_url: draft.thumbnail_url,
    author_handle: draft.author_handle,
    author_name: draft.author_name,
    author_followers: draft.author_followers,
    posted_at: draft.posted_at,
    likes: draft.likes,
    comments: draft.comments,
    plays: draft.plays,
    engagement: computed.engagement,
    account_median_engagement: computed.account_median_engagement,
    relative_heat: computed.relative_heat,
    sample_size: computed.sample_size,
    low_sample: computed.low_sample,
    ad_started_at: draft.ad_started_at,
    ad_active_days: draft.ad_active_days,
    ad_status: draft.ad_status,
    last_seen_at: capturedAt.toISOString(),
    raw: draft.raw,
  };
}
