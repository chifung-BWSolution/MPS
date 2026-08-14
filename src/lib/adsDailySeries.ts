import type { AdsKpiItem } from '@/components/marketing/campaign-detail/types';
import { formatMoneyAmount } from '@/lib/formatMoney';
import type { AdsCompareMetric, AdsCompareSeriesPoint, AdsCompareTotals } from '@/types/adsComparison';

export const ADS_COMPARE_METRICS: {
  id: AdsCompareMetric;
  shortLabel: string;
  label: string;
}[] = [
  { id: 'impressions', shortLabel: 'Impr.', label: 'Impressions' },
  { id: 'clicks', shortLabel: 'Clicks', label: 'Clicks' },
  { id: 'cost', shortLabel: 'Cost', label: 'Cost' },
  { id: 'conversions', shortLabel: 'Conv.', label: 'Conversions' },
  { id: 'ctr', shortLabel: 'CTR', label: 'CTR' },
  { id: 'cpc', shortLabel: 'Avg. CPC', label: 'Avg. CPC' },
];

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

function toIsoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoUtc(d);
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = parseIsoDate(from).getTime();
  const b = parseIsoDate(to).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const len = daysBetweenInclusive(from, to);
  const prevTo = addDaysIso(from, -1);
  const prevFrom = addDaysIso(prevTo, -(len - 1));
  return { from: prevFrom, to: prevTo };
}

export function emptyTotals(): AdsCompareTotals {
  return {
    impressions: 0,
    clicks: 0,
    costMicros: 0,
    conversions: 0,
    ctr: 0,
    averageCpcMicros: 0,
    cpaMicros: null,
  };
}

export function deriveTotals(
  impressions: number,
  clicks: number,
  costMicros: number,
  conversions: number,
): AdsCompareTotals {
  return {
    impressions,
    clicks,
    costMicros,
    conversions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    averageCpcMicros: clicks > 0 ? Math.round(costMicros / clicks) : 0,
    cpaMicros: conversions > 0 ? Math.round(costMicros / conversions) : null,
  };
}

export function fillDailySeries(
  from: string,
  to: string,
  rows: { date: string; impressions: number; clicks: number; costMicros: number; conversions: number }[],
): AdsCompareSeriesPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series: AdsCompareSeriesPoint[] = [];
  let cursor = from;
  while (cursor <= to) {
    const row = byDate.get(cursor);
    const impressions = row?.impressions ?? 0;
    const clicks = row?.clicks ?? 0;
    const costMicros = row?.costMicros ?? 0;
    const conversions = row?.conversions ?? 0;
    series.push({
      date: cursor,
      impressions,
      clicks,
      cost: costMicros / 1_000_000,
      conversions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpc: clicks > 0 ? costMicros / clicks / 1_000_000 : 0,
    });
    cursor = addDaysIso(cursor, 1);
  }
  return series;
}

export function sumSeries(series: AdsCompareSeriesPoint[]): AdsCompareTotals {
  let impressions = 0;
  let clicks = 0;
  let cost = 0;
  let conversions = 0;
  for (const p of series) {
    impressions += p.impressions;
    clicks += p.clicks;
    cost += p.cost;
    conversions += p.conversions;
  }
  return deriveTotals(impressions, clicks, Math.round(cost * 1_000_000), conversions);
}

function formatMoney(amount: number): string {
  return formatMoneyAmount(amount);
}

function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Same six KPI cards as Google / Facebook campaign detail pages. */
export function buildAdsCompareKpis(
  totals: AdsCompareTotals,
  previous: AdsCompareTotals,
  series: AdsCompareSeriesPoint[],
): AdsKpiItem[] {
  const cpaSpark = series.map((p) => (p.conversions > 0 ? p.cost / p.conversions : 0));

  return [
    {
      id: 'impressions',
      label: 'Impressions',
      value: totals.impressions.toLocaleString(),
      deltaPct: pctChange(totals.impressions, previous.impressions),
      sparkline: series.map((p) => p.impressions),
    },
    {
      id: 'clicks',
      label: 'Clicks',
      value: totals.clicks.toLocaleString(),
      deltaPct: pctChange(totals.clicks, previous.clicks),
      sparkline: series.map((p) => p.clicks),
    },
    {
      id: 'ctr',
      label: 'CTR',
      value: `${(totals.ctr * 100).toFixed(2)}%`,
      deltaPct: pctChange(totals.ctr, previous.ctr),
      sparkline: series.map((p) => p.ctr * 100),
    },
    {
      id: 'cost',
      label: 'Cost',
      value: formatMoney(totals.costMicros / 1_000_000),
      deltaPct: pctChange(totals.costMicros, previous.costMicros),
      sparkline: series.map((p) => p.cost),
    },
    {
      id: 'conversions',
      label: 'Conversions',
      value: totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      deltaPct: pctChange(totals.conversions, previous.conversions),
      sparkline: series.map((p) => p.conversions),
    },
    {
      id: 'cpc',
      label: totals.cpaMicros != null ? 'CPC / CPA' : 'Avg. CPC',
      value:
        totals.cpaMicros != null
          ? `${formatMoney(totals.averageCpcMicros / 1_000_000)} / ${formatMoney(totals.cpaMicros / 1_000_000)}`
          : formatMoney(totals.averageCpcMicros / 1_000_000),
      deltaPct: pctChange(totals.averageCpcMicros, previous.averageCpcMicros),
      sparkline:
        totals.cpaMicros != null ? cpaSpark : series.map((p) => p.cpc),
      hint: totals.cpaMicros != null ? 'Avg CPC / CPA' : 'Average CPC',
    },
  ];
}

export function metricValue(point: AdsCompareSeriesPoint, metric: AdsCompareMetric): number {
  switch (metric) {
    case 'impressions':
      return point.impressions;
    case 'clicks':
      return point.clicks;
    case 'cost':
      return point.cost;
    case 'conversions':
      return point.conversions;
    case 'ctr':
      return point.ctr * 100;
    case 'cpc':
      return point.cpc;
  }
}

export function formatMetricValue(value: number, metric: AdsCompareMetric): string {
  switch (metric) {
    case 'impressions':
    case 'clicks':
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    case 'conversions':
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'cost':
    case 'cpc':
      return formatMoneyAmount(value);
    case 'ctr':
      return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }
}

export function isAdsCompareMetric(id: string): id is AdsCompareMetric {
  return ADS_COMPARE_METRICS.some((m) => m.id === id);
}
