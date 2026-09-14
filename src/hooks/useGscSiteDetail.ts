import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  emptyGscTotals,
  previousGscRange,
  totalsFromSums,
  type GscBreakdownRow,
  type GscDailyPoint,
} from '@/lib/gscReport';
import type { GscSiteDetail, GscSiteRow } from '@/types/gsc';

type SiteRow = {
  site_url: string;
  permission_level: string | null;
  website_profile_id: string | null;
  matched_domain: string | null;
  last_synced_at: string | null;
};

type DailyRow = {
  metric_date: string;
  clicks?: number | string | null;
  impressions?: number | string | null;
  position_weighted?: number | string | null;
};

type BreakdownRpcRow = {
  query?: string;
  page?: string;
  clicks?: number | string | null;
  impressions?: number | string | null;
  position_weighted?: number | string | null;
};

function mapDaily(row: DailyRow): GscDailyPoint {
  const totals = totalsFromSums(row);
  return {
    date: String(row.metric_date).slice(0, 10),
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.ctr,
    position: totals.position,
  };
}

function mapBreakdown(row: BreakdownRpcRow, key: string): GscBreakdownRow {
  const totals = totalsFromSums(row);
  return {
    key,
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.ctr,
    position: totals.position,
  };
}

export function useGscSiteDetail(siteUrl: string, dateFrom: string, dateTo: string) {
  const { session } = useAuth();
  const [detail, setDetail] = useState<GscSiteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const prev = previousGscRange(dateFrom, dateTo);
      const [siteRes, dailyRes, prevDailyRes, queryRes, pageRes] = await Promise.all([
        supabase.from('gsc_sites').select('*').eq('site_url', siteUrl).maybeSingle(),
        supabase.rpc('gsc_site_daily_range', {
          p_site_url: siteUrl,
          p_from: dateFrom,
          p_to: dateTo,
        }),
        supabase.rpc('gsc_site_daily_range', {
          p_site_url: siteUrl,
          p_from: prev.from,
          p_to: prev.to,
        }),
        supabase.rpc('gsc_top_queries_range', {
          p_site_url: siteUrl,
          p_from: dateFrom,
          p_to: dateTo,
          p_limit: 100,
        }),
        supabase.rpc('gsc_top_pages_range', {
          p_site_url: siteUrl,
          p_from: dateFrom,
          p_to: dateTo,
          p_limit: 100,
        }),
      ]);

      if (cancelled) return;
      if (siteRes.error) {
        setError(siteRes.error.message);
        setDetail(null);
        setLoading(false);
        return;
      }

      const siteRow = siteRes.data as SiteRow | null;
      if (!siteRow) {
        setError('找不到此 GSC 資源');
        setDetail(null);
        setLoading(false);
        return;
      }

      let websiteName: string | null = null;
      if (siteRow.website_profile_id) {
        const { data: website } = await supabase
          .from('webandsystem_list')
          .select('website_name')
          .eq('id', siteRow.website_profile_id)
          .maybeSingle();
        websiteName = (website as { website_name?: string } | null)?.website_name || null;
      }
      if (cancelled) return;

      const series = ((dailyRes.data || []) as DailyRow[]).map(mapDaily);
      const prevSeries = ((prevDailyRes.data || []) as DailyRow[]).map(mapDaily);
      const totals = totalsFromSums({
        clicks: series.reduce((n, p) => n + p.clicks, 0),
        impressions: series.reduce((n, p) => n + p.impressions, 0),
        position_weighted: series.reduce((n, p) => n + p.position * p.impressions, 0),
      });
      const previousTotals = totalsFromSums({
        clicks: prevSeries.reduce((n, p) => n + p.clicks, 0),
        impressions: prevSeries.reduce((n, p) => n + p.impressions, 0),
        position_weighted: prevSeries.reduce((n, p) => n + p.position * p.impressions, 0),
      });

      const site: GscSiteRow = {
        siteUrl: siteRow.site_url,
        permissionLevel: siteRow.permission_level,
        websiteProfileId: siteRow.website_profile_id,
        matchedDomain: siteRow.matched_domain,
        websiteName,
        lastSyncedAt: siteRow.last_synced_at,
        clicks: totals.clicks,
        impressions: totals.impressions,
        ctr: totals.ctr,
        position: totals.position,
      };

      setDetail({
        site,
        totals,
        previousTotals: previousTotals.impressions || previousTotals.clicks ? previousTotals : emptyGscTotals(),
        series,
        queries: ((queryRes.data || []) as BreakdownRpcRow[]).map((row) =>
          mapBreakdown(row, String(row.query || '').trim()),
        ).filter((row) => row.key),
        pages: ((pageRes.data || []) as BreakdownRpcRow[]).map((row) =>
          mapBreakdown(row, String(row.page || '').trim()),
        ).filter((row) => row.key),
      });
      setError(
        dailyRes.error?.message ||
          prevDailyRes.error?.message ||
          queryRes.error?.message ||
          pageRes.error?.message ||
          null,
      );
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, session?.user?.id, siteUrl]);

  return { detail, loading, error };
}
