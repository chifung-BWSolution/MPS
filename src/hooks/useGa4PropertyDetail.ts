import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  addDaysIso,
  deriveGa4Totals,
  emptyGa4Totals,
  previousPeriod,
  type Ga4MetricTotals,
} from '@/lib/ga4Traffic';
import type { Ga4ChannelPoint, Ga4DailyMetricPoint, Ga4Property, Ga4PropertyDetail } from '@/types/ga4';

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

type DailyRow = {
  metric_date: string;
  users: number | string;
  new_users: number | string;
  sessions: number | string;
  pageviews: number | string;
  engaged_sessions: number | string;
  conversions: number | string;
  avg_session_duration: number | string;
};

type ChannelRow = {
  channel: string;
  sessions: number | string;
  users: number | string;
  pageviews: number | string;
};

function fillSeries(from: string, to: string, rows: DailyRow[]): Ga4DailyMetricPoint[] {
  const byDate = new Map(rows.map((row) => [row.metric_date, row]));
  const series: Ga4DailyMetricPoint[] = [];
  let cursor = from;
  while (cursor <= to) {
    const row = byDate.get(cursor);
    const sessions = Number(row?.sessions) || 0;
    const engaged = Number(row?.engaged_sessions) || 0;
    const pageviews = Number(row?.pageviews) || 0;
    const engagementRate = sessions > 0 ? engaged / sessions : 0;
    series.push({
      date: cursor,
      users: Number(row?.users) || 0,
      newUsers: Number(row?.new_users) || 0,
      sessions,
      pageviews,
      engagedSessions: engaged,
      conversions: Number(row?.conversions) || 0,
      bounceRate: sessions > 0 ? Math.max(0, 1 - engagementRate) : 0,
      engagementRate,
      avgSessionDuration: Number(row?.avg_session_duration) || 0,
      pagesPerSession: sessions > 0 ? pageviews / sessions : 0,
    });
    cursor = addDaysIso(cursor, 1);
  }
  return series;
}

function sumSeries(series: Ga4DailyMetricPoint[]): Ga4MetricTotals {
  return deriveGa4Totals({
    users: series.reduce((s, p) => s + p.users, 0),
    newUsers: series.reduce((s, p) => s + p.newUsers, 0),
    sessions: series.reduce((s, p) => s + p.sessions, 0),
    pageviews: series.reduce((s, p) => s + p.pageviews, 0),
    engagedSessions: series.reduce((s, p) => s + p.engagedSessions, 0),
    conversions: series.reduce((s, p) => s + p.conversions, 0),
    durationSecondsWeighted: series.reduce(
      (s, p) => s + p.avgSessionDuration * p.sessions,
      0,
    ),
  });
}

function mapProperty(row: PropertyRow, websiteName: string | null, totals: Ga4MetricTotals): Ga4Property {
  return {
    propertyId: row.property_id,
    accountId: row.account_id || '',
    accountName: row.account_name || '',
    displayName: row.display_name || row.property_id,
    streamUri: row.stream_uri,
    measurementId: row.measurement_id,
    websiteProfileId: row.website_profile_id,
    matchedDomain: row.matched_domain,
    websiteName,
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

export function useGa4PropertyDetail(
  propertyId: string | null,
  from: string,
  to: string,
) {
  const { session } = useAuth();
  const [detail, setDetail] = useState<Ga4PropertyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!propertyId || !from || !to) {
      setDetail(null);
      return;
    }
    setLoading(true);
    const prev = previousPeriod(from, to);
    const [propRes, dailyRes, prevRes, channelRes] = await Promise.all([
      supabase.from('ga4_properties').select('*').eq('property_id', propertyId).maybeSingle(),
      supabase
        .from('ga4_property_daily_metrics')
        .select(
          'metric_date,users,new_users,sessions,pageviews,engaged_sessions,conversions,avg_session_duration',
        )
        .eq('property_id', propertyId)
        .gte('metric_date', from)
        .lte('metric_date', to),
      supabase
        .from('ga4_property_daily_metrics')
        .select(
          'metric_date,users,new_users,sessions,pageviews,engaged_sessions,conversions,avg_session_duration',
        )
        .eq('property_id', propertyId)
        .gte('metric_date', prev.from)
        .lte('metric_date', prev.to),
      supabase
        .from('ga4_channel_daily_metrics')
        .select('channel,sessions,users,pageviews')
        .eq('property_id', propertyId)
        .gte('metric_date', from)
        .lte('metric_date', to),
    ]);

    if (propRes.error || !propRes.data) {
      setError(propRes.error?.message || '找不到此 GA4 property');
      setDetail(null);
      setLoading(false);
      return;
    }

    const row = propRes.data as PropertyRow;
    let websiteName: string | null = null;
    if (row.website_profile_id) {
      const { data: website } = await supabase
        .from('webandsystem_list')
        .select('website_name')
        .eq('id', row.website_profile_id)
        .maybeSingle();
      websiteName = (website as { website_name?: string } | null)?.website_name || null;
    }

    const series = fillSeries(from, to, (dailyRes.data || []) as DailyRow[]);
    const previousSeries = fillSeries(prev.from, prev.to, (prevRes.data || []) as DailyRow[]);
    const totals = sumSeries(series);
    const previousTotals = previousSeries.length ? sumSeries(previousSeries) : emptyGa4Totals();

    const channelMap = new Map<string, Ga4ChannelPoint>();
    for (const raw of (channelRes.data || []) as ChannelRow[]) {
      const channel = raw.channel || '(not set)';
      const prevCh = channelMap.get(channel) || { channel, sessions: 0, users: 0, pageviews: 0 };
      prevCh.sessions += Number(raw.sessions) || 0;
      prevCh.users += Number(raw.users) || 0;
      prevCh.pageviews += Number(raw.pageviews) || 0;
      channelMap.set(channel, prevCh);
    }

    setDetail({
      property: mapProperty(row, websiteName, totals),
      series,
      previousSeries,
      channels: [...channelMap.values()].sort((a, b) => b.sessions - a.sessions),
      totals,
      previousTotals,
    });
    setError(dailyRes.error?.message || prevRes.error?.message || channelRes.error?.message || null);
    setLoading(false);
  }, [propertyId, from, to, session?.user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { detail, loading, error, refresh };
}
