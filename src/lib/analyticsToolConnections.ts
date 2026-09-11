export type AnalyticsToolId = 'ga4' | 'gsc' | 'google_ads' | 'facebook_ads';

export type AnalyticsToolAccount = {
  id: string;
  name: string;
  description: string;
};

export type WebsiteToolCell = {
  accounts: AnalyticsToolAccount[];
};

export type WebsiteToolConnections = {
  websiteId: string;
  ga4: WebsiteToolCell;
  gsc: WebsiteToolCell;
  googleAds: WebsiteToolCell;
  facebookAds: WebsiteToolCell;
};

export function formatGoogleAdsCustomerId(raw: string | null | undefined): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(raw || '').trim();
}

function pushUnique(list: AnalyticsToolAccount[], account: AnalyticsToolAccount | null): void {
  if (!account) return;
  if (list.some((item) => item.id === account.id)) return;
  list.push(account);
}

export function mapGa4Account(row: {
  property_id?: string | null;
  display_name?: string | null;
  account_name?: string | null;
  measurement_id?: string | null;
}): AnalyticsToolAccount | null {
  const propertyId = String(row.property_id || '').trim();
  const measurementId = String(row.measurement_id || '').trim();
  const name = String(row.display_name || row.account_name || propertyId).trim();
  if (!name && !measurementId && !propertyId) return null;
  return {
    id: propertyId || measurementId || name,
    name: name || propertyId || measurementId,
    description: measurementId || propertyId,
  };
}

export function groupAnalyticsAccountsByName(accounts: AnalyticsToolAccount[]): Array<{
  name: string;
  descriptions: string[];
}> {
  const groups: Array<{ name: string; descriptions: string[] }> = [];
  const indexByName = new Map<string, number>();
  for (const account of accounts) {
    const name = String(account.name || '').trim() || account.description;
    const description = String(account.description || '').trim();
    const existing = indexByName.get(name);
    if (existing == null) {
      indexByName.set(name, groups.length);
      groups.push({
        name,
        descriptions: description ? [description] : [],
      });
      continue;
    }
    if (description && !groups[existing].descriptions.includes(description)) {
      groups[existing].descriptions.push(description);
    }
  }
  return groups;
}

export function mapGscAccount(row: {
  site_url?: string | null;
  permission_level?: string | null;
  matched_domain?: string | null;
}): AnalyticsToolAccount | null {
  const siteUrl = String(row.site_url || '').trim();
  if (!siteUrl) return null;
  const domain = String(row.matched_domain || '').trim();
  return {
    id: siteUrl,
    name: domain || siteUrl,
    description: siteUrl,
  };
}

export function mapGoogleAdsAccount(row: {
  customer_id?: string | null;
  descriptive_name?: string | null;
}): AnalyticsToolAccount | null {
  const customerId = String(row.customer_id || '').trim();
  const formattedId = formatGoogleAdsCustomerId(customerId);
  const name = String(row.descriptive_name || formattedId).trim();
  if (!name && !customerId) return null;
  return {
    id: customerId || name,
    name: name || formattedId,
    description: formattedId,
  };
}

export function mapFacebookAdsAccount(row: {
  ad_account_id?: string | null;
  account_name?: string | null;
  business_name?: string | null;
  business_key?: string | null;
}): AnalyticsToolAccount | null {
  const adAccountId = String(row.ad_account_id || '').trim();
  const name = String(row.account_name || row.business_name || adAccountId).trim();
  if (!name && !adAccountId) return null;
  return {
    id: adAccountId || name,
    name: name || adAccountId,
    description: adAccountId,
  };
}

export type WebsiteConnectionSource = {
  id: string;
  ga4PropertyId?: string | null;
  gscSiteUrl?: string | null;
  googleAdsCustomerId?: string | null;
  brandListId?: string | null;
};

