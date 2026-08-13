import { supabase } from '@/lib/supabase';
import type {
  WebsiteFacebookAdCampaign,
  WebsiteGoogleAdCampaign,
  WebsitePaidAdsData,
} from '@/types/websitePaidAds';

type GoogleLinkRow = {
  customer_id: string;
  campaign_id: string;
  campaign_row_id: string;
  matched_domain: string;
  sample_final_url: string | null;
  match_source: string;
  last_seen_at: string;
};

type GoogleCampaignMeta = {
  id: string;
  customer_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  advertising_channel_type: string | null;
};

type GoogleAccountMeta = {
  customer_id: string;
  descriptive_name: string;
};

type GoogleAggRow = {
  customer_id: string;
  campaign_id: string;
  impressions: number | string;
  clicks: number | string;
  cost_micros: number | string;
  conversions: number | string;
};

type FacebookCampaignMeta = {
  id: string;
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  objective: string | null;
};

type FacebookAccountMeta = {
  ad_account_id: string;
  account_name: string;
  business_name: string | null;
};

type FacebookAggRow = {
  ad_account_id: string;
  campaign_id: string;
  impressions: number | string;
  clicks: number | string;
  spend_micros: number | string;
  conversions: number | string;
};

function num(value: number | string | null | undefined): number {
  return Number(value) || 0;
}

export async function fetchWebsitePaidAds(
  websiteProfileId: string,
  dateFrom: string,
  dateTo: string,
  brandListId?: string | null,
): Promise<WebsitePaidAdsData> {
  const brandId = (brandListId || '').trim();
  const [gLinkRes, gAggRes, fAggRes] = await Promise.all([
    supabase
      .from('google_ads_campaign_websites')
      .select(
        'customer_id,campaign_id,campaign_row_id,matched_domain,sample_final_url,match_source,last_seen_at',
      )
      .eq('website_profile_id', websiteProfileId)
      .order('last_seen_at', { ascending: false }),
    supabase.rpc('google_ads_campaign_metrics_range', {
      p_from: dateFrom,
      p_to: dateTo,
    }),
    supabase.rpc('facebook_ads_campaign_metrics_range', {
      p_from: dateFrom,
      p_to: dateTo,
    }),
  ]);

  if (gLinkRes.error) throw gLinkRes.error;
  if (gAggRes.error) throw gAggRes.error;
  if (fAggRes.error) throw fAggRes.error;

  const googleLinks = (gLinkRes.data as GoogleLinkRow[] | null) ?? [];

  const campaignRowIds = [...new Set(googleLinks.map((l) => l.campaign_row_id).filter(Boolean))];
  const customerIds = [...new Set(googleLinks.map((l) => l.customer_id).filter(Boolean))];

  const [gCampRes, gAccRes, fCampRes] = await Promise.all([
    campaignRowIds.length
      ? supabase
          .from('google_ads_campaigns')
          .select(
            'id,customer_id,campaign_id,campaign_name,status,advertising_channel_type',
          )
          .in('id', campaignRowIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabase
          .from('google_ads_accounts')
          .select('customer_id,descriptive_name')
          .in('customer_id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    brandId
      ? supabase
          .from('facebook_ads_campaigns')
          .select('id,ad_account_id,campaign_id,campaign_name,status,objective')
          .eq('brand_list_id', brandId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (gCampRes.error) throw gCampRes.error;
  if (gAccRes.error) throw gAccRes.error;
  if (fCampRes.error) throw fCampRes.error;

  const campaignMeta = new Map(
    ((gCampRes.data as GoogleCampaignMeta[] | null) ?? []).map((c) => [c.id, c]),
  );
  const googleAccountNames = new Map(
    ((gAccRes.data as GoogleAccountMeta[] | null) ?? []).map((a) => [
      a.customer_id,
      a.descriptive_name,
    ]),
  );

  const googleMetrics = new Map<string, { impressions: number; clicks: number; spendMicros: number; conversions: number }>();
  for (const row of (gAggRes.data as GoogleAggRow[] | null) ?? []) {
    googleMetrics.set(`${row.customer_id}:${row.campaign_id}`, {
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      spendMicros: num(row.cost_micros),
      conversions: num(row.conversions),
    });
  }

  const googleCampaigns: WebsiteGoogleAdCampaign[] = googleLinks
    .map((link): WebsiteGoogleAdCampaign => {
      const meta = campaignMeta.get(link.campaign_row_id);
      const metrics = googleMetrics.get(`${link.customer_id}:${link.campaign_id}`);
      return {
        platform: 'google',
        key: `${link.customer_id}:${link.campaign_id}`,
        customerId: link.customer_id,
        campaignId: link.campaign_id,
        campaignRowId: link.campaign_row_id,
        campaignName: meta?.campaign_name || link.campaign_id,
        status: meta?.status || 'UNKNOWN',
        channelType: meta?.advertising_channel_type ?? undefined,
        accountName: googleAccountNames.get(link.customer_id),
        matchedDomain: link.matched_domain,
        sampleFinalUrl: link.sample_final_url,
        matchSource: link.match_source,
        lastSeenAt: link.last_seen_at,
        impressions: metrics?.impressions ?? 0,
        clicks: metrics?.clicks ?? 0,
        spendMicros: metrics?.spendMicros ?? 0,
        conversions: metrics?.conversions ?? 0,
      };
    })
    .sort((a, b) => b.spendMicros - a.spendMicros);

  const facebookMeta = (fCampRes.data as FacebookCampaignMeta[] | null) ?? [];
  const facebookAccountIds = [...new Set(facebookMeta.map((c) => c.ad_account_id).filter(Boolean))];
  const fAccRes = facebookAccountIds.length
    ? await supabase
        .from('facebook_ads_accounts')
        .select('ad_account_id,account_name,business_name')
        .in('ad_account_id', facebookAccountIds)
    : { data: [], error: null };
  if (fAccRes.error) throw fAccRes.error;

  const facebookAccountNames = new Map(
    ((fAccRes.data as FacebookAccountMeta[] | null) ?? []).map((a) => [
      a.ad_account_id,
      a,
    ]),
  );
  const facebookMetrics = new Map<string, { impressions: number; clicks: number; spendMicros: number; conversions: number }>();
  for (const row of (fAggRes.data as FacebookAggRow[] | null) ?? []) {
    facebookMetrics.set(`${row.ad_account_id}:${row.campaign_id}`, {
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      spendMicros: num(row.spend_micros),
      conversions: num(row.conversions),
    });
  }

  const facebookCampaigns: WebsiteFacebookAdCampaign[] = facebookMeta
    .map((meta): WebsiteFacebookAdCampaign => {
      const metrics = facebookMetrics.get(`${meta.ad_account_id}:${meta.campaign_id}`);
      const account = facebookAccountNames.get(meta.ad_account_id);
      return {
        platform: 'facebook',
        key: `${meta.ad_account_id}:${meta.campaign_id}`,
        adAccountId: meta.ad_account_id,
        campaignId: meta.campaign_id,
        campaignName: meta.campaign_name || meta.campaign_id,
        status: meta.status || 'UNKNOWN',
        objective: meta.objective ?? undefined,
        accountName: account?.account_name,
        businessName: account?.business_name ?? undefined,
        impressions: metrics?.impressions ?? 0,
        clicks: metrics?.clicks ?? 0,
        spendMicros: metrics?.spendMicros ?? 0,
        conversions: metrics?.conversions ?? 0,
      };
    })
    .sort((a, b) => b.spendMicros - a.spendMicros);

  return { googleCampaigns, facebookCampaigns };
}
