import { addDaysIso } from '@/lib/adsDailySeries';
import { formatMoneyFromMicros } from '@/lib/formatMoney';
import type { AdsTag } from '@/types/adsTags';
import {
  ADS_COST_TREND_BUCKET_IDS,
  type AdsClickTrendMetric,
  type AdsCostTrendBrandRow,
  type AdsCostTrendBucketId,
  type AdsCostTrendBucketRange,
  type AdsCostTrendBuckets,
  type AdsCostTrendCampaign,
  type AdsCostTrendFilters,
  type AdsCostTrendSortDir,
  type AdsCostTrendSortKey,
} from '@/types/adsCostTrend';

export const UNASSIGNED_BRAND_ID = '__unassigned__';
export const ADS_COST_TREND_MAX_MONTHS = 6;
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export const ADS_COST_TREND_BUCKETS: {
  id: AdsCostTrendBucketId;
  label: string;
  fromOffset: number;
  toOffset: number;
}[] = [
  { id: 'd0_30', label: '<30 Days', fromOffset: 0, toOffset: 29 },
  { id: 'd31_60', label: '31-60 Days', fromOffset: 30, toOffset: 59 },
  { id: 'd61_90', label: '61-90 Days', fromOffset: 60, toOffset: 89 },
  { id: 'd91_120', label: '91-120 Days', fromOffset: 90, toOffset: 119 },
  { id: 'd121_150', label: '121-150 Days', fromOffset: 120, toOffset: 149 },
  { id: 'd151_180', label: '151-180 Days', fromOffset: 150, toOffset: 179 },
];

export function emptyCostTrendBuckets(
  ids: readonly string[] = ADS_COST_TREND_BUCKET_IDS,
): AdsCostTrendBuckets {
  return Object.fromEntries(ids.map((id) => [id, 0]));
}

export function bucketIdsFrom(buckets: AdsCostTrendBuckets | undefined): string[] {
  const ids = buckets ? Object.keys(buckets) : [];
  return ids.length > 0 ? ids : [...ADS_COST_TREND_BUCKET_IDS];
}

export function buildCostTrendBucketRanges(asOf: string): AdsCostTrendBucketRange[] {
  return ADS_COST_TREND_BUCKETS.map((bucket) => ({
    ...bucket,
    from: addDaysIso(asOf, -bucket.toOffset),
    to: addDaysIso(asOf, -bucket.fromOffset),
  }));
}

export function isMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value);
}

export function currentMonthKey(asOf: string): string {
  return asOf.slice(0, 7);
}

export function addMonthsToKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthStartIso(monthKey: string): string {
  return `${monthKey}-01`;
}

export function monthEndIso(monthKey: string, asOf?: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  if (asOf && monthKey === currentMonthKey(asOf) && asOf < end) return asOf;
  return end;
}

export function monthsInclusive(fromMonth: string, toMonth: string): string[] {
  if (!isMonthKey(fromMonth) || !isMonthKey(toMonth) || fromMonth > toMonth) return [];
  const out: string[] = [];
  let cursor = fromMonth;
  while (cursor <= toMonth) {
    out.push(cursor);
    cursor = addMonthsToKey(cursor, 1);
  }
  return out;
}

export function monthSpan(fromMonth: string, toMonth: string): number {
  return monthsInclusive(fromMonth, toMonth).length;
}

export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return `${year}年${Number(month)}月`;
}

export function defaultMonthlyRange(asOf: string): { from: string; to: string } {
  const to = currentMonthKey(asOf);
  return { from: addMonthsToKey(to, -(ADS_COST_TREND_MAX_MONTHS - 1)), to };
}

export function clampSelectedMonthRange(
  fromMonth: string,
  toMonth: string,
  asOf: string,
  changed: 'from' | 'to',
): { from: string; to: string } {
  const maxMonth = currentMonthKey(asOf);
  let from = isMonthKey(fromMonth) ? fromMonth : defaultMonthlyRange(asOf).from;
  let to = isMonthKey(toMonth) ? toMonth : defaultMonthlyRange(asOf).to;
  if (from > maxMonth) from = maxMonth;
  if (to > maxMonth) to = maxMonth;
  if (from > to) {
    if (changed === 'from') to = from;
    else from = to;
  }
  if (monthSpan(from, to) > ADS_COST_TREND_MAX_MONTHS) {
    if (changed === 'from') {
      to = addMonthsToKey(from, ADS_COST_TREND_MAX_MONTHS - 1);
      if (to > maxMonth) to = maxMonth;
    } else {
      from = addMonthsToKey(to, -(ADS_COST_TREND_MAX_MONTHS - 1));
    }
  }
  return { from, to };
}

