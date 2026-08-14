import { addDaysIso } from '@/lib/adsDailySeries';
import type { AdsTag } from '@/types/adsTags';
import {
  ADS_COST_TREND_BUCKET_IDS,
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

export function emptyCostTrendBuckets(): AdsCostTrendBuckets {
  return {
    d0_30: 0,
    d31_60: 0,
    d61_90: 0,
    d91_120: 0,
    d121_150: 0,
    d151_180: 0,
  };
}

export function buildCostTrendBucketRanges(asOf: string): AdsCostTrendBucketRange[] {
  return ADS_COST_TREND_BUCKETS.map((bucket) => ({
    ...bucket,
    from: addDaysIso(asOf, -bucket.toOffset),
    to: addDaysIso(asOf, -bucket.fromOffset),
  }));
}

export function addCostTrendBuckets(
  target: AdsCostTrendBuckets,
  source: AdsCostTrendBuckets,
): AdsCostTrendBuckets {
  for (const id of ADS_COST_TREND_BUCKET_IDS) {
    target[id] += source[id];
  }
  return target;
}

export function sumCostTrendBuckets(buckets: AdsCostTrendBuckets): number {
  return ADS_COST_TREND_BUCKET_IDS.reduce((sum, id) => sum + buckets[id], 0);
}

export function formatCostTrendMoney(micros: number): string {
  return (micros / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
    const row: AdsCostTrendBrandRow = {
      brandId,
      brandCode: brand?.brandCode || (brandId === UNASSIGNED_BRAND_ID ? '未設定品牌' : brandId),
      displayName: brand?.displayName || (brandId === UNASSIGNED_BRAND_ID ? '未設定品牌' : brandId),
      campaigns: [],
      buckets: emptyCostTrendBuckets(),
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
  totalMicros: number;
  impressions: number;
  clicks: number;
  conversions: number;
  googleMicros: number;
  facebookMicros: number;
} {
  const campaigns = uniqueCostTrendCampaigns(rows.flatMap((row) => row.campaigns));
  const buckets = emptyCostTrendBuckets();
  let impressions = 0;
  let clicks = 0;
  let conversions = 0;
  let googleMicros = 0;
  let facebookMicros = 0;
  for (const campaign of campaigns) {
    addCostTrendBuckets(buckets, campaign.buckets);
    impressions += campaign.impressions;
    clicks += campaign.clicks;
    conversions += campaign.conversions;
    if (campaign.platform === 'google') googleMicros += campaign.totalMicros;
    else facebookMicros += campaign.totalMicros;
  }
  return {
    campaigns,
    buckets,
    totalMicros: sumCostTrendBuckets(buckets),
    impressions,
    clicks,
    conversions,
    googleMicros,
    facebookMicros,
  };
}

export function buildCostTrendChartPoints(
  totals: AdsCostTrendBuckets,
  google: AdsCostTrendBuckets,
  facebook: AdsCostTrendBuckets,
  brandSeries: { key: string; name: string; buckets: AdsCostTrendBuckets }[],
): {
  label: string;
  total: number;
  google: number;
  facebook: number;
  [brand: string]: string | number;
}[] {
  return ADS_COST_TREND_BUCKETS.map((bucket) => {
    const point: { label: string; total: number; google: number; facebook: number; [brand: string]: string | number } = {
      label: bucket.label,
      total: totals[bucket.id] / 1_000_000,
      google: google[bucket.id] / 1_000_000,
      facebook: facebook[bucket.id] / 1_000_000,
    };
    for (const series of brandSeries) {
      point[series.key] = series.buckets[bucket.id] / 1_000_000;
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
