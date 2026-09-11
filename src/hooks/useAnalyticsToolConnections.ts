import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { resolveFacebookBrandListId } from '@/lib/facebookAdsBrand';
import {
  buildWebsiteToolConnections,
  type WebsiteToolConnections,
} from '@/lib/analyticsToolConnections';

type WebsiteRow = {
  id: string;
  ga4_property_id: string | null;
  gsc_site_url: string | null;
  google_ads_customer_id: string | null;
  brand_list_id: string | null;
  brand_id: string | null;
};

type Ga4Row = {
  property_id: string;
  display_name: string | null;
  account_name: string | null;
  measurement_id: string | null;
  website_profile_id: string | null;
};

type GscRow = {
  site_url: string;
  permission_level: string | null;
  matched_domain: string | null;
  website_profile_id: string | null;
};

type GoogleAdsLinkRow = {
  website_profile_id: string;
  customer_id: string | null;
};

type GoogleAdsAccountRow = {
  customer_id: string;
  descriptive_name: string | null;
};

type FacebookAdsAccountRow = {
  ad_account_id: string;
  account_name: string | null;
  business_name: string | null;
  business_key: string | null;
};

type FacebookCampaignBrandRow = {
  ad_account_id: string;
  brand_list_id: string | null;
};

type BrandRow = {
  id: string;
  brand_code: string;
};

const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: rows, error: error.message };
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
    offset += PAGE_SIZE;
  }
}

export function useAnalyticsToolConnections() {
  const [websiteRows, setWebsiteRows] = useState<WebsiteRow[]>([]);
  const [ga4Rows, setGa4Rows] = useState<Ga4Row[]>([]);
  const [gscRows, setGscRows] = useState<GscRow[]>([]);
  const [googleAdsLinks, setGoogleAdsLinks] = useState<GoogleAdsLinkRow[]>([]);
  const [googleAdsAccounts, setGoogleAdsAccounts] = useState<GoogleAdsAccountRow[]>([]);
  const [facebookAdsAccounts, setFacebookAdsAccounts] = useState<FacebookAdsAccountRow[]>([]);
  const [facebookCampaignBrands, setFacebookCampaignBrands] = useState<FacebookCampaignBrandRow[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [websiteRes, ga4Res, gscRes, adsLinkRes, adsAccRes, fbRes, fbCampRes, brandRes] = await Promise.all([
      fetchAllPages<WebsiteRow>((from, to) =>
        supabase
          .from('webandsystem_list')
          .select('id,ga4_property_id,gsc_site_url,google_ads_customer_id,brand_list_id,brand_id')
          .range(from, to),
      ),
      fetchAllPages<Ga4Row>((from, to) =>
        supabase
          .from('ga4_properties')
          .select('property_id,display_name,account_name,measurement_id,website_profile_id')
          .range(from, to),
      ),
      fetchAllPages<GscRow>((from, to) =>
        supabase
          .from('gsc_sites')
          .select('site_url,permission_level,matched_domain,website_profile_id')
          .range(from, to),
      ),
      fetchAllPages<GoogleAdsLinkRow>((from, to) =>
        supabase
          .from('google_ads_campaign_websites')
          .select('website_profile_id,customer_id')
          .range(from, to),
      ),
      fetchAllPages<GoogleAdsAccountRow>((from, to) =>
        supabase
          .from('google_ads_accounts')
          .select('customer_id,descriptive_name')
          .range(from, to),
      ),
      fetchAllPages<FacebookAdsAccountRow>((from, to) =>
        supabase
          .from('facebook_ads_accounts')
          .select('ad_account_id,account_name,business_name,business_key')
          .range(from, to),
      ),
      fetchAllPages<FacebookCampaignBrandRow>((from, to) =>
        supabase
          .from('facebook_ads_campaigns')
          .select('ad_account_id,brand_list_id')
          .range(from, to),
      ),
      supabase.from('brand_list').select('id, brand_code').eq('is_active', true),
    ]);

    const messages = [
      websiteRes.error,
      ga4Res.error,
      gscRes.error,
      adsLinkRes.error,
      adsAccRes.error,
      fbRes.error,
      fbCampRes.error,
      brandRes.error?.message,
    ]
      .filter(Boolean)
      .join(' ');
    setError(messages || null);
    setWebsiteRows(websiteRes.data);
    setGa4Rows(ga4Res.data);
    setGscRows(gscRes.data);
    setGoogleAdsLinks(adsLinkRes.data);
    setGoogleAdsAccounts(adsAccRes.data);
    setFacebookAdsAccounts(fbRes.data);
    setFacebookCampaignBrands(fbCampRes.data);
    setBrands((brandRes.data as BrandRow[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const byWebsiteId: Map<string, WebsiteToolConnections> = useMemo(() => {
    const brandIdByCode = new Map(brands.map((row) => [row.brand_code, row.id]));
    const campaignBrandsByAccount = new Map<string, string[]>();
    for (const campaign of facebookCampaignBrands) {
      const accountId = String(campaign.ad_account_id || '').trim();
      const brandId = String(campaign.brand_list_id || '').trim();
      if (!accountId || !brandId) continue;
      const list = campaignBrandsByAccount.get(accountId) ?? [];
      if (!list.includes(brandId)) list.push(brandId);
      campaignBrandsByAccount.set(accountId, list);
    }

    return buildWebsiteToolConnections({
      websites: websiteRows.map((row) => ({
        id: row.id,
        ga4PropertyId: row.ga4_property_id,
        gscSiteUrl: row.gsc_site_url,
        googleAdsCustomerId: row.google_ads_customer_id,
        brandListId: row.brand_list_id || row.brand_id,
      })),
      ga4: ga4Rows,
      gsc: gscRows,
      googleAdsLinks,
      googleAdsAccounts,
      facebookAdsAccounts: facebookAdsAccounts.map((row) => {
        const inferred = resolveFacebookBrandListId(null, null, {
          accountName: row.account_name,
          businessName: row.business_name,
          businessKey: row.business_key,
        }, brandIdByCode);
        return {
          ...row,
          brandIds: [...new Set([...(campaignBrandsByAccount.get(row.ad_account_id) ?? []), inferred].filter(
            (id): id is string => Boolean(id),
          ))],
        };
      }),
    });
  }, [brands, facebookAdsAccounts, facebookCampaignBrands, ga4Rows, googleAdsAccounts, googleAdsLinks, gscRows, websiteRows]);

  return { byWebsiteId, loading, error, refresh };
}
