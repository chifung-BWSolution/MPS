/**
 * 熱點雷達 · 列表查詢契約
 *
 * 卡片第一頁由 Postgres view `hotspot_feed` 排序後只回 30 筆。
 * 這裡的排序鍵必須與 `sortHotspotItems` / `compareBySort` 全序一致，
 * 也必須與 migration `hotspot_feed` 的 CASE 一致。改一邊就要改另外兩邊。
 *
 * 純函式：不碰 supabase、React、瀏覽器。
 */

import {
  HOTSPOT_AD_LONG_RUNNING_DAYS,
  HOTSPOT_RELATIVE_HEAT_MIN,
  HOTSPOT_SORT_KEYS,
  isHotItem,
  relativeHeatLayer,
  toFiniteNumber,
  toNullableNumber,
} from './hotspotRadar.ts';
import type {
  HotspotKind,
  HotspotPlatform,
  HotspotSortableItem,
  HotspotSortKey,
} from '../types/hotspotRadar.ts';

export const HOTSPOT_PAGE_SIZE = 30;

export type HotspotSourceTab = 'all' | 'account' | 'hashtag' | 'ad_keyword' | 'library';

export interface HotspotFilters {
  source: HotspotSourceTab;
  platform: 'all' | 'instagram' | 'facebook';
  /** 以 posted_at 為準的回看天數 */
  days: 7 | 30 | 90;
  media: 'all' | 'reel' | 'video' | 'image' | 'carousel' | 'ad';
  onlyHot: boolean;
  onlyUnfavorited: boolean;
  sort: HotspotSortKey;
}

export type HotspotFeedCounts = Record<HotspotSourceTab, number>;

export const DEFAULT_FILTERS: HotspotFilters = {
  source: 'all',
  platform: 'all',
  days: 30,
  media: 'all',
  onlyHot: false,
  onlyUnfavorited: false,
  sort: 'composite',
};

const SOURCES: readonly HotspotSourceTab[] = ['all', 'account', 'hashtag', 'ad_keyword', 'library'];
const PLATFORMS: readonly HotspotFilters['platform'][] = ['all', 'instagram', 'facebook'];
const DAY_CHOICES: readonly HotspotFilters['days'][] = [7, 30, 90];
const MEDIAS: readonly HotspotFilters['media'][] = ['all', 'reel', 'video', 'image', 'carousel', 'ad'];

export function sanitizeHotspotFilters(input: Partial<HotspotFilters> | null | undefined): HotspotFilters {
  const source = SOURCES.includes(input?.source as HotspotSourceTab)
    ? (input?.source as HotspotSourceTab)
    : DEFAULT_FILTERS.source;
  const platform = PLATFORMS.includes(input?.platform as HotspotFilters['platform'])
    ? (input?.platform as HotspotFilters['platform'])
    : DEFAULT_FILTERS.platform;
  const days = DAY_CHOICES.includes(input?.days as HotspotFilters['days'])
    ? (input?.days as HotspotFilters['days'])
    : DEFAULT_FILTERS.days;
  const media = MEDIAS.includes(input?.media as HotspotFilters['media'])
    ? (input?.media as HotspotFilters['media'])
    : DEFAULT_FILTERS.media;
  const sort = HOTSPOT_SORT_KEYS.includes(input?.sort as HotspotSortKey)
    ? (input?.sort as HotspotSortKey)
    : DEFAULT_FILTERS.sort;
  return {
    source,
    platform,
    days,
    media,
    onlyHot: input?.onlyHot === true,
    onlyUnfavorited: input?.onlyUnfavorited === true,
    sort,
  };
}

export interface HotspotFeedOrder {
  column:
    | 'heat_layer'
    | 'ad_rank'
    | 'rank_metric'
    | 'relative_heat'
    | 'relative_tie'
    | 'engagement'
    | 'posted_at'
    | 'ad_active_days'
    | 'id';
  ascending: boolean;
  /** false = NULLS LAST。可為 NULL 的降序欄位一定要設，否則 Postgres 預設 NULLS FIRST。 */
  nullsFirst?: false;
}

/** 與 view 的 ORDER BY 同一組欄位。 */
export function hotspotFeedOrder(sort: HotspotSortKey): readonly HotspotFeedOrder[] {
  const id: HotspotFeedOrder = { column: 'id', ascending: true };
  const posted: HotspotFeedOrder = { column: 'posted_at', ascending: false, nullsFirst: false };
  const engagement: HotspotFeedOrder = { column: 'engagement', ascending: false };
  switch (sort) {
    case 'engagement':
      return [engagement, posted, id];
    case 'relative':
      return [
        { column: 'relative_heat', ascending: false, nullsFirst: false },
        { column: 'relative_tie', ascending: false },
        id,
      ];
    case 'newest':
      return [posted, engagement, id];
    case 'ad_days':
      return [
        { column: 'ad_active_days', ascending: false, nullsFirst: false },
        engagement,
        id,
      ];
    default:
      return [
        { column: 'heat_layer', ascending: true },
        { column: 'ad_rank', ascending: true },
        { column: 'rank_metric', ascending: false },
        posted,
        id,
      ];
  }
}