export function buildWebsiteToolConnections(input: {
  websites: WebsiteConnectionSource[];
  ga4: Array<Parameters<typeof mapGa4Account>[0] & { website_profile_id?: string | null }>;
  gsc: Array<Parameters<typeof mapGscAccount>[0] & { website_profile_id?: string | null }>;
  googleAdsLinks: Array<{ website_profile_id?: string | null; customer_id?: string | null }>;
  googleAdsAccounts: Array<Parameters<typeof mapGoogleAdsAccount>[0]>;
  facebookAdsAccounts: Array<Parameters<typeof mapFacebookAdsAccount>[0] & { brandIds?: string[] | null }>;
}): Map<string, WebsiteToolConnections> {
  const ga4ByWebsite = new Map<string, AnalyticsToolAccount[]>();
  const ga4ByProperty = new Map<string, AnalyticsToolAccount>();
  for (const row of input.ga4) {
    const account = mapGa4Account(row);
    if (!account) continue;
    ga4ByProperty.set(account.id, account);
    const websiteId = String(row.website_profile_id || '').trim();
    if (!websiteId) continue;
    const list = ga4ByWebsite.get(websiteId) ?? [];
    pushUnique(list, account);
    ga4ByWebsite.set(websiteId, list);
  }

  const gscByWebsite = new Map<string, AnalyticsToolAccount[]>();
  const gscBySiteUrl = new Map<string, AnalyticsToolAccount>();
  for (const row of input.gsc) {
    const account = mapGscAccount(row);
    if (!account) continue;
    gscBySiteUrl.set(account.id, account);
    const websiteId = String(row.website_profile_id || '').trim();
    if (!websiteId) continue;
    const list = gscByWebsite.get(websiteId) ?? [];
    pushUnique(list, account);
    gscByWebsite.set(websiteId, list);
  }

  const adsAccountById = new Map<string, AnalyticsToolAccount>();
  for (const row of input.googleAdsAccounts) {
    const account = mapGoogleAdsAccount(row);
    if (!account) continue;
    adsAccountById.set(account.id, account);
  }

  const adsByWebsite = new Map<string, AnalyticsToolAccount[]>();
  for (const link of input.googleAdsLinks) {
    const websiteId = String(link.website_profile_id || '').trim();
    const customerId = String(link.customer_id || '').trim();
    if (!websiteId || !customerId) continue;
    const account = adsAccountById.get(customerId) ?? mapGoogleAdsAccount({ customer_id: customerId });
    const list = adsByWebsite.get(websiteId) ?? [];
    pushUnique(list, account);
    adsByWebsite.set(websiteId, list);
  }

  const facebookByBrand = new Map<string, AnalyticsToolAccount[]>();
  for (const row of input.facebookAdsAccounts) {
    const account = mapFacebookAdsAccount(row);
    if (!account) continue;
    for (const rawBrandId of row.brandIds ?? []) {
      const brandId = String(rawBrandId || '').trim();
      if (!brandId) continue;
      const list = facebookByBrand.get(brandId) ?? [];
      pushUnique(list, account);
      facebookByBrand.set(brandId, list);
    }
  }

  const out = new Map<string, WebsiteToolConnections>();
  for (const site of input.websites) {
    const websiteId = String(site.id || '').trim();
    if (!websiteId) continue;

    const ga4 = [...(ga4ByWebsite.get(websiteId) ?? [])];
    pushUnique(ga4, ga4ByProperty.get(String(site.ga4PropertyId || '').trim()) ?? null);

    const gsc = [...(gscByWebsite.get(websiteId) ?? [])];
    pushUnique(gsc, gscBySiteUrl.get(String(site.gscSiteUrl || '').trim()) ?? null);

    const googleAds = [...(adsByWebsite.get(websiteId) ?? [])];
    const explicitAdsId = String(site.googleAdsCustomerId || '').trim();
    if (explicitAdsId) {
      pushUnique(googleAds, adsAccountById.get(explicitAdsId) ?? mapGoogleAdsAccount({ customer_id: explicitAdsId }));
    }

    out.set(websiteId, {
      websiteId,
      ga4: { accounts: ga4 },
      gsc: { accounts: gsc },
      googleAds: { accounts: googleAds },
      facebookAds: { accounts: [...(facebookByBrand.get(String(site.brandListId || '').trim()) ?? [])] },
    });
  }
  return out;
}
