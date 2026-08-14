import assert from 'node:assert/strict';
import {
  ADS_COST_TREND_MAX_MONTHS,
  addMonthsToKey,
  buildCostTrendBucketRanges,
  buildCostTrendChartPoints,
  buildMonthlyBucketRanges,
  clampSelectedMonthRange,
  defaultMonthlyRange,
  emptyCostTrendBuckets,
  filterCostTrendCampaigns,
  formatCostTrendMoney,
  formatMonthLabel,
  groupCostTrendByBrand,
  monthEndIso,
  monthSpan,
  monthStartIso,
  sortCostTrendBrandRows,
  sumUniqueCampaignMetrics,
  UNASSIGNED_BRAND_ID,
} from '../src/lib/adsCostTrend';
import type { AdsCostTrendCampaign } from '../src/types/adsCostTrend';

function campaign(partial: Partial<AdsCostTrendCampaign> & Pick<AdsCostTrendCampaign, 'key' | 'campaignName'>): AdsCostTrendCampaign {
  const buckets = emptyCostTrendBuckets();
  Object.assign(buckets, partial.buckets);
  return {
    platform: 'google',
    accountId: 'acc',
    campaignId: partial.key,
    accountName: 'Account',
    status: 'ENABLED',
    objectives: ['SALES'],
    brandListIds: ['b1'],
    tags: [],
    impressions: 0,
    clicks: 0,
    conversions: 0,
    totalMicros: Object.values(buckets).reduce((sum, value) => sum + value, 0),
    ...partial,
    buckets,
  };
}

const ranges = buildCostTrendBucketRanges('2026-08-14');
assert.equal(ranges[0].from, '2026-07-16');
assert.equal(ranges[0].to, '2026-08-14');
assert.equal(ranges[1].from, '2026-06-16');
assert.equal(ranges[1].to, '2026-07-15');

const rows = [
  campaign({
    key: 'g:1',
    campaignName: 'Search Brand',
    brandListIds: ['b1'],
    buckets: { ...emptyCostTrendBuckets(), d0_30: 1_000_000, d31_60: 2_000_000 },
  }),
  campaign({
    key: 'fb:1',
    platform: 'facebook',
    campaignName: 'Traffic',
    objectives: ['OUTCOME_TRAFFIC'],
    brandListIds: ['b1'],
    tags: [{ id: 't1', name: 'A1', color: 'teal', sortOrder: 0, isActive: true }],
    buckets: { ...emptyCostTrendBuckets(), d0_30: 3_000_000 },
  }),
  campaign({
    key: 'g:2',
    campaignName: 'Orphan',
    brandListIds: [],
    buckets: { ...emptyCostTrendBuckets(), d151_180: 500_000 },
  }),
  campaign({
    key: 'g:zero',
    campaignName: 'Zero',
    brandListIds: ['b2'],
    buckets: emptyCostTrendBuckets(),
  }),
];

const brands = [
  { id: 'b1', brandCode: 'BW', displayName: 'Branding Works' },
  { id: 'b2', brandCode: 'EMPTY', displayName: 'No Spend Brand' },
];

const googleOnly = filterCostTrendCampaigns(rows, {
  platform: 'google',
  objective: 'all',
  tag: 'all',
  search: '',
});
assert.equal(googleOnly.length, 3);

const tagged = filterCostTrendCampaigns(rows, {
  platform: 'all',
  objective: 'all',
  tag: 't1',
  search: '',
});
assert.equal(tagged.length, 1);
assert.equal(tagged[0].key, 'fb:1');

const grouped = groupCostTrendByBrand(rows, brands, '');
assert.deepEqual(
  grouped.map((row) => row.brandId).sort(),
  [UNASSIGNED_BRAND_ID, 'b1'].sort(),
);
const bw = grouped.find((row) => row.brandId === 'b1');
assert.equal(bw?.campaigns.length, 2);
assert.equal(bw?.totalMicros, 6_000_000);
assert.equal(bw?.buckets.d0_30, 4_000_000);