/**
 * PostgREST `or` 參數本體（呼叫端會再包一層括號）。
 * 時間窗一律保留 posted_at IS NULL（PRD §7.2）。
 */
export function feedOrFilter(filters: Pick<HotspotFilters, 'days' | 'onlyHot'>, now = Date.now()): string {
  const cutoff = new Date(now - filters.days * 86_400_000).toISOString();
  const window = `posted_at.is.null,posted_at.gte."${cutoff}"`;
  if (!filters.onlyHot) return window;
  const hot =
    `and(source_kind.eq.ad_keyword,ad_active_days.gte.${HOTSPOT_AD_LONG_RUNNING_DAYS}),` +
    `and(source_kind.neq.ad_keyword,relative_heat.gte.${HOTSPOT_RELATIVE_HEAT_MIN})`;
  return `and(or(${window}),or(${hot}))`;
}

export interface HotspotFeedVisibleItem {
  source_kind: HotspotKind;
  platform: HotspotPlatform;
  media_type: string;
  posted_at: string | null;
  relative_heat?: number | null;
  ad_active_days?: number | null;
  favorite: unknown | null;
}

/** 與 feedOrFilter / 欄位篩選同一套條件，給收藏後的本地列做增刪。 */
export function feedItemVisible(item: HotspotFeedVisibleItem, filters: HotspotFilters, now = Date.now()): boolean {
  if (filters.source === 'library') {
    if (!item.favorite) return false;
  } else if (filters.source !== 'all' && item.source_kind !== filters.source) {
    return false;
  }

  if (filters.source !== 'library' && filters.onlyUnfavorited && item.favorite) return false;
  if (filters.platform !== 'all' && item.platform !== filters.platform) return false;
  if (filters.media !== 'all' && item.media_type !== filters.media) return false;
  if (filters.onlyHot && !isHotItem(item)) return false;

  if (item.posted_at) {
    const time = Date.parse(item.posted_at);
    if (Number.isFinite(time) && now - time > filters.days * 86_400_000) return false;
  }
  return true;
}

function postedKey(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * 升序比較用的排序鍵，對應 view 欄位：
 *   降序欄位取負值；NULL 在降序時用 +Infinity（排最後）。
 * 相對熱度兩邊都是 NULL 時，JS 只比 id、不比互動，所以 relative_tie 在 NULL 時是 0。
 */
export function feedSortTuple(item: HotspotSortableItem, sort: HotspotSortKey): ReadonlyArray<number | string> {
  const posted = postedKey(item.posted_at);
  const engagement = toFiniteNumber(item.engagement);
  const id = String(item.id ?? '');

  switch (sort) {
    case 'engagement':
      return [-engagement, -posted, id];
    case 'relative': {
      const heat = toNullableNumber(item.relative_heat);
      const heatKey = heat === null ? Number.POSITIVE_INFINITY : -heat;
      const tie = heat === null ? 0 : engagement;
      return [heatKey, -tie, id];
    }
    case 'newest':
      return [-posted, -engagement, id];
    case 'ad_days': {
      const days = toNullableNumber(item.ad_active_days);
      const daysKey = days === null ? Number.POSITIVE_INFINITY : -days;
      return [daysKey, -engagement, id];
    }
    default: {
      const layer = relativeHeatLayer(item.relative_heat);
      const ad = item.source_kind === 'ad_keyword' ? 1 : 0;
      const metric = ad === 1 ? toFiniteNumber(item.ad_active_days) : engagement;
      return [layer, ad, -metric, -posted, id];
    }
  }
}

function compareFeedTuples(left: ReadonlyArray<number | string>, right: ReadonlyArray<number | string>): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (typeof a === 'string' || typeof b === 'string') {
      const diff = String(a).localeCompare(String(b));
      if (diff !== 0) return diff;
      continue;
    }
    return a < b ? -1 : 1;
  }
  return 0;
}

export function sortByFeedRank<T extends HotspotSortableItem>(items: readonly T[], sort: HotspotSortKey): T[] {
  return [...items].sort((a, b) => compareFeedTuples(feedSortTuple(a, sort), feedSortTuple(b, sort)));
}