export function buildMonthlyBucketRanges(
  fromMonth: string,
  toMonth: string,
  asOf: string,
): AdsCostTrendBucketRange[] {
  const clamped = clampSelectedMonthRange(fromMonth, toMonth, asOf, 'to');
  return monthsInclusive(clamped.from, clamped.to).map((id) => ({
    id,
    label: formatMonthLabel(id),
    from: monthStartIso(id),
    to: monthEndIso(id, asOf),
  }));
}

export function addCostTrendBuckets(
  target: AdsCostTrendBuckets,
  source: AdsCostTrendBuckets,
): AdsCostTrendBuckets {
  for (const id of Object.keys(source)) {
    target[id] = (target[id] ?? 0) + (source[id] ?? 0);
  }
  return target;
}

export function sumCostTrendBuckets(buckets: AdsCostTrendBuckets): number {
  return Object.values(buckets).reduce((sum, value) => sum + (value ?? 0), 0);
}

export function formatCostTrendMoney(micros: number): string {
  return formatMoneyFromMicros(micros);
}

export function costTrendUnitCostMicros(costMicros: number, units: number): number | null {
  if (!(units > 0)) return null;
  return Math.round(costMicros / units);
}

export function formatCostTrendRate(micros: number | null): string {
  if (micros == null) return '—';
  return formatCostTrendMoney(micros);
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hant', { sensitivity: 'base', numeric: true });
}

function campaignMatchesSearch(campaign: AdsCostTrendCampaign, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    campaign.campaignName.toLowerCase().includes(q) ||
    campaign.accountName.toLowerCase().includes(q) ||
    campaign.accountId.toLowerCase().includes(q) ||
    campaign.campaignId.toLowerCase().includes(q) ||
    campaign.status.toLowerCase().includes(q) ||
    campaign.objectives.some((objective) => objective.toLowerCase().includes(q)) ||
    campaign.tags.some((tag) => tag.name.toLowerCase().includes(q))
  );
}

function brandMatchesSearch(brandCode: string, displayName: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return brandCode.toLowerCase().includes(q) || displayName.toLowerCase().includes(q);
}

export function filterCostTrendCampaigns(
  campaigns: AdsCostTrendCampaign[],
  filters: AdsCostTrendFilters,
): AdsCostTrendCampaign[] {
  return campaigns.filter((campaign) => {
    if (filters.platform !== 'all' && campaign.platform !== filters.platform) return false;
    if (filters.objective !== 'all') {
      if (!campaign.objectives.includes(filters.objective)) return false;
    }
    const tags = campaign.tags;
    if (filters.tag === 'none' && tags.length > 0) return false;
    if (filters.tag !== 'all' && filters.tag !== 'none' && !tags.some((tag) => tag.id === filters.tag)) {
      return false;
    }
    return true;
  });
}

export function collectCostTrendObjectives(
  campaigns: AdsCostTrendCampaign[],
  platform: AdsCostTrendFilters['platform'],
): string[] {
  const set = new Set<string>();
  for (const campaign of campaigns) {
    if (platform !== 'all' && campaign.platform !== platform) continue;
    for (const objective of campaign.objectives) {
      if (objective) set.add(objective);
    }
  }
  return [...set].sort((a, b) => compareText(a, b));
}

type BrandMeta = {
  id: string;
  brandCode: string;
  displayName: string;
};

