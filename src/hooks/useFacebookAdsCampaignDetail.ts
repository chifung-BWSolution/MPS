import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { resolveFacebookBrandListId } from '@/lib/facebookAdsBrand';
import type {
  FacebookAdsCampaignDetail,
  FacebookAdsDailyMetricPoint,
  FacebookAdsMetricTotals,
} from '@/types/facebookAds';

type CampaignMetaRow = {
  id: string;
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  objective: string | null;
  brand_list_id: string | null;
};

type AccountRow = {
  ad_account_id: string;
  account_name: string;
  currency_code: string | null;
  business_key: string;
  business_name: string;
  brand_list_id?: string | null;
};

type BrandRow = {
  id: string;
  brand_code: string;
  display_name: string;
};

type DailyRow = {
  metric_date: string;
  impressions: number | string;
  clicks: number | string;
  spend_micros: number | string;
  conversions: number | string;
};

function deriveTotals(
  impressions: number,
  clicks: number,
  spendMicros: number,
  conversions: number,
): FacebookAdsMetricTotals {
  return {
    impressions,
    clicks,
    spendMicros,
    conversions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    averageCpcMicros: clicks > 0 ? Math.round(spendMicros / clicks) : 0,
    cpaMicros: conversions > 0 ? Math.round(spendMicros / conversions) : null,
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
): FacebookAdsDailyMetricPoint[] {
  const byDate = new Map<string, DailyRow>();
  for (const row of rows) {
    byDate.set(row.metric_date, row);
  }
  const series: FacebookAdsDailyMetricPoint[] = [];
  let cursor = from;
  while (cursor <= to) {
    const row = byDate.get(cursor);
    const impressions = Number(row?.impressions) || 0;
    const clicks = Number(row?.clicks) || 0;
    const spendMicros = Number(row?.spend_micros) || 0;
    const conversions = Number(row?.conversions) || 0;
    series.push({
      date: cursor,
      impressions,
      clicks,
      spendMicros,
      conversions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      averageCpcMicros: clicks > 0 ? Math.round(spendMicros / clicks) : 0,
    });
    cursor = addDaysIso(cursor, 1);
  }
  return series;
}

function sumSeries(series: FacebookAdsDailyMetricPoint[]): FacebookAdsMetricTotals {
  let impressions = 0;
  let clicks = 0;
  let spendMicros = 0;
  let conversions = 0;
  for (const p of series) {
    impressions += p.impressions;
    clicks += p.clicks;
    spendMicros += p.spendMicros;
    conversions += p.conversions;
  }
  return deriveTotals(impressions, clicks, spendMicros, conversions);
}

async function fetchDailyRows(
  adAccountId: string,
  campaignId: string,
  from: string,
  to: string,
): Promise<DailyRow[]> {
  const { data, error } = await supabase
    .from('facebook_ads_campaign_daily_metrics')
    .select('metric_date,impressions,clicks,spend_micros,conversions')
    .eq('ad_account_id', adAccountId)
    .eq('campaign_id', campaignId)
    .gte('metric_date', from)
    .lte('metric_date', to)
    .order('metric_date', { ascending: true });
  if (error) throw error;
  return (data as DailyRow[] | null) ?? [];
}

export function useFacebookAdsCampaignDetail(
  adAccountId: string | null,
  campaignId: string | null,
  dateFrom: string,
  dateTo: string,
) {
  const { session } = useAuth();
  const [detail, setDetail] = useState<FacebookAdsCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!adAccountId || !campaignId || !dateFrom || !dateTo) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const campaignKey = `${adAccountId}:${campaignId}`;
    const prev = previousPeriod(dateFrom, dateTo);

    try {
      const [metaRes, accountRes, currentRows, previousRows] = await Promise.all([
        supabase
          .from('facebook_ads_campaigns')
          .select(
            'id,ad_account_id,campaign_id,campaign_name,status,objective,brand_list_id',
          )
          .eq('id', campaignKey)
          .maybeSingle(),
        supabase
          .from('facebook_ads_accounts')
          .select('ad_account_id,account_name,currency_code,business_key,business_name')
          .eq('ad_account_id', adAccountId)
          .maybeSingle(),
        fetchDailyRows(adAccountId, campaignId, dateFrom, dateTo),
        fetchDailyRows(adAccountId, campaignId, prev.from, prev.to),
      ]);

      if (metaRes.error) throw metaRes.error;
      if (accountRes.error) throw accountRes.error;

      const meta = metaRes.data as CampaignMetaRow | null;
      const account = accountRes.data as AccountRow | null;

      const brandListRes = await supabase
        .from('brand_list')
        .select('id, brand_code, display_name')
        .eq('is_active', true);
      if (brandListRes.error) throw brandListRes.error;
      const brands = (brandListRes.data as BrandRow[] | null) ?? [];
      const brandIdByCode = new Map(brands.map((b) => [b.brand_code, b.id]));
      const brandById = new Map(brands.map((b) => [b.id, b]));
      const brandListId = resolveFacebookBrandListId(
        meta?.brand_list_id,
        account?.brand_list_id,
        {
          accountName: account?.account_name,
          businessName: account?.business_name,
          businessKey: account?.business_key,
        },
        brandIdByCode,
      );
      const brand = brandListId ? brandById.get(brandListId) : undefined;
      const brandCode = brand?.brand_code;
      const brandDisplayName = brand?.display_name;

      const series = fillSeries(dateFrom, dateTo, currentRows);
      const prevSeries = fillSeries(prev.from, prev.to, previousRows);

      setError(null);
      setDetail({
        adAccountId,
        campaignId,
        campaignName: meta?.campaign_name || campaignId,
        status: meta?.status || 'UNKNOWN',
        objective: meta?.objective ?? undefined,
        accountName: account?.account_name || undefined,
        businessName: account?.business_name || undefined,
        businessKey: account?.business_key || undefined,
        currencyCode: account?.currency_code ?? undefined,
        brandListId,
        brandCode,
        brandDisplayName,
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
  }, [adAccountId, campaignId, dateFrom, dateTo]);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  return { detail, loading, error, refresh };
}
