import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { QUERY_CACHE_KEYS, cachedQuery, isAbortError, peekCachedQuery } from '@/lib/queryCache';
import { toIsoDate } from '@/lib/ga4Traffic';
import {
  buildWebsiteTrafficSummaries,
  ga4WebsiteTrafficWindows,
  type Ga4DailyUserRow,
  type Ga4PropertyLink,
  type Ga4WebsiteExplicitProperty,
  type Ga4WebsiteTrafficSummary,
} from '@/lib/ga4WebsiteListTraffic';

const PAGE_SIZE = 1000;

type PropertyRow = {
  property_id: string;
  website_profile_id: string | null;
};

type WebsiteRow = {
  id: string;
  ga4_property_id: string | null;
};

type DailyRow = {
  property_id: string;
  metric_date: string;
  users: number | string;
};

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function fetchWebsiteTrafficSummaries(): Promise<Map<string, Ga4WebsiteTrafficSummary>> {
  const endDate = toIsoDate(new Date());
  const windows = ga4WebsiteTrafficWindows(endDate);

  const [properties, websites, dailyRows] = await Promise.all([
    fetchAllPages<PropertyRow>((from, to) =>
      supabase
        .from('ga4_properties')
        .select('property_id,website_profile_id')
        .range(from, to),
    ),
    fetchAllPages<WebsiteRow>((from, to) =>
      supabase
        .from('webandsystem_list')
        .select('id,ga4_property_id')
        .not('ga4_property_id', 'is', null)
        .range(from, to),
    ),
    fetchAllPages<DailyRow>((from, to) =>
      supabase
        .from('ga4_property_daily_metrics')
        .select('property_id,metric_date,users')
        .gte('metric_date', windows.previousFrom)
        .lte('metric_date', windows.currentTo)
        .order('metric_date', { ascending: true })
        .range(from, to),
    ),
  ]);

  return buildWebsiteTrafficSummaries(
    windows,
    properties.map((row): Ga4PropertyLink => ({
      propertyId: row.property_id,
      websiteProfileId: row.website_profile_id,
    })),
    websites.map((row): Ga4WebsiteExplicitProperty => ({
      websiteId: row.id,
      propertyId: row.ga4_property_id,
    })),
    dailyRows.map((row): Ga4DailyUserRow => ({
      propertyId: row.property_id,
      date: row.metric_date,
      users: Number(row.users) || 0,
    })),
  );
}

export function useGa4WebsiteListTraffic() {
  const cached = peekCachedQuery<Map<string, Ga4WebsiteTrafficSummary>>(
    QUERY_CACHE_KEYS.ga4WebsiteListTraffic,
  );
  const [byWebsiteId, setByWebsiteId] = useState<Map<string, Ga4WebsiteTrafficSummary>>(
    cached ?? new Map(),
  );
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await cachedQuery(
        QUERY_CACHE_KEYS.ga4WebsiteListTraffic,
        fetchWebsiteTrafficSummaries,
        60_000,
      );
      setByWebsiteId(next);
      setError(null);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { byWebsiteId, loading, error, refresh };
}
