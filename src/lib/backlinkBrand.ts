import { extractDomainsFromAccountName, normalizeDomain } from '@/lib/domainMatch';
import { brandLabelOf } from '@/lib/projectOrg';
import type { Brand } from '@/types/app';

export type BacklinkSiteLookup = {
  id: string;
  brandId?: string | null;
  brand?: string | null;
  domainUrl?: string | null;
  status?: string | null;
};

export type BacklinkBrandSource = {
  websiteProfileId?: string | null;
  sourceDomain?: string | null;
  googleAdsAccountName?: string | null;
};

function domainsRelated(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function siteScore(site: BacklinkSiteLookup, exact: boolean): number {
  let score = exact ? 4 : 0;
  if (String(site.status || '').toLowerCase() === 'live') score += 2;
  if (site.brandId?.trim()) score += 1;
  return score;
}

export function matchWebsiteByDomains(
  domains: string[],
  websites: BacklinkSiteLookup[],
): BacklinkSiteLookup | undefined {
  let best: { site: BacklinkSiteLookup; score: number } | undefined;
  for (const raw of domains) {
    const key = normalizeDomain(raw);
    if (!key) continue;
    for (const site of websites) {
      const domain = normalizeDomain(site.domainUrl);
      if (!domain || !domainsRelated(domain, key)) continue;
      const score = siteScore(site, domain === key);
      if (!best || score > best.score) best = { site, score };
    }
  }
  return best?.site;
}

/** Resolve the webandsystem_list row related to a backlink purchase. */
export function resolveBacklinkWebsite(
  purchase: BacklinkBrandSource,
  websites: BacklinkSiteLookup[],
): BacklinkSiteLookup | undefined {
  if (purchase.websiteProfileId) {
    const site = websites.find((w) => w.id === purchase.websiteProfileId);
    if (site) return site;
  }

  const domains = [
    purchase.sourceDomain || '',
    ...extractDomainsFromAccountName(purchase.googleAdsAccountName || ''),
  ].filter(Boolean);

  return matchWebsiteByDomains(domains, websites);
}

export function resolveBacklinkBrandListId(
  purchase: BacklinkBrandSource,
  websites: BacklinkSiteLookup[],
): string | undefined {
  const id = resolveBacklinkWebsite(purchase, websites)?.brandId?.trim();
  return id || undefined;
}

/** Display label for webandsystem_list.brand_list_id (brand_code, then denormalized brand). */
export function resolveBacklinkBrandLabel(
  purchase: BacklinkBrandSource,
  websites: BacklinkSiteLookup[],
  brands: Brand[],
): string {
  const site = resolveBacklinkWebsite(purchase, websites);
  if (!site) return '';
  return brandLabelOf(brands, site.brandId) || site.brand?.trim() || '';
}
