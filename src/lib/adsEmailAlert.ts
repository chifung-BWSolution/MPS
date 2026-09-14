import {
  ADS_CLICK_TREND_METRIC_OPTIONS,
  clickTrendBucketValue,
  formatClickTrendValue,
  isClickTrendMoneyMetric,
} from '@/lib/adsCostTrend';
import type {
  AdsClickTrendMetric,
  AdsCostTrendBrandRow,
  AdsCostTrendBucketRange,
  AdsCostTrendCampaign,
  AdsCostTrendPeriodMode,
} from '@/types/adsCostTrend';

export const ADS_EMAIL_ALERT_THRESHOLD = 20;

export type AdsEmailAlertTone = 'good' | 'bad' | 'neutral';

export type AdsEmailAlertMetricCell = {
  metric: AdsClickTrendMetric;
  current: number | null;
  previous: number | null;
  percent: number | null;
  tone: AdsEmailAlertTone;
};

export type AdsEmailAlertStaff = {
  id: string;
  name: string;
  email: string;
};

export type AdsEmailAlertBrandSnapshot = {
  brandId: string;
  brandCode: string;
  displayName: string;
  campaignCount: number;
  cells: Record<AdsClickTrendMetric, AdsEmailAlertMetricCell>;
  isCostAlert: boolean;
};

export function percentChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function alertMetricTone(
  metric: AdsClickTrendMetric,
  percent: number | null,
  threshold = ADS_EMAIL_ALERT_THRESHOLD,
): AdsEmailAlertTone {
  if (percent == null || !Number.isFinite(percent)) return 'neutral';
  if (isClickTrendMoneyMetric(metric)) {
    if (percent > threshold) return 'bad';
    if (percent < -threshold) return 'good';
    return 'neutral';
  }
  if (percent > threshold) return 'good';
  if (percent < -threshold) return 'bad';
  return 'neutral';
}

export function alertToneClass(tone: AdsEmailAlertTone): string {
  if (tone === 'good') return 'text-emerald-600';
  if (tone === 'bad') return 'text-red-600';
  return 'text-foreground';
}

export function alertToneHex(tone: AdsEmailAlertTone): string {
  if (tone === 'good') return '#059669';
  if (tone === 'bad') return '#dc2626';
  return '#0d1a2d';
}

