import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { invokeGscSync } from '@/lib/gscApi';
import { aggregateGscMetricsToKeywordRows } from '@/lib/gscKeywords';
import type { GscSyncRunRow, SeoKeywordRow } from '@/types/seo';

type MetricRow = {
  site_url: string;
  query: string;
  metric_date: string;
  impressions: number | string;
  position: number | string;
  last_synced_at: string | null;
};

const PAGE_SIZE = 1000;

const SEO_KEYWORD_COLUMNS =
  'id, website_profile_id, keyword, normalized_keyword, level, search_volume, current_ranking, target_ranking, target_page, difficulty_score, status, ai_generated, source, gsc_site_url, last_gsc_sync_at';

export type WebsiteGscSite = {
  site_url: string;
  matched_domain: string | null;
  last_synced_at: string | null;
  permission_level: string | null;
};

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: string | null }> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: rows, error: error.message };
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
    offset += PAGE_SIZE;
  }
}

type KeywordDbRow = {
  id: string;
  website_profile_id: string;
  keyword: string;
  normalized_keyword: string;
  level: SeoKeywordRow['level'];
  search_volume: number | null;
  current_ranking: number | string | null;
  target_ranking: number | null;
  target_page: string | null;
  difficulty_score: number | null;
  status: SeoKeywordRow['status'];
  ai_generated: boolean;
  source: SeoKeywordRow['source'];
  gsc_site_url: string | null;
  last_gsc_sync_at: string | null;
};

function mapKeyword(row: KeywordDbRow): SeoKeywordRow {
  return {
    id: row.id,
    website_profile_id: row.website_profile_id,
    keyword: row.keyword,
    normalized_keyword: row.normalized_keyword,
    level: row.level,
    search_volume: row.search_volume,
    current_ranking: row.current_ranking == null ? null : Number(row.current_ranking),
    target_ranking: row.target_ranking,
    target_page: row.target_page,
    difficulty_score: row.difficulty_score,
    status: row.status,
    ai_generated: row.ai_generated,
    source: row.source,
    gsc_site_url: row.gsc_site_url,
    last_gsc_sync_at: row.last_gsc_sync_at,
  };
}

export type AddSeoKeywordInput = {
  website_profile_id: string;
  keyword: string;
  level?: SeoKeywordRow['level'];
  status?: SeoKeywordRow['status'];
  search_volume?: number | null;
  current_ranking?: number | null;
  target_ranking?: number | null;
  target_page?: string | null;
  difficulty_score?: number | null;
  ai_generated?: boolean;
  source?: SeoKeywordRow['source'];
};

export function useSeoKeywords(websiteProfileId: string) {
  const websiteId = websiteProfileId.trim();
  const [keywords, setKeywords] = useState<SeoKeywordRow[]>([]);
  const [gscSites, setGscSites] = useState<WebsiteGscSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncRun, setLastSyncRun] = useState<GscSyncRunRow | null>(null);

  const refresh = useCallback(async () => {
    if (!websiteId) {
      setKeywords([]);
      setGscSites([]);
      setLastSyncRun(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
    const [kwRes, gscRes, syncRes] = await Promise.all([
      fetchAllPages<KeywordDbRow>((from, to) =>
        supabase
          .from('seo_keywords')
          .select(SEO_KEYWORD_COLUMNS)
          .eq('website_profile_id', websiteId)
          .order('keyword', { ascending: true })
          .range(from, to),
      ),
      supabase
        .from('gsc_sites')
        .select('site_url, matched_domain, last_synced_at, permission_level')
        .eq('website_profile_id', websiteId),
      supabase
        .from('gsc_sync_runs')
        .select(
          'id, started_at, finished_at, status, sites_synced, rows_upserted, keywords_upserted, error_message',
        )
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const errors = [kwRes.error, gscRes.error?.message].filter(Boolean);
    const sites = (gscRes.data as WebsiteGscSite[] | null) ?? [];
    let keywords = kwRes.data.map(mapKeyword);
    if (keywords.length === 0 && sites.length > 0) {
      const siteUrls = sites.map((row) => row.site_url).filter(Boolean);
      const metricsRes = await fetchAllPages<MetricRow>((from, to) =>
        supabase
          .from('gsc_query_daily_metrics')
          .select('site_url,query,metric_date,impressions,position,last_synced_at')
          .in('site_url', siteUrls)
          .range(from, to),
      );
      if (metricsRes.error) errors.push(metricsRes.error);
      else keywords = aggregateGscMetricsToKeywordRows(websiteId, metricsRes.data);
    }
    setError(errors.join(' ') || null);
    setKeywords(keywords);
    setGscSites(sites);

    if (syncRes.data) {
      const s = syncRes.data as GscSyncRunRow;
      setLastSyncRun({
        id: s.id,
        started_at: s.started_at,
        finished_at: s.finished_at,
        status: s.status,
        sites_synced: Number(s.sites_synced) || 0,
        rows_upserted: Number(s.rows_upserted) || 0,
        keywords_upserted: Number(s.keywords_upserted) || 0,
        error_message: s.error_message,
      });
    } else {
      setLastSyncRun(null);
    }

    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setKeywords([]);
      setGscSites([]);
    } finally {
      setLoading(false);
    }
  }, [websiteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncGsc = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const json = await invokeGscSync();
      await refresh();
      return {
        ok: true as const,
        durationMs: json.duration_ms,
        sitesSynced: json.sites_synced,
        rowsUpserted: json.rows_upserted,
        keywordsUpserted: json.keywords_upserted,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const addKeyword = useCallback(async (input: AddSeoKeywordInput) => {
    const trimmed = input.keyword.trim();
    if (!trimmed || !input.website_profile_id) {
      return { data: null, error: { message: '網站與關鍵字為必填' } };
    }
    const normalized = trimmed.toLowerCase();
    const row = {
      website_profile_id: input.website_profile_id,
      keyword: trimmed,
      normalized_keyword: normalized,
      level: input.level ?? 'level_3',
      status: input.status ?? 'monitoring',
      search_volume: input.search_volume ?? null,
      current_ranking: input.current_ranking ?? null,
      target_ranking: input.target_ranking ?? null,
      target_page: input.target_page ?? null,
      difficulty_score: input.difficulty_score ?? null,
      ai_generated: input.ai_generated ?? false,
      source: input.source ?? 'manual',
    };
    const { data, error: err } = await supabase
      .from('seo_keywords')
      .insert(row)
      .select(SEO_KEYWORD_COLUMNS)
      .single();
    if (!err && data) {
      const mapped = mapKeyword(data as KeywordDbRow);
      setKeywords((prev) => [...prev, mapped].sort((a, b) => a.keyword.localeCompare(b.keyword)));
      return { data: mapped, error: null };
    }
    return { data: null, error: err };
  }, []);

  const deleteKeyword = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('seo_keywords').delete().eq('id', id);
    if (!err) setKeywords((prev) => prev.filter((k) => k.id !== id));
    return err;
  }, []);

  return {
    keywords,
    gscSites,
    loading,
    error,
    refresh,
    syncGsc,
    syncing,
    lastSyncRun,
    addKeyword,
    deleteKeyword,
  };
}
