import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { deriveGa4Totals } from '@/lib/ga4Traffic';
import { invokeGa4Sync } from '@/lib/ga4Api';
import type { Ga4Property, Ga4SyncRun } from '@/types/ga4';

type PropertyRow = {
  property_id: string;
  account_id: string | null;
  account_name: string | null;
  display_name: string | null;
  stream_uri: string | null;
  measurement_id: string | null;
  website_profile_id: string | null;
  matched_domain: string | null;
  last_synced_at: string | null;
};

type AggRow = {
  property_id: string;
  users: number | string;
  new_users: number | string;
  sessions: number | string;
  pageviews: number | string;
  engaged_sessions: number | string;
  conversions: number | string;
  duration_seconds: number | string;
};

type WebsiteNameRow = {
  id: string;
  website_name: string | null;
};

type SyncRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  properties_synced: number;
  rows_upserted: number;
  error_message: string | null;
};

function mapProperty(row: PropertyRow, agg?: AggRow, websiteName?: string | null): Ga4Property {
  const totals = deriveGa4Totals({
    users: Number(agg?.users) || 0,
    newUsers: Number(agg?.new_users) || 0,
    sessions: Number(agg?.sessions) || 0,
    pageviews: Number(agg?.pageviews) || 0,
    engagedSessions: Number(agg?.engaged_sessions) || 0,
    conversions: Number(agg?.conversions) || 0,
    durationSecondsWeighted: Number(agg?.duration_seconds) || 0,
  });
  return {
    propertyId: row.property_id,
    accountId: row.account_id || '',
    accountName: row.account_name || '',
    displayName: row.display_name || row.property_id,
    streamUri: row.stream_uri,
    measurementId: row.measurement_id,
    websiteProfileId: row.website_profile_id,
    matchedDomain: row.matched_domain,
    websiteName: websiteName ?? null,
    lastSyncedAt: row.last_synced_at,
    users: totals.users,
    newUsers: totals.newUsers,
    sessions: totals.sessions,
    pageviews: totals.pageviews,
    engagedSessions: totals.engagedSessions,
    conversions: totals.conversions,
    bounceRate: totals.bounceRate,
    engagementRate: totals.engagementRate,
    avgSessionDuration: totals.avgSessionDuration,
  };
}

export function useGa4Data(dateFrom: string, dateTo: string) {
  const { session } = useAuth();
  const [properties, setProperties] = useState<Ga4Property[]>([]);
  const [lastSync, setLastSync] = useState<Ga4SyncRun | null>(null);
  const [dataMinDate, setDataMinDate] = useState<string | null>(null);
  const [dataMaxDate, setDataMaxDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [propRes, aggRes, syncRes, minRes, maxRes] = await Promise.all([
      supabase
        .from('ga4_properties')
        .select(
          'property_id,account_id,account_name,display_name,stream_uri,measurement_id,website_profile_id,matched_domain,last_synced_at',
        )
        .order('display_name', { ascending: true }),
      supabase.rpc('ga4_property_metrics_range', {
        p_from: dateFrom,
        p_to: dateTo,
      }),
      supabase
        .from('ga4_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('ga4_property_daily_metrics')
        .select('metric_date')
        .order('metric_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('ga4_property_daily_metrics')
        .select('metric_date')
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (propRes.error) {
      setError(propRes.error.message);
      setProperties([]);
      setLoading(false);
      return;
    }

    const websiteIds = [...new Set(
      ((propRes.data || []) as PropertyRow[])
        .map((row) => row.website_profile_id)
        .filter((id): id is string => !!id),
    )];
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

    const aggById = new Map<string, AggRow>();
    for (const row of (aggRes.data || []) as AggRow[]) {
      aggById.set(row.property_id, row);
    }

    setProperties(
      ((propRes.data || []) as PropertyRow[]).map((row) =>
        mapProperty(
          row,
          aggById.get(row.property_id),
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
            propertiesSynced: sync.properties_synced,
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
      const result = await invokeGa4Sync(7);
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
    properties,
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