export function groupCostTrendByBrand(
  campaigns: AdsCostTrendCampaign[],
  brands: BrandMeta[],
  search: string,
): AdsCostTrendBrandRow[] {
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const groups = new Map<string, AdsCostTrendBrandRow>();

  const ensureGroup = (brandId: string): AdsCostTrendBrandRow => {
    const existing = groups.get(brandId);
    if (existing) return existing;
    const brand = brandById.get(brandId);
    const ids = bucketIdsFrom(campaigns[0]?.buckets);
    const row: AdsCostTrendBrandRow = {
      brandId,
      brandCode: brand?.brandCode || (brandId === UNASSIGNED_BRAND_ID ? '未設定品牌' : brandId),
      displayName: brand?.displayName || (brandId === UNASSIGNED_BRAND_ID ? '未設定品牌' : brandId),
      campaigns: [],
      buckets: emptyCostTrendBuckets(ids),
      impressionBuckets: emptyCostTrendBuckets(ids),
      clickBuckets: emptyCostTrendBuckets(ids),
      conversionBuckets: emptyCostTrendBuckets(ids),
      totalMicros: 0,
    };
    groups.set(brandId, row);
    return row;
  };

  for (const campaign of campaigns) {
    if (sumCostTrendBuckets(campaign.buckets) <= 0) continue;
    const brandIds = campaign.brandListIds.length > 0 ? campaign.brandListIds : [UNASSIGNED_BRAND_ID];
    const uniqueBrandIds = [...new Set(brandIds)];
    for (const brandId of uniqueBrandIds) {
      const group = ensureGroup(brandId);
      const brandHit = brandMatchesSearch(group.brandCode, group.displayName, search);
      const campaignHit = campaignMatchesSearch(campaign, search);
      if (search.trim() && !brandHit && !campaignHit) continue;
      group.campaigns.push(campaign);
      addCostTrendBuckets(group.buckets, campaign.buckets);
      addCostTrendBuckets(group.impressionBuckets, campaign.impressionBuckets);
      addCostTrendBuckets(group.clickBuckets, campaign.clickBuckets);
      addCostTrendBuckets(group.conversionBuckets, campaign.conversionBuckets);
      group.totalMicros += campaign.totalMicros;
    }
  }

  const rows = [...groups.values()].filter((row) => row.campaigns.length > 0 && row.totalMicros > 0);
  for (const row of rows) {
    row.campaigns.sort((a, b) => b.totalMicros - a.totalMicros);
  }
  return rows;
}

export function sortCostTrendBrandRows(
  rows: AdsCostTrendBrandRow[],
  sortKey: AdsCostTrendSortKey,
  sortDir: AdsCostTrendSortDir,
): AdsCostTrendBrandRow[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === 'brand') {
      return compareText(a.displayName || a.brandCode, b.displayName || b.brandCode) * dir;
    }
    if (sortKey === 'total') {
      return (a.totalMicros - b.totalMicros) * dir;
    }
    return (a.buckets[sortKey] - b.buckets[sortKey]) * dir;
  });
}

export function uniqueCostTrendCampaigns(campaigns: AdsCostTrendCampaign[]): AdsCostTrendCampaign[] {
  const seen = new Set<string>();
  const out: AdsCostTrendCampaign[] = [];
  for (const campaign of campaigns) {
    if (seen.has(campaign.key)) continue;
    seen.add(campaign.key);
    out.push(campaign);
  }
  return out;
}

export function sumUniqueCampaignMetrics(rows: AdsCostTrendBrandRow[]): {
  campaigns: AdsCostTrendCampaign[];
  buckets: AdsCostTrendBuckets;
  impressionBuckets: AdsCostTrendBuckets;
  clickBuckets: AdsCostTrendBuckets;
  conversionBuckets: AdsCostTrendBuckets;
  totalMicros: number;
  impressions: number;
  clicks: number;
  conversions: number;
  googleMicros: number;
  facebookMicros: number;
} {
  const campaigns = uniqueCostTrendCampaigns(rows.flatMap((row) => row.campaigns));
  const ids = bucketIdsFrom(campaigns[0]?.buckets);
  const buckets = emptyCostTrendBuckets(ids);
  const impressionBuckets = emptyCostTrendBuckets(ids);
  const clickBuckets = emptyCostTrendBuckets(ids);
  const conversionBuckets = emptyCostTrendBuckets(ids);
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  let googleMicros = 0;
  let facebookMicros = 0;
  for (const campaign of campaigns) {
    addCostTrendBuckets(buckets, campaign.buckets);
    addCostTrendBuckets(impressionBuckets, campaign.impressionBuckets);
    addCostTrendBuckets(clickBuckets, campaign.clickBuckets);
    addCostTrendBuckets(conversionBuckets, campaign.conversionBuckets);
    impressions += campaign.impressions;
    clicks += campaign.clicks;
    conversions += campaign.conversions;
    if (campaign.platform === 'google') googleMicros += campaign.totalMicros;
    else facebookMicros += campaign.totalMicros;
  }
  return {
    campaigns,
    buckets,
    impressionBuckets,
    clickBuckets,
    conversionBuckets,
    totalMicros: sumCostTrendBuckets(buckets),
    impressions,
    clicks,
    conversions,
    googleMicros,
    facebookMicros,
  };
}

