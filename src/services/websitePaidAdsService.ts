import { supabase } from '@/lib/supabase';
import type {
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

function num(value: number | string | null | undefined): number {
  return Number(value) || 0;
}

export async function fetchWebsitePaidAds(
  websiteProfileId: string,
  dateFrom: string,
  dateTo: string,
): Promise<WebsitePaidAdsData> {
  const [gLinkRes, gAggRes] = await Promise.all([
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
  ]);

  if (gLinkRes.error) throw gLinkRes.error;
  if (gAggRes.error) throw gAggRes.error;

  const googleLinks = (gLinkRes.data as GoogleLinkRow[] | null) ?? [];

  const campaignRowIds = [...new Set(googleLinks.map((l) => l.campaign_row_id).filter(Boolean))];
  const customerIds = [...new Set(googleLinks.map((l) => l.customer_id).filter(Boolean))];

  const [gCampRes, gAccRes] = await Promise.all([
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
  ]);

  if (gCampRes.error) throw gCampRes.error;
  if (gAccRes.error) throw gAccRes.error;

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

  return { googleCampaigns };
}