export function formatPercentChange(percent: number | null): string {
  if (percent == null || !Number.isFinite(percent)) return '—';
  const rounded = Math.round(percent * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function brandDisplayLabel(row: Pick<AdsCostTrendBrandRow, 'brandCode' | 'displayName'>): string {
  if (row.displayName && row.displayName !== row.brandCode) {
    return `${row.brandCode} — ${row.displayName}`;
  }
  return row.displayName || row.brandCode;
}

export function previousBucketId(
  ranges: Pick<AdsCostTrendBucketRange, 'id'>[],
  bucketId: string,
  mode: AdsCostTrendPeriodMode,
): string | null {
  const index = ranges.findIndex((range) => range.id === bucketId);
  if (index < 0) return null;
  // Rolling buckets are newest-first; monthly buckets are oldest-first.
  const previousIndex = mode === 'monthly' ? index - 1 : index + 1;
  return ranges[previousIndex]?.id ?? null;
}

export function latestComparisonBucketIds(ranges: Pick<AdsCostTrendBucketRange, 'id'>[]): {
  currentId: string | null;
  previousId: string | null;
} {
  if (ranges.length === 0) return { currentId: null, previousId: null };
  const currentId = ranges[0].id;
  return { currentId, previousId: ranges[1]?.id ?? null };
}

export function monthlyComparisonBucketIds(ranges: Pick<AdsCostTrendBucketRange, 'id'>[]): {
  currentId: string | null;
  previousId: string | null;
} {
  if (ranges.length === 0) return { currentId: null, previousId: null };
  const currentId = ranges[ranges.length - 1].id;
  return { currentId, previousId: ranges.length > 1 ? ranges[ranges.length - 2].id : null };
}

export function comparisonBucketIds(
  ranges: Pick<AdsCostTrendBucketRange, 'id'>[],
  mode: AdsCostTrendPeriodMode,
): { currentId: string | null; previousId: string | null } {
  return mode === 'monthly' ? monthlyComparisonBucketIds(ranges) : latestComparisonBucketIds(ranges);
}

export function metricCellForBucket(
  source: AdsCostTrendBrandRow | AdsCostTrendCampaign,
  metric: AdsClickTrendMetric,
  currentId: string | null,
  previousId: string | null,
): AdsEmailAlertMetricCell {
  const current = currentId ? clickTrendBucketValue(source, currentId, metric) : null;
  const previous = previousId ? clickTrendBucketValue(source, previousId, metric) : null;
  const percent = percentChange(current, previous);
  return {
    metric,
    current,
    previous,
    percent,
    tone: alertMetricTone(metric, percent),
  };
}

export function metricCellsForBucket(
  source: AdsCostTrendBrandRow | AdsCostTrendCampaign,
  currentId: string | null,
  previousId: string | null,
): Record<AdsClickTrendMetric, AdsEmailAlertMetricCell> {
  return Object.fromEntries(
    ADS_CLICK_TREND_METRIC_OPTIONS.map((option) => [
      option.id,
      metricCellForBucket(source, option.id, currentId, previousId),
    ]),
  ) as Record<AdsClickTrendMetric, AdsEmailAlertMetricCell>;
}

/** Latest-vs-previous % change, with period totals as the current values. */
export function summaryMetricCells(
  source: AdsCostTrendBrandRow | AdsCostTrendCampaign,
  currentId: string | null,
  previousId: string | null,
): Record<AdsClickTrendMetric, AdsEmailAlertMetricCell> {
  const change = metricCellsForBucket(source, currentId, previousId);
  return Object.fromEntries(
    ADS_CLICK_TREND_METRIC_OPTIONS.map((option) => [
      option.id,
      {
        ...change[option.id],
        current: clickTrendBucketValue(source, 'total', option.id),
      },
    ]),
  ) as Record<AdsClickTrendMetric, AdsEmailAlertMetricCell>;
}

export function isCostAlertCells(
  cells: Record<AdsClickTrendMetric, AdsEmailAlertMetricCell>,
  threshold = ADS_EMAIL_ALERT_THRESHOLD,
): boolean {
  return (cells.cpc.percent ?? 0) > threshold || (cells.cpa.percent ?? 0) > threshold;
}

export function buildBrandAlertSnapshots(
  rows: AdsCostTrendBrandRow[],
  currentId: string | null,
  previousId: string | null,
): AdsEmailAlertBrandSnapshot[] {
  return rows.map((row) => {
    const cells = metricCellsForBucket(row, currentId, previousId);
    return {
      brandId: row.brandId,
      brandCode: row.brandCode,
      displayName: row.displayName,
      campaignCount: row.campaigns.length,
      cells,
      isCostAlert: isCostAlertCells(cells),
    };
  });
}

export function flaggedCostAlertBrands(
  snapshots: AdsEmailAlertBrandSnapshot[],
): AdsEmailAlertBrandSnapshot[] {
  return snapshots.filter((row) => row.isCostAlert);
}

export function costAlertScore(cells: Record<AdsClickTrendMetric, AdsEmailAlertMetricCell>): number {
  return Math.max(cells.cpc.percent ?? Number.NEGATIVE_INFINITY, cells.cpa.percent ?? Number.NEGATIVE_INFINITY);
}

export function comparisonPeriodLabel(
  ranges: AdsCostTrendBucketRange[],
  mode: AdsCostTrendPeriodMode,
): { current: string; previous: string; currentRange: string; previousRange: string } {
  const { currentId, previousId } = comparisonBucketIds(ranges, mode);
  const current = ranges.find((range) => range.id === currentId);
  const previous = ranges.find((range) => range.id === previousId);
  const formatRange = (range?: AdsCostTrendBucketRange) =>
    range ? `${range.from} 至 ${range.to}` : '—';
  return {
    current: current?.label || (mode === 'monthly' ? '本月' : '近 30 日'),
    previous: previous?.label || (mode === 'monthly' ? '上月' : '前 30 日'),
    currentRange: formatRange(current),
    previousRange: formatRange(previous),
  };
}

function metricLabel(metric: AdsClickTrendMetric): string {
  return ADS_CLICK_TREND_METRIC_OPTIONS.find((option) => option.id === metric)?.label || metric;
}

function formatMetricLine(cell: AdsEmailAlertMetricCell): string {
  const current = formatClickTrendValue(cell.current, cell.metric);
  const previous = formatClickTrendValue(cell.previous, cell.metric);
  const change = formatPercentChange(cell.percent);
  return `${metricLabel(cell.metric)}：${current}（${change}，上期 ${previous}）`;
}

function formatMetricHtml(cell: AdsEmailAlertMetricCell): string {
  const current = escapeHtml(formatClickTrendValue(cell.current, cell.metric));
  const previous = escapeHtml(formatClickTrendValue(cell.previous, cell.metric));
  const change = escapeHtml(formatPercentChange(cell.percent));
  const color = alertToneHex(cell.tone);
  return `${escapeHtml(metricLabel(cell.metric))}：${current}（<span style="color:${color};font-weight:600">${change}</span>，上期 ${previous}）`;
}

export function selectedAlertBrands(
  flagged: AdsEmailAlertBrandSnapshot[],
  selectedIds: Iterable<string>,
): AdsEmailAlertBrandSnapshot[] {
  const ids = new Set(selectedIds);
  return flagged.filter((row) => ids.has(row.brandId));
}

export function buildAlertEmailSubject(
  flagged: AdsEmailAlertBrandSnapshot[],
  period: { current: string; previous: string },
): string {
  if (flagged.length === 0) {
    return `廣告成效預警（${period.current} vs ${period.previous}）— 沒有 CPC/CPA 上升超過 ${ADS_EMAIL_ALERT_THRESHOLD}% 的品牌`;
  }
  return `廣告成效預警（${period.current} vs ${period.previous}）— ${flagged.length} 個品牌 CPC/CPA 上升超過 ${ADS_EMAIL_ALERT_THRESHOLD}%`;
}

export function buildAlertEmailText(input: {
  flagged: AdsEmailAlertBrandSnapshot[];
  period: { current: string; previous: string; currentRange: string; previousRange: string };
  asOf: string;
}): string {
  const lines = [
    '廣告成效預警',
    '',
    `比較期間：${input.period.current}（${input.period.currentRange}）相對 ${input.period.previous}（${input.period.previousRange}）`,
    `基準日：${input.asOf}`,
    '',
  ];

  if (input.flagged.length === 0) {
    lines.push(`目前沒有品牌的 CPC 或 CPA 較上一期上升超過 ${ADS_EMAIL_ALERT_THRESHOLD}%。`);
  } else {
    lines.push(`以下品牌的 CPC 或 CPA 較上一期上升超過 ${ADS_EMAIL_ALERT_THRESHOLD}%：`, '');
    input.flagged.forEach((row, index) => {
      lines.push(`${index + 1}. ${brandDisplayLabel(row)}`);
      ADS_CLICK_TREND_METRIC_OPTIONS.forEach((option) => {
        lines.push(`   ${formatMetricLine(row.cells[option.id])}`);
      });
      lines.push('');
    });
  }

  lines.push('—', '此郵件由 MPS 行銷管理「電郵預警通知」發送。');
  return lines.join('\n');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildAlertEmailHtml(input: {
  flagged: AdsEmailAlertBrandSnapshot[];
  period: { current: string; previous: string; currentRange: string; previousRange: string };
  asOf: string;
}): string {
  const blocks: string[] = [
    '<h2 style="margin:0 0 12px;font-size:18px;color:#0d1a2d;">廣告成效預警</h2>',
    `<p style="margin:0 0 8px;color:#4b5b70;">比較期間：${escapeHtml(input.period.current)}（${escapeHtml(input.period.currentRange)}）相對 ${escapeHtml(input.period.previous)}（${escapeHtml(input.period.previousRange)}）<br />基準日：${escapeHtml(input.asOf)}</p>`,
  ];

  if (input.flagged.length === 0) {
    blocks.push(
      `<p style="margin:12px 0 0;color:#0d1a2d;">目前沒有品牌的 CPC 或 CPA 較上一期上升超過 ${ADS_EMAIL_ALERT_THRESHOLD}%。</p>`,
    );
  } else {
    blocks.push(
      `<p style="margin:12px 0;">以下品牌的 CPC 或 CPA 較上一期上升超過 ${ADS_EMAIL_ALERT_THRESHOLD}%：</p>`,
    );
    input.flagged.forEach((row, index) => {
      const metrics = ADS_CLICK_TREND_METRIC_OPTIONS.map(
        (option) => `<div>${formatMetricHtml(row.cells[option.id])}</div>`,
      ).join('');
      blocks.push(
        `<p style="margin:16px 0 4px;"><strong>${index + 1}. ${escapeHtml(brandDisplayLabel(row))}</strong></p><div style="margin:0 0 8px 16px;line-height:1.7;">${metrics}</div>`,
      );
    });
  }

  blocks.push('<p style="margin:20px 0 0;color:#4b5b70;">—<br />此郵件由 MPS 行銷管理「電郵預警通知」發送。</p>');
  return blocks.join('');
}

export function wrapAlertEmailHtml(innerHtml: string): string {
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8" /><title>廣告成效預警</title></head><body style="margin:0;padding:24px;background:#f5f8fc;color:#0d1a2d;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;"><div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d7dee8;padding:24px;">${innerHtml}</div></body></html>`;
}

export function emailTextToHtml(text: string): string {
  return wrapAlertEmailHtml(escapeHtml(text).replace(/\n/g, '<br />'));
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const DEFAULT_ADS_EMAIL_ALERT_STAFF_NAMES = ['Angel Tai', 'Franco Lee'] as const;

function normalizeStaffName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function defaultAlertStaffIds(
  staff: AdsEmailAlertStaff[],
  names: readonly string[] = DEFAULT_ADS_EMAIL_ALERT_STAFF_NAMES,
): string[] {
  const wanted = new Set(names.map((name) => normalizeStaffName(name)));
  return staff
    .filter((row) => wanted.has(normalizeStaffName(row.name)))
    .map((row) => row.id);
}

export function staffEmailRecipients(
  rows: Array<{ id?: string; value?: string; label?: string; name?: string; email?: string; keywords?: string; status?: string }>,
): AdsEmailAlertStaff[] {
  return rows
    .map((row) => ({
      id: String(row.id || row.value || '').trim(),
      name: String(row.name || row.label || '').trim() || '—',
      email: String(row.email || row.keywords || '').trim(),
    }))
    .filter((row) => row.id && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email));
}
