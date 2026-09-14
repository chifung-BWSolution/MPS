import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { invokeGscSync } from '@/lib/gscApi';
import { totalsFromSums } from '@/lib/gscReport';
import type { GscSiteRow, GscSyncRun } from '@/types/gsc';

type SiteRow = {
  site_url: string;
  permission_level: string | null;
  website_profile_id: string | null;
  matched_domain: string | null;
  last_synced_at: string | null;
};

type AggRow = {
  site_url: string;
  clicks?: number | string | null;
  impressions?: number | string | null;
  position_weighted?: number | string | null;
};

type WebsiteNameRow = {
  id: string;
  website_name: string | null;
};

type SyncRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  sites_synced: number;
  rows_upserted: number;
  error_message: string | null;
};

function mapSite(row: SiteRow, agg?: AggRow, websiteName?: string | null): GscSiteRow {
  const totals = totalsFromSums(agg || {});
  return {
    siteUrl: row.site_url,
    permissionLevel: row.permission_level,
    websiteProfileId: row.website_profile_id,
    matchedDomain: row.matched_domain,
    websiteName: websiteName ?? null,
    lastSyncedAt: row.last_synced_at,
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.ctr,
    position: totals.position,
  };
}

export function useGscReport(dateFrom: string, dateTo: string) {
  const { session } = useAuth();
  const [sites, setSites] = useState<GscSiteRow[]>([]);
  const [lastSync, setLastSync] = useState<GscSyncRun | null>(null);
  const [dataMinDate, setDataMinDate] = useState<string | null>(null);
  const [dataMaxDate, setDataMaxDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [siteRes, aggRes, syncRes, minRes, maxRes] = await Promise.all([
      supabase
        .from('gsc_sites')
        .select('site_url,permission_level,website_profile_id,matched_domain,last_synced_at')
        .order('matched_domain', { ascending: true }),
      supabase.rpc('gsc_site_metrics_range', {
        p_from: dateFrom,
        p_to: dateTo,
      }),
      supabase
        .from('gsc_sync_runs')
        .select('id,started_at,finished_at,status,sites_synced,rows_upserted,error_message')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('gsc_query_daily_metrics')
        .select('metric_date')
        .order('metric_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('gsc_query_daily_metrics')
        .select('metric_date')
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (siteRes.error) {
      setError(siteRes.error.message);
      setSites([]);
      setLoading(false);
      return;
    }

    const websiteIds = [
      ...new Set(
        ((siteRes.data || []) as SiteRow[])
          .map((row) => row.website_profile_id)
          .filter((id): id is string => !!id),
      ),
    ];
    const websiteNames = new Map<string, string>();
    if (websiteIds.length > 0) {
      const { data: websiteRows } = await supabase
        .from('webandsystem_list')
        .select('id, website_name')
        .in('id', websiteIds);
      for (const row of (websiteRows || []) as WebsiteNameRow[]) {
        websiteNames.set(row.id, row.website_name || '');
      }
    }

    const aggByUrl = new Map<string, AggRow>();
    for (const row of (aggRes.data || []) as AggRow[]) {
      aggByUrl.set(row.site_url, row);
    }

    setSites(
      ((siteRes.data || []) as SiteRow[]).map((row) =>
        mapSite(
          row,
          aggByUrl.get(row.site_url),
          row.website_profile_id ? websiteNames.get(row.website_profile_id) : null,
        ),
      ),
    );
    setDataMinDate((minRes.data as { metric_date?: string } | null)?.metric_date || null);
    setDataMaxDate((maxRes.data as { metric_date?: string } | null)?.metric_date || null);
    const sync = syncRes.data as SyncRow | null;
    setLastSync(
      sync
        ? {
            id: sync.id,
            startedAt: sync.started_at,
            finishedAt: sync.finished_at,
            status: sync.status,
            sitesSynced: sync.sites_synced,
            rowsUpserted: sync.rows_upserted,
            errorMessage: sync.error_message,
          }
        : null,
    );
    setError(aggRes.error?.message || syncRes.error?.message || null);
    setLoading(false);
  }, [dateFrom, dateTo, session?.user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await invokeGscSync();
      await refresh();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  return {
    sites,
    lastSync,
    dataMinDate,
    dataMaxDate,
    loading,
    syncing,
    error,
    refresh,
    triggerSync,
  };
}
