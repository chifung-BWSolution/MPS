import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mergeWebsitesByDomain } from '@/lib/adsWebsiteDisplay';
import { normalizeGoogleAdsObjectives, type GoogleAdsCampaignDetail, type GoogleAdsDailyMetricPoint, type GoogleAdsMatchedWebsite, type GoogleAdsMetricTotals } from '@/types/googleAds';

type CampaignMetaRow = {
  id: string;
  customer_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  advertising_channel_type: string | null;
  objectives?: string[] | null;
};

type AccountRow = {
  customer_id: string;
  descriptive_name: string;
  currency_code: string | null;
};

type DailyRow = {
  metric_date: string;
  impressions: number | string;
  clicks: number | string;
  cost_micros: number | string;
  conversions: number | string;
};

type WebsiteRow = {
  matched_domain: string;
  website_profile_id: string;
};

function emptyTotals(): GoogleAdsMetricTotals {
  return {
    impressions: 0,
    clicks: 0,
    costMicros: 0,
    conversions: 0,
    ctr: 0,
    averageCpcMicros: 0,
    cpaMicros: null,
  };
}

function deriveTotals(
  impressions: number,
  clicks: number,
  costMicros: number,
  conversions: number,
): GoogleAdsMetricTotals {
  return {
    impressions,
    clicks,
    costMicros,
    conversions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    averageCpcMicros: clicks > 0 ? Math.round(costMicros / clicks) : 0,
    cpaMicros: conversions > 0 ? Math.round(costMicros / conversions) : null,
  };
}

function toIsoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoUtc(d);
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = parseIsoDate(from).getTime();
  const b = parseIsoDate(to).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function previousPeriod(from: string, to: string): { from: string; to: string } {
  const len = daysBetweenInclusive(from, to);
  const prevTo = addDaysIso(from, -1);
  const prevFrom = addDaysIso(prevTo, -(len - 1));
  return { from: prevFrom, to: prevTo };
}

function fillSeries(
  from: string,
  to: string,
  rows: DailyRow[],
): GoogleAdsDailyMetricPoint[] {
  const byDate = new Map<string, DailyRow>();
  for (const row of rows) {
    byDate.set(row.metric_date, row);
  }
  const series: GoogleAdsDailyMetricPoint[] = [];
  let cursor = from;
  while (cursor <= to) {
    const row = byDate.get(cursor);
    const impressions = Number(row?.impressions) || 0;
    const clicks = Number(row?.clicks) || 0;
    const costMicros = Number(row?.cost_micros) || 0;
    const conversions = Number(row?.conversions) || 0;
    series.push({
      date: cursor,
      impressions,
      clicks,
      costMicros,
      conversions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      averageCpcMicros: clicks > 0 ? Math.round(costMicros / clicks) : 0,
    });
    cursor = addDaysIso(cursor, 1);
  }
  return series;
}

function sumSeries(series: GoogleAdsDailyMetricPoint[]): GoogleAdsMetricTotals {
  let impressions = 0;
  let clicks = 0;
  let costMicros = 0;
  let conversions = 0;
  for (const p of series) {
    impressions += p.impressions;
    clicks += p.clicks;
    costMicros += p.costMicros;
    conversions += p.conversions;
  }
  return deriveTotals(impressions, clicks, costMicros, conversions);
}

async function fetchDailyRows(
  customerId: string,
  campaignId: string,
  from: string,
  to: string,
): Promise<DailyRow[]> {
  const { data, error } = await supabase
    .from('google_ads_campaign_daily_metrics')
    .select('metric_date,impressions,clicks,cost_micros,conversions')
    .eq('customer_id', customerId)
    .eq('campaign_id', campaignId)
    .gte('metric_date', from)
    .lte('metric_date', to)
    .order('metric_date', { ascending: true });
  if (error) throw error;
  return (data as DailyRow[] | null) ?? [];
}

export function useGoogleAdsCampaignDetail(
  customerId: string | null,
  campaignId: string | null,
  dateFrom: string,
  dateTo: string,
) {
  
  const [detail, setDetail] = useState<GoogleAdsCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!customerId || !campaignId || !dateFrom || !dateTo) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const campaignKey = `${customerId}:${campaignId}`;
    const prev = previousPeriod(dateFrom, dateTo);

    try {
      const [metaRes, accountRes, websiteRes, currentRows, previousRows] =
        await Promise.all([
          supabase
            .from('google_ads_campaigns')
            .select(
              'id,customer_id,campaign_id,campaign_name,status,advertising_channel_type,objectives',
            )
            .eq('id', campaignKey)
            .maybeSingle(),
          supabase
            .from('google_ads_accounts')
            .select('customer_id,descriptive_name,currency_code')
            .eq('customer_id', customerId)
            .maybeSingle(),
          supabase
            .from('google_ads_campaign_websites')
            .select('matched_domain,website_profile_id')
            .eq('customer_id', customerId)
            .eq('campaign_id', campaignId),
          fetchDailyRows(customerId, campaignId, dateFrom, dateTo),
          fetchDailyRows(customerId, campaignId, prev.from, prev.to),
        ]);

      if (metaRes.error) throw metaRes.error;
      if (accountRes.error) throw accountRes.error;
      if (websiteRes.error) throw websiteRes.error;

      const meta = metaRes.data as CampaignMetaRow | null;
      const account = accountRes.data as AccountRow | null;

      const matchedWebsites = mergeWebsitesByDomain(
        ((websiteRes.data as WebsiteRow[] | null) ?? [])
          .map((link) => ({
            domain: (link.matched_domain || '').trim(),
            websiteProfileId: (link.website_profile_id || '').trim(),
          }))
          .filter((w) => w.domain && w.websiteProfileId),
      );

      const series = fillSeries(dateFrom, dateTo, currentRows);
      const prevSeries = fillSeries(prev.from, prev.to, previousRows);

      setError(null);
      setDetail({
        customerId,
        campaignId,
        campaignName: meta?.campaign_name || campaignId,
        status: meta?.status || 'UNKNOWN',
        advertisingChannelType: meta?.advertising_channel_type ?? undefined,
        objectives: normalizeGoogleAdsObjectives(meta?.objectives),
        accountName: account?.descriptive_name || undefined,
        currencyCode: account?.currency_code ?? undefined,
        matchedWebsites,
        series,
        totals: sumSeries(series),
        previousTotals: sumSeries(prevSeries),
      });
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [customerId, campaignId, dateFrom, dateTo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { detail, loading, error, refresh };
}
