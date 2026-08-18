import type { AdsPlatformSource } from '@/types/adsWebsiteLink';

export type DomainSourceOrigin = 'ads' | 'analytics' | 'both' | 'facebook' | 'unknown';

export function parseAdsPlatformSource(raw: unknown): AdsPlatformSource | null {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'google' || s === 'ads' || s === 'google_ads') return 'google';
  if (s === 'facebook') return 'facebook';
  if (s === 'ga4' || s === 'analytics' || s === 'google_analytics') return 'ga4';
  return null;
}

export function domainSourceOrigin(sources: string[] | undefined | null): DomainSourceOrigin {
  const set = new Set(
    (sources || [])
      .map((s) => parseAdsPlatformSource(s))
      .filter((s): s is AdsPlatformSource => !!s),
  );
  const ads = set.has('google');
  const ga4 = set.has('ga4');
  if (ads && ga4) return 'both';
  if (ads) return 'ads';
  if (ga4) return 'analytics';
  if (set.has('facebook')) return 'facebook';
  return 'unknown';
}

export function domainSourceOriginLabel(origin: DomainSourceOrigin): string {
  switch (origin) {
    case 'both':
      return 'Google Ads + Google Analytics';
    case 'ads':
      return 'Google Ads';
    case 'analytics':
      return 'Google Analytics';
    case 'facebook':
      return 'Facebook Ads';
    default:
      return '未知來源';
  }
}

export function adsPlatformSourceLabel(source: string | null | undefined): string {
  const platform = parseAdsPlatformSource(source);
  switch (platform) {
    case 'google':
      return 'Google Ads';
    case 'ga4':
      return 'Google Analytics';
    case 'facebook':
      return 'Facebook Ads';
    default:
      return String(source || '未知');
  }
}

export function originSortRank(origin: DomainSourceOrigin): number {
  switch (origin) {
    case 'both':
      return 0;
    case 'ads':
      return 1;
    case 'analytics':
      return 2;
    case 'facebook':
      return 3;
    default:
      return 4;
  }
}

/** Normalize a URL or domain to a bare hostname (no www) for display / merge. */
export function normalizeDisplayDomain(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/\/+$/, '');
  return s.split(/[/?#]/)[0] || '';
}

/** Keep one website per normalized domain. `isPreferred` wins over the current pick. */
export function mergeWebsitesByDomain<T extends { domain: string; websiteProfileId: string }>(
  websites: T[],
  isPreferred?: (candidate: T, current: T) => boolean,
): T[] {
  const byDomain = new Map<string, T>();
  for (const w of websites) {
    const domain = normalizeDisplayDomain(w.domain);
    if (!domain) continue;
    const next = { ...w, domain };
    const prev = byDomain.get(domain);
    if (!prev || (isPreferred && isPreferred(next, prev))) {
      byDomain.set(domain, next);
    }
  }
  return [...byDomain.values()].sort((a, b) =>
    a.domain.localeCompare(b.domain, undefined, { sensitivity: 'base' }),
  );
}