export function buildCostTrendChartPoints(
  bucketDefs: { id: string; label: string }[],
  totals: AdsCostTrendBuckets,
  google: AdsCostTrendBuckets,
  facebook: AdsCostTrendBuckets,
  brandSeries: { key: string; name: string; buckets: AdsCostTrendBuckets }[],
  divisor = 1_000_000,
): {
  label: string;
  total: number;
  google: number;
  facebook: number;
  [brand: string]: string | number;
}[] {
  const scale = divisor > 0 ? divisor : 1;
  return bucketDefs.map((bucket) => {
    const point: { label: string; total: number; google: number; facebook: number; [brand: string]: string | number } = {
      label: bucket.label,
      total: (totals[bucket.id] ?? 0) / scale,
      google: (google[bucket.id] ?? 0) / scale,
      facebook: (facebook[bucket.id] ?? 0) / scale,
    };
    for (const series of brandSeries) {
      point[series.key] = (series.buckets[bucket.id] ?? 0) / scale;
    }
    return point;
  });
}

export function topBrandSeries(
  rows: AdsCostTrendBrandRow[],
  limit = 5,
): { key: string; name: string; buckets: AdsCostTrendBuckets }[] {
  return [...rows]
    .sort((a, b) => b.totalMicros - a.totalMicros)
    .slice(0, limit)
    .map((row) => ({
      key: `brand:${row.brandId}`,
      name: row.displayName || row.brandCode,
      buckets: row.buckets,
    }));
}

export const ADS_CLICK_TREND_METRIC_OPTIONS: { id: AdsClickTrendMetric; label: string }[] = [
  { id: 'impr', label: 'Impr.' },
  { id: 'clicks', label: 'Clicks' },
  { id: 'conv', label: 'Conv.' },
  { id: 'cpc', label: 'CPC' },
  { id: 'cpa', label: 'CPA' },
];

export function isClickTrendMoneyMetric(metric: AdsClickTrendMetric): boolean {
  return metric === 'cpc' || metric === 'cpa';
}

export function clickTrendMetricNoun(metric: AdsClickTrendMetric): string {
  switch (metric) {
    case 'impr':
      return '曝光';
    case 'clicks':
      return '點擊';
    case 'conv':
      return '轉換';
    case 'cpc':
      return 'CPC';
    case 'cpa':
      return 'CPA';
  }
}

type ClickTrendMetricSource = {
  buckets: AdsCostTrendBuckets;
  impressionBuckets: AdsCostTrendBuckets;
  clickBuckets: AdsCostTrendBuckets;
  conversionBuckets: AdsCostTrendBuckets;
  totalMicros?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
};

export function clickTrendBucketValue(
  source: ClickTrendMetricSource,
  bucketId: string | 'total',
  metric: AdsClickTrendMetric,
): number | null {
  const cost =
    bucketId === 'total'
      ? source.totalMicros ?? sumCostTrendBuckets(source.buckets)
      : (source.buckets[bucketId] ?? 0);
  const impressions =
    bucketId === 'total'
      ? source.impressions ?? sumCostTrendBuckets(source.impressionBuckets)
      : (source.impressionBuckets[bucketId] ?? 0);
  const clicks =
    bucketId === 'total'
      ? source.clicks ?? sumCostTrendBuckets(source.clickBuckets)
      : (source.clickBuckets[bucketId] ?? 0);
  const conversions =
    bucketId === 'total'
      ? source.conversions ?? sumCostTrendBuckets(source.conversionBuckets)
      : (source.conversionBuckets[bucketId] ?? 0);
  switch (metric) {
    case 'impr':
      return impressions;
    case 'clicks':
      return clicks;
    case 'conv':
      return conversions;
    case 'cpc':
      return costTrendUnitCostMicros(cost, clicks);
    case 'cpa':
      return costTrendUnitCostMicros(cost, conversions);
  }
}

