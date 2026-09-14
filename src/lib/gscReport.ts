export type GscMetricTotals = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscDailyPoint = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscBreakdownRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export function emptyGscTotals(): GscMetricTotals {
  return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

export function deriveGscTotals(
  rows: Array<{ clicks: number; impressions: number; position: number }>,
): GscMetricTotals {
  let clicks = 0;
  let impressions = 0;
  let positionWeighted = 0;
  for (const row of rows) {
    const c = Number(row.clicks) || 0;
    const i = Number(row.impressions) || 0;
    const p = Number(row.position) || 0;
    clicks += c;
    impressions += i;
    positionWeighted += p * i;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? positionWeighted / impressions : 0,
  };
}

export function totalsFromSums(input: {
  clicks?: number | string | null;
  impressions?: number | string | null;
  position_weighted?: number | string | null;
}): GscMetricTotals {
  const clicks = Number(input.clicks) || 0;
  const impressions = Number(input.impressions) || 0;
  const positionWeighted = Number(input.position_weighted) || 0;
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? positionWeighted / impressions : 0,
  };
}

export function formatGscCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(1)}%`;
}

export function formatGscPosition(position: number): string {
  if (!Number.isFinite(position) || position <= 0) return '—';
  return position.toFixed(1);
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function previousGscRange(from: string, to: string): { from: string; to: string } {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { from, to };
  }
  const days = Math.round((end - start) / 86_400_000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return {
    from: prevStart.toISOString().slice(0, 10),
    to: prevEnd.toISOString().slice(0, 10),
  };
}
