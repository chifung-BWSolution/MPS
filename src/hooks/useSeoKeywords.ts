import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { invokeGscSync } from '@/lib/gscApi';
import type { GscSyncRunRow, SeoKeywordRow, SeoRankingHistoryRow } from '@/types/seo';

type WebsiteJoin = {
  website_name: string | null;
  company: string | null;
  brand: string | null;
};

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
  webandsystem_list?: WebsiteJoin | WebsiteJoin[] | null;
};

function pickWebsite(join: KeywordDbRow['webandsystem_list']): WebsiteJoin | null {
  if (!join) return null;
  return Array.isArray(join) ? join[0] ?? null : join;
}

function mapKeyword(row: KeywordDbRow): SeoKeywordRow {
  const ws = pickWebsite(row.webandsystem_list);
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
    websiteName: ws?.website_name ?? undefined,
    company: ws?.company ?? undefined,
    brand: ws?.brand ?? undefined,
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

export function useSeoKeywords() {
  const { session } = useAuth();
  const [keywords, setKeywords] = useState<SeoKeywordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncRun, setLastSyncRun] = useState<GscSyncRunRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [kwRes, syncRes] = await Promise.all([
      supabase
        .from('seo_keywords')
        .select(
          'id, website_profile_id, keyword, normalized_keyword, level, search_volume, current_ranking, target_ranking, target_page, difficulty_score, status, ai_generated, source, gsc_site_url, last_gsc_sync_at, webandsystem_list(website_name, company, brand)',
        )
        .order('keyword', { ascending: true }),
      supabase
        .from('gsc_sync_runs')
        .select(
          'id, started_at, finished_at, status, sites_synced, rows_upserted, keywords_upserted, error_message',
        )
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (kwRes.error) {
      setError(kwRes.error.message);
      setKeywords([]);
    } else {
      setError(null);
      setKeywords((kwRes.data as KeywordDbRow[] | null)?.map(mapKeyword) ?? []);
    }

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

    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

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
      .select(
        'id, website_profile_id, keyword, normalized_keyword, level, search_volume, current_ranking, target_ranking, target_page, difficulty_score, status, ai_generated, source, gsc_site_url, last_gsc_sync_at, webandsystem_list(website_name, company, brand)',
      )
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

  const fetchRankingHistory = useCallback(async (keywordId: string): Promise<SeoRankingHistoryRow[]> => {
    const { data, error: err } = await supabase
      .from('seo_ranking_history')
      .select('id, keyword_id, metric_date, ranking_position, clicks, impressions, ctr, source')
      .eq('keyword_id', keywordId)
      .order('metric_date', { ascending: true });
    if (err) return [];
    return ((data as SeoRankingHistoryRow[] | null) ?? []).map((r) => ({
      ...r,
      ranking_position: r.ranking_position == null ? null : Number(r.ranking_position),
      clicks: Number(r.clicks) || 0,
      impressions: Number(r.impressions) || 0,
      ctr: r.ctr == null ? null : Number(r.ctr),
    }));
  }, []);

  return {
    keywords,
    loading,
    error,
    refresh,
    syncGsc,
    syncing,
    lastSyncRun,
    addKeyword,
    deleteKeyword,
    fetchRankingHistory,
  };
}
