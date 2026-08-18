import { normalizeDomain } from '@/lib/domainMatch';

export type Ga4WebsiteMatchRow = {
  id: string;
  domain_url: string | null;
  website_name: string | null;
  ga4_property_id?: string | null;
};

export type Ga4PropertyMatchInput = {
  propertyId: string;
  displayName?: string | null;
  streamUris?: string[];
};

export type Ga4PropertyMatch = {
  websiteProfileId: string;
  matchedDomain: string;
};

export type Ga4OAuthEnv = {
  GOOGLE_GA4_CLIENT_ID?: string;
  GOOGLE_GA4_CLIENT_SECRET?: string;
  GOOGLE_GA4_REFRESH_TOKEN?: string;
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
};

export function resolveGa4OAuthClient(env: Ga4OAuthEnv): {
  clientId: string;
  clientSecret: string;
} {
  return {
    clientId: String(env.GOOGLE_GA4_CLIENT_ID || env.GOOGLE_ADS_CLIENT_ID || '').trim(),
    clientSecret: String(env.GOOGLE_GA4_CLIENT_SECRET || env.GOOGLE_ADS_CLIENT_SECRET || '').trim(),
  };
}

/** Stored (rotated) token wins over the seed secret from Google Ads / Playground. */
export function resolveGa4RefreshToken(
  storedToken: string | null | undefined,
  envToken: string | null | undefined,
): string {
  return String(storedToken || envToken || '').trim();
}

/** Google may return a new refresh token; persist it when it changes. */
export function nextRotatedRefreshToken(
  current: string,
  incoming: string | null | undefined,
): string | null {
  const next = String(incoming || '').trim();
  if (!next || next === current) return null;
  return next;
}

export function normalizeGa4PropertyId(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  const stripped = s.replace(/^properties\//i, '');
  return stripped;
}

export function ga4DateToIso(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return '';
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function daysBetweenInclusive(from: string, to: string): number {
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

export function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function weightedAverage(values: Array<{ weight: number; value: number }>): number {
  let w = 0;
  let sum = 0;
  for (const row of values) {
    const weight = Number(row.weight) || 0;
    const value = Number(row.value) || 0;
    if (weight <= 0) continue;
    w += weight;
    sum += weight * value;
  }
  return w > 0 ? sum / w : 0;
}

export type Ga4MetricTotals = {
  users: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  engagedSessions: number;
  conversions: number;
  bounceRate: number;
  engagementRate: number;
  avgSessionDuration: number;
  pagesPerSession: number;
};

export function emptyGa4Totals(): Ga4MetricTotals {
  return {
    users: 0,
    newUsers: 0,
    sessions: 0,
    pageviews: 0,
    engagedSessions: 0,
    conversions: 0,
    bounceRate: 0,
    engagementRate: 0,
    avgSessionDuration: 0,
    pagesPerSession: 0,
  };
}

export function deriveGa4Totals(input: {
  users: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  engagedSessions: number;
  conversions: number;
  durationSecondsWeighted?: number;
}): Ga4MetricTotals {
  const sessions = Number(input.sessions) || 0;
  const engaged = Number(input.engagedSessions) || 0;
  const pageviews = Number(input.pageviews) || 0;
  const engagementRate = sessions > 0 ? engaged / sessions : 0;
  return {
    users: Number(input.users) || 0,
    newUsers: Number(input.newUsers) || 0,
    sessions,
    pageviews,
    engagedSessions: engaged,
    conversions: Number(input.conversions) || 0,
    bounceRate: sessions > 0 ? Math.max(0, 1 - engagementRate) : 0,
    engagementRate,
    avgSessionDuration:
      sessions > 0 && input.durationSecondsWeighted != null
        ? (Number(input.durationSecondsWeighted) || 0) / sessions
        : 0,
    pagesPerSession: sessions > 0 ? pageviews / sessions : 0,
  };
}

export function domainsRelated(a: string, b: string): boolean {
  const left = normalizeDomain(a);
  const right = normalizeDomain(b);
  if (!left || !right) return false;
  return left === right || left.endsWith('.' + right) || right.endsWith('.' + left);
}

export function matchWebsiteForGa4Property(
  property: Ga4PropertyMatchInput,
  websites: Ga4WebsiteMatchRow[],
): Ga4PropertyMatch | null {
  const propertyId = normalizeGa4PropertyId(property.propertyId);
  if (!propertyId) return null;

  const explicit = websites.find(
    (w) => normalizeGa4PropertyId(w.ga4_property_id) === propertyId,
  );
  if (explicit) {
    return {
      websiteProfileId: explicit.id,
      matchedDomain: normalizeDomain(explicit.domain_url) || propertyId,
    };
  }

  const candidates = [
    ...(property.streamUris || []),
    property.displayName || '',
  ]
    .map((v) => normalizeDomain(v))
    .filter(Boolean);

  for (const key of candidates) {
    for (const w of websites) {
      const domain = normalizeDomain(w.domain_url);
      if (domain && domainsRelated(domain, key)) {
        return { websiteProfileId: w.id, matchedDomain: domain };
      }
    }
  }

  const name = String(property.displayName || '').trim().toLowerCase();
  if (name) {
    const named = websites.find((w) => {
      const websiteName = String(w.website_name || '').trim().toLowerCase();
      return websiteName.length >= 3 && (websiteName === name || name.includes(websiteName) || websiteName.includes(name));
    });
    if (named) {
      return {
        websiteProfileId: named.id,
        matchedDomain: normalizeDomain(named.domain_url) || name,
      };
    }
  }

  return null;
}

export const LIVE_GA4_BREAKDOWN_MAX_DAYS = 92;

export function validateLiveGa4Range(
  from: string,
  to: string,
): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { ok: false, error: '日期格式須為 YYYY-MM-DD' };
  }
  if (from > to) {
    return { ok: false, error: '開始日期不可晚於結束日期' };
  }
  const days = daysBetweenInclusive(from, to);
  if (days > LIVE_GA4_BREAKDOWN_MAX_DAYS) {
    return {
      ok: false,
      error: `即時細項最多 ${LIVE_GA4_BREAKDOWN_MAX_DAYS} 日（目前 ${days} 日）`,
    };
  }
  return { ok: true };
}