const searched = groupCostTrendByBrand(rows, brands, 'orphan');
assert.equal(searched.length, 1);
assert.equal(searched[0].brandId, UNASSIGNED_BRAND_ID);

const brandSearch = groupCostTrendByBrand(rows, brands, 'branding');
assert.equal(brandSearch.length, 1);
assert.equal(brandSearch[0].campaigns.length, 2);

const sorted = sortCostTrendBrandRows(grouped, 'total', 'desc');
assert.equal(sorted[0].brandId, 'b1');

const totals = sumUniqueCampaignMetrics(grouped);
assert.equal(totals.campaigns.length, 3);
assert.equal(totals.totalMicros, 6_500_000);
assert.equal(totals.googleMicros, 3_500_000);
assert.equal(totals.facebookMicros, 3_000_000);

assert.match(formatCostTrendMoney(6_500_000), /^\$/);
assert.match(formatCostTrendMoney(1_000_000), /^\$/);

const monthlyDefault = defaultMonthlyRange('2026-08-14');
assert.equal(monthlyDefault.from, '2026-03');
assert.equal(monthlyDefault.to, '2026-08');
assert.equal(monthSpan(monthlyDefault.from, monthlyDefault.to), ADS_COST_TREND_MAX_MONTHS);
assert.equal(addMonthsToKey('2026-01', -1), '2025-12');
assert.equal(formatMonthLabel('2026-03'), '2026年3月');
assert.equal(monthStartIso('2026-03'), '2026-03-01');
assert.equal(monthEndIso('2026-03', '2026-08-14'), '2026-03-31');
assert.equal(monthEndIso('2026-08', '2026-08-14'), '2026-08-14');

const clampedFrom = clampSelectedMonthRange('2025-10', '2026-08', '2026-08-14', 'from');
assert.equal(clampedFrom.from, '2025-10');
assert.equal(clampedFrom.to, '2026-03');
assert.equal(monthSpan(clampedFrom.from, clampedFrom.to), ADS_COST_TREND_MAX_MONTHS);

const clampedTo = clampSelectedMonthRange('2025-10', '2026-08', '2026-08-14', 'to');
assert.equal(clampedTo.from, '2026-03');
assert.equal(clampedTo.to, '2026-08');

const futureClamped = clampSelectedMonthRange('2026-09', '2026-12', '2026-08-14', 'from');
assert.equal(futureClamped.from, '2026-08');
assert.equal(futureClamped.to, '2026-08');

const monthlyRanges = buildMonthlyBucketRanges('2026-03', '2026-08', '2026-08-14');
assert.equal(monthlyRanges.length, 6);
assert.equal(monthlyRanges[0].id, '2026-03');
assert.equal(monthlyRanges[0].from, '2026-03-01');
assert.equal(monthlyRanges[0].to, '2026-03-31');
assert.equal(monthlyRanges[5].id, '2026-08');
assert.equal(monthlyRanges[5].from, '2026-08-01');
assert.equal(monthlyRanges[5].to, '2026-08-14');

const monthlyBuckets = emptyCostTrendBuckets(monthlyRanges.map((range) => range.id));
monthlyBuckets['2026-03'] = 1_000_000;
monthlyBuckets['2026-08'] = 2_000_000;
const chartPoints = buildCostTrendChartPoints(
  monthlyRanges,
  monthlyBuckets,
  emptyCostTrendBuckets(monthlyRanges.map((range) => range.id)),
  emptyCostTrendBuckets(monthlyRanges.map((range) => range.id)),
  [],
);
assert.equal(chartPoints.length, 6);
assert.equal(chartPoints[0].label, '2026年3月');
assert.equal(chartPoints[0].total, 1);
assert.equal(chartPoints[5].total, 2);

console.log('ads cost trend lib: ok');