export function clickTrendMetricBuckets(
  source: ClickTrendMetricSource,
  metric: AdsClickTrendMetric,
  ids: readonly string[],
): AdsCostTrendBuckets {
  const out = emptyCostTrendBuckets(ids);
  for (const id of ids) {
    out[id] = clickTrendBucketValue(source, id, metric) ?? 0;
  }
  return out;
}

export function formatClickTrendValue(value: number | null, metric: AdsClickTrendMetric): string {
  if (isClickTrendMoneyMetric(metric)) return formatCostTrendRate(value);
  if (value == null) return '—';
  if (metric === 'conv') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return Math.round(value).toLocaleString();
}

export function sortClickTrendBrandRows(
  rows: AdsCostTrendBrandRow[],
  sortKey: AdsCostTrendSortKey,
  sortDir: AdsCostTrendSortDir,
  metric: AdsClickTrendMetric,
): AdsCostTrendBrandRow[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === 'brand') {
      return compareText(a.displayName || a.brandCode, b.displayName || b.brandCode) * dir;
    }
    const bucketId = sortKey === 'total' ? 'total' : sortKey;
    const aVal = clickTrendBucketValue(a, bucketId, metric);
    const bVal = clickTrendBucketValue(b, bucketId, metric);
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    return (aVal - bVal) * dir;
  });
}

export function aggregateClickTrendCampaignBuckets(
  campaigns: AdsCostTrendCampaign[],
  metric: AdsClickTrendMetric,
  ids: readonly string[],
  platform?: AdsCostTrendCampaign['platform'],
): AdsCostTrendBuckets {
  const filtered = platform ? campaigns.filter((campaign) => campaign.platform === platform) : campaigns;
  if (!isClickTrendMoneyMetric(metric)) {
    const out = emptyCostTrendBuckets(ids);
    for (const campaign of filtered) {
      addCostTrendBuckets(out, clickTrendMetricBuckets(campaign, metric, ids));
    }
    return out;
  }
  const cost = emptyCostTrendBuckets(ids);
  const units = emptyCostTrendBuckets(ids);
  for (const campaign of filtered) {
    addCostTrendBuckets(cost, campaign.buckets);
    addCostTrendBuckets(units, metric === 'cpc' ? campaign.clickBuckets : campaign.conversionBuckets);
  }
  const out = emptyCostTrendBuckets(ids);
  for (const id of ids) {
    out[id] = costTrendUnitCostMicros(cost[id] ?? 0, units[id] ?? 0) ?? 0;
  }
  return out;
}

export function topBrandSeriesByMetric(
  rows: AdsCostTrendBrandRow[],
  metric: AdsClickTrendMetric,
  ids: readonly string[],
  limit = 5,
): { key: string; name: string; buckets: AdsCostTrendBuckets }[] {
  return [...rows]
    .sort((a, b) => (clickTrendBucketValue(b, 'total', metric) ?? -1) - (clickTrendBucketValue(a, 'total', metric) ?? -1))
    .slice(0, limit)
    .map((row) => ({
      key: `brand:${row.brandId}`,
      name: row.displayName || row.brandCode,
      buckets: clickTrendMetricBuckets(row, metric, ids),
    }));
}

export function campaignTagMap(
  assignments: { tagId: string; platform: string; campaignRowId: string }[],
  tags: AdsTag[],
): Map<string, AdsTag[]> {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const map = new Map<string, AdsTag[]>();
  for (const assignment of assignments) {
    const tag = tagById.get(assignment.tagId);
    if (!tag) continue;
    const key = `${assignment.platform}:${assignment.campaignRowId}`;
    const list = map.get(key) ?? [];
    list.push(tag);
    map.set(key, list);
  }
  return map;
}
