import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { SeoKeyword } from '@/types/app';

type DbRow = {
  id: string;
  website_profile_id: string;
  keyword: string;
  level: string;
  search_volume: number | null;
  current_ranking: number | null;
  target_ranking: number | null;
  target_page: string | null;
  difficulty_score: number | null;
  assigned_article_id: string | null;
  status: string;
  ai_generated: boolean | null;
};

function mapRow(row: DbRow): SeoKeyword {
  return {
    id: row.id,
    websiteProfileId: row.website_profile_id,
    keyword: row.keyword ?? '',
    level: (row.level as SeoKeyword['level']) || 'level_1',
    searchVolume: row.search_volume ?? undefined,
    currentRanking: row.current_ranking ?? undefined,
    targetRanking: row.target_ranking ?? undefined,
    targetPage: row.target_page ?? undefined,
    difficultyScore: row.difficulty_score ?? undefined,
    assignedArticleId: row.assigned_article_id ?? undefined,
    status: (row.status as SeoKeyword['status']) || 'monitoring',
    aiGenerated: !!row.ai_generated,
  };
}

function toInsertRow(kw: SeoKeyword) {
  return {
    id: kw.id,
    website_profile_id: kw.websiteProfileId,
    keyword: kw.keyword,
    level: kw.level,
    search_volume: kw.searchVolume ?? null,
    current_ranking: kw.currentRanking ?? null,
    target_ranking: kw.targetRanking ?? null,
    target_page: kw.targetPage ?? null,
    difficulty_score: kw.difficultyScore ?? null,
    assigned_article_id: kw.assignedArticleId ?? null,
    status: kw.status,
    ai_generated: kw.aiGenerated,
  };
}

export function useSeoKeywords() {
  const { session } = useAuth();
  const [keywords, setKeywords] = useState<SeoKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('seo_keywords')
      .select('*')
      .order('keyword', { ascending: true });
    if (err) {
      setError(err.message);
      setKeywords([]);
    } else {
      setError(null);
      setKeywords((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addKeyword = useCallback(async (data: Omit<SeoKeyword, 'id'> & { id?: string }) => {
    const id = data.id || `sk_${Date.now()}`;
    const record: SeoKeyword = { ...data, id };
    const { error: err } = await supabase.from('seo_keywords').insert(toInsertRow(record));
    if (!err) setKeywords(prev => [record, ...prev]);
    return { data: err ? null : record, error: err };
  }, []);

  const updateKeyword = useCallback(async (id: string, data: Partial<SeoKeyword>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.websiteProfileId !== undefined) patch.website_profile_id = data.websiteProfileId;
    if (data.keyword !== undefined) patch.keyword = data.keyword;
    if (data.level !== undefined) patch.level = data.level;
    if (data.searchVolume !== undefined) patch.search_volume = data.searchVolume ?? null;
    if (data.currentRanking !== undefined) patch.current_ranking = data.currentRanking ?? null;
    if (data.targetRanking !== undefined) patch.target_ranking = data.targetRanking ?? null;
    if (data.targetPage !== undefined) patch.target_page = data.targetPage ?? null;
    if (data.difficultyScore !== undefined) patch.difficulty_score = data.difficultyScore ?? null;
    if (data.assignedArticleId !== undefined) patch.assigned_article_id = data.assignedArticleId ?? null;
    if (data.status !== undefined) patch.status = data.status;
    if (data.aiGenerated !== undefined) patch.ai_generated = data.aiGenerated;
    const { error: err } = await supabase.from('seo_keywords').update(patch).eq('id', id);
    if (!err) setKeywords(prev => prev.map(k => (k.id === id ? { ...k, ...data } : k)));
    return err;
  }, []);

  const deleteKeyword = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('seo_keywords').delete().eq('id', id);
    if (!err) setKeywords(prev => prev.filter(k => k.id !== id));
    return err;
  }, []);

  return { keywords, loading, error, refresh, addKeyword, updateKeyword, deleteKeyword };
}
