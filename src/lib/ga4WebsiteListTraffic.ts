import { addDaysIso } from './ga4Traffic';

export type Ga4WebsiteTrafficWindows = {
  currentFrom: string;
  currentTo: string;
  previousFrom: string;
  previousTo: string;
  datesCurrent: string[];
};

export type Ga4WebsiteTrafficSummary = {
  websiteId: string;
  propertyId: string;
  currentUsers: number;
  previousUsers: number;
  changePct: number | null;
  dailyUsers: number[];
  trend: 'up' | 'down' | 'flat';
};

export type Ga4PropertyLink = {
  propertyId: string;
  websiteProfileId: string | null;
};

export type Ga4WebsiteExplicitProperty = {
  websiteId: string;
  propertyId: string | null;
};

export type Ga4DailyUserRow = {
  propertyId: string;
  date: string;
  users: number;
};

export function enumerateIsoDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return dates;
}

/**
 * Last 14 days (day 0 = endDate through day 13) vs the prior 14 days
 * (days 14–27). This is the 14–0 vs 28–15 comparison window.
 */
export function ga4WebsiteTrafficWindows(endDate: string): Ga4WebsiteTrafficWindows {
  const currentTo = endDate;
  const currentFrom = addDaysIso(endDate, -13);
  const previousTo = addDaysIso(endDate, -14);
  const previousFrom = addDaysIso(endDate, -27);
  return {
    currentFrom,
    currentTo,
    previousFrom,
    previousTo,
    datesCurrent: enumerateIsoDates(currentFrom, currentTo),
  };
}

export function usersChangePct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatUsersWithChange(current: number, changePct: number | null): string {
  const users = Math.round(current).toLocaleString('en-US');
  if (changePct == null || !Number.isFinite(changePct)) return `${users} (—)`;
  const sign = changePct > 0 ? '+' : '';
  return `${users} (${sign}${changePct.toFixed(1)}%)`;
}

export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    const y = Number(values[i]) || 0;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export function sparklineTrend(values: number[]): 'up' | 'down' | 'flat' {
  const slope = linearSlope(values);
  if (slope > 1e-6) return 'up';
  if (slope < -1e-6) return 'down';
  return 'flat';
}

function metricDateKey(value: string): string {
  return String(value || '').slice(0, 10);
}

function pickPropertyId(
  websiteId: string,
  explicitByWebsite: Map<string, string>,
  linkedByWebsite: Map<string, string[]>,
  usersByProperty: Map<string, number>,
): string | null {
  const explicit = explicitByWebsite.get(websiteId);
  if (explicit) return explicit;
  const linked = linkedByWebsite.get(websiteId) || [];
  if (linked.length === 0) return null;
  if (linked.length === 1) return linked[0];
  return linked.slice().sort((a, b) => (usersByProperty.get(b) || 0) - (usersByProperty.get(a) || 0))[0] || null;
}

export function buildWebsiteTrafficSummaries(
  windows: Ga4WebsiteTrafficWindows,
  properties: Ga4PropertyLink[],
  websites: Ga4WebsiteExplicitProperty[],
  dailyRows: Ga4DailyUserRow[],
): Map<string, Ga4WebsiteTrafficSummary> {
  const explicitByWebsite = new Map<string, string>();
  for (const row of websites) {
    const propertyId = String(row.propertyId || '').trim();
    if (!row.websiteId || !propertyId) continue;
    explicitByWebsite.set(row.websiteId, propertyId);
  }

  const linkedByWebsite = new Map<string, string[]>();
  for (const row of properties) {
    const websiteId = String(row.websiteProfileId || '').trim();
    const propertyId = String(row.propertyId || '').trim();
    if (!websiteId || !propertyId) continue;
    const list = linkedByWebsite.get(websiteId) || [];
    if (!list.includes(propertyId)) list.push(propertyId);
    linkedByWebsite.set(websiteId, list);
  }

  const dailyByProperty = new Map<string, Map<string, number>>();
  const usersByProperty = new Map<string, number>();
  for (const row of dailyRows) {
    const propertyId = String(row.propertyId || '').trim();
    const date = metricDateKey(row.date);
    if (!propertyId || !date) continue;
    const users = Number(row.users) || 0;
    const byDate = dailyByProperty.get(propertyId) || new Map<string, number>();
    byDate.set(date, (byDate.get(date) || 0) + users);
    dailyByProperty.set(propertyId, byDate);
    if (date >= windows.currentFrom && date <= windows.currentTo) {
      usersByProperty.set(propertyId, (usersByProperty.get(propertyId) || 0) + users);
    }
  }

  const websiteIds = new Set<string>([
    ...explicitByWebsite.keys(),
    ...linkedByWebsite.keys(),
  ]);

  const summaries = new Map<string, Ga4WebsiteTrafficSummary>();
  for (const websiteId of websiteIds) {
    const propertyId = pickPropertyId(websiteId, explicitByWebsite, linkedByWebsite, usersByProperty);
    if (!propertyId) continue;
    const byDate = dailyByProperty.get(propertyId) || new Map<string, number>();
    const dailyUsers = windows.datesCurrent.map((date) => byDate.get(date) || 0);
    const currentUsers = dailyUsers.reduce((sum, value) => sum + value, 0);
    let previousUsers = 0;
    let cursor = windows.previousFrom;
    while (cursor <= windows.previousTo) {
      previousUsers += byDate.get(cursor) || 0;
      cursor = addDaysIso(cursor, 1);
    }
    summaries.set(websiteId, {
      websiteId,
      propertyId,
      currentUsers,
      previousUsers,
      changePct: usersChangePct(currentUsers, previousUsers),
      dailyUsers,
      trend: sparklineTrend(dailyUsers),
    });
  }
  return summaries;
}
