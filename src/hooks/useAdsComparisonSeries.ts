import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  buildAdsCompareKpis,
  emptyTotals,
  fillDailySeries,
  previousPeriod,
  sumSeries,
} from '@/lib/adsDailySeries';
import type { AdsComparePlatform, AdsCompareSeriesPoint } from '@/types/adsComparison';

type DailyRow = {
  metric_date: string;
  impressions: number | string;
  clicks: number | string;
  conversions: number | string;
  cost_micros?: number | string;
  spend_micros?: number | string;
};

const PAGE_SIZE = 1000;

function metricDateKey(value: string): string {
  return String(value).slice(0, 10);
}

async function fetchDailyRows(
  platform: AdsComparePlatform,
  accountId: string,
  campaignId: string,
  from: string,
  to: string,
): Promise<{ date: string; impressions: number; clicks: number; costMicros: number; conversions: number }[]> {
  const mapped: { date: string; impressions: number; clicks: number; costMicros: number; conversions: number }[] = [];
  let offset = 0;

  for (;;) {
    if (platform === 'google') {
      const { data, error } = await supabase
        .from('google_ads_campaign_daily_metrics')
        .select('metric_date,impressions,clicks,cost_micros,conversions')
        .eq('customer_id', accountId)
        .eq('campaign_id', campaignId)
        .gte('metric_date', from)
        .lte('metric_date', to)
        .order('metric_date', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data as DailyRow[] | null) ?? [];
      for (const row of page) {
        mapped.push({
          date: metricDateKey(row.metric_date),
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          costMicros: Number(row.cost_micros) || 0,
          conversions: Number(row.conversions) || 0,
        });
      }
      if (page.length < PAGE_SIZE) break;
    } else {
      const { data, error } = await supabase
        .from('facebook_ads_campaign_daily_metrics')
        .select('metric_date,impressions,clicks,spend_micros,conversions')
        .eq('ad_account_id', accountId)
        .eq('campaign_id', campaignId)
        .gte('metric_date', from)
        .lte('metric_date', to)
        .order('metric_date', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data as DailyRow[] | null) ?? [];
      for (const row of page) {
        mapped.push({
          date: metricDateKey(row.metric_date),
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          costMicros: Number(row.spend_micros) || 0,
          conversions: Number(row.conversions) || 0,
        });
      }
      if (page.length < PAGE_SIZE) break;
    }
    offset += PAGE_SIZE;
  }

  return mapped;
}

export function useAdsComparisonSeries(
  platform: AdsComparePlatform | null,
  accountId: string | null,
  campaignId: string | null,
  dateFrom: string,
  dateTo: string,
) {
  const { session } = useAuth();
  const [series, setSeries] = useState<AdsCompareSeriesPoint[]>([]);
  const [previousSeries, setPreviousSeries] = useState<AdsCompareSeriesPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestKey =
    platform && accountId && campaignId && dateFrom && dateTo
      ? `${platform}:${accountId}:${campaignId}:${dateFrom}:${dateTo}`
      : '';
  const [dataKey, setDataKey] = useState('');

  useEffect(() => {
    if (!platform || !accountId || !campaignId || !dateFrom || !dateTo) {
      setSeries([]);
      setPreviousSeries([]);
      setLoading(false);
      setError(null);
      setDataKey('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const prev = previousPeriod(dateFrom, dateTo);
    const key = `${platform}:${accountId}:${campaignId}:${dateFrom}:${dateTo}`;

    void (async () => {
      try {
        const [currentRows, previousRows] = await Promise.all([
          fetchDailyRows(platform, accountId, campaignId, dateFrom, dateTo),
          fetchDailyRows(platform, accountId, campaignId, prev.from, prev.to),
        ]);
        if (cancelled) return;
        setSeries(fillDailySeries(dateFrom, dateTo, currentRows));
        setPreviousSeries(fillDailySeries(prev.from, prev.to, previousRows));
        setDataKey(key);
      } catch (e) {
        if (cancelled) return;
        setSeries([]);
        setPreviousSeries([]);
        setDataKey(key);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, platform, accountId, campaignId, dateFrom, dateTo]);

  const totals = useMemo(() => (series.length ? sumSeries(series) : emptyTotals()), [series]);
  const previousTotals = useMemo(
    () => (previousSeries.length ? sumSeries(previousSeries) : emptyTotals()),
    [previousSeries],
  );
  const kpis = useMemo(
    () => buildAdsCompareKpis(totals, previousTotals, series),
    [totals, previousTotals, series],
  );

  return {
    series: dataKey === requestKey ? series : [],
    totals,
    previousTotals,
    kpis: dataKey === requestKey ? kpis : [],
    loading: Boolean(requestKey) && (loading || dataKey !== requestKey),
    error: dataKey === requestKey ? error : null,
  };
}
