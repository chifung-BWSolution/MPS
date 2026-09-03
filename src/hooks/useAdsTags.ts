import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AdsCampaignTagAssignment, AdsPlatform, AdsTag } from '@/types/adsTags';

type TagRow = {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AssignmentRow = {
  tag_id: string;
  platform: AdsPlatform;
  campaign_row_id: string;
};

function mapTag(row: TagRow): AdsTag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssignment(row: AssignmentRow): AdsCampaignTagAssignment {
  return {
    tagId: row.tag_id,
    platform: row.platform,
    campaignRowId: row.campaign_row_id,
  };
}

export function useAdsTags() {
  const [tags, setTags] = useState<AdsTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('ads_tags')
      .select('id, name, color, sort_order, is_active, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setTags([]);
      setLoading(false);
      return;
    }

    setError(null);
    setTags(((data as TagRow[] | null) ?? []).map(mapTag));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addTag = useCallback(
    async (input: { name: string; color?: string | null; isActive?: boolean }) => {
      const name = input.name.trim();
      if (!name) return { ok: false as const, error: '請輸入標籤名稱' };

      const nextSort =
        tags.reduce((max, tag) => Math.max(max, tag.sortOrder), -1) + 1;
      const { data, error: insertError } = await supabase
        .from('ads_tags')
        .insert({
          name,
          color: input.color ?? null,
          sort_order: nextSort,
          is_active: input.isActive ?? true,
        })
        .select('id, name, color, sort_order, is_active, created_at, updated_at')
        .single();

      if (insertError) return { ok: false as const, error: insertError.message };
      if (data) setTags((prev) => [...prev, mapTag(data as TagRow)]);
      return { ok: true as const };
    },
    [tags],
  );

  const updateTag = useCallback(async (id: string, updates: Partial<AdsTag>) => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) row.name = updates.name.trim();
    if (updates.color !== undefined) row.color = updates.color;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;

    const { error: updateError } = await supabase.from('ads_tags').update(row).eq('id', id);
    if (updateError) return { ok: false as const, error: updateError.message };
    setTags((prev) =>
      prev.map((tag) => (tag.id === id ? { ...tag, ...updates, name: updates.name?.trim() ?? tag.name } : tag)),
    );
    return { ok: true as const };
  }, []);

  const deleteTag = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from('ads_tags').delete().eq('id', id);
    if (deleteError) return { ok: false as const, error: deleteError.message };
    setTags((prev) => prev.filter((tag) => tag.id !== id));
    return { ok: true as const };
  }, []);

  return { tags, loading, error, refresh, addTag, updateTag, deleteTag };
}

export function useAdsCampaignTags(platform: AdsPlatform) {
  const [tags, setTags] = useState<AdsTag[]>([]);
  const [assignments, setAssignments] = useState<AdsCampaignTagAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [tagRes, assignRes] = await Promise.all([
      supabase
        .from('ads_tags')
        .select('id, name, color, sort_order, is_active, created_at, updated_at')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('ads_campaign_tags')
        .select('tag_id, platform, campaign_row_id')
        .eq('platform', platform),
    ]);

    if (tagRes.error || assignRes.error) {
      setError(tagRes.error?.message || assignRes.error?.message || 'Load failed');
      setTags([]);
      setAssignments([]);
      setLoading(false);
      return;
    }

    setError(null);
    setTags(((tagRes.data as TagRow[] | null) ?? []).map(mapTag));
    setAssignments(((assignRes.data as AssignmentRow[] | null) ?? []).map(mapAssignment));
    setLoading(false);
  }, [platform]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tagsByCampaignId = useMemo(() => {
    const tagById = new Map(tags.map((tag) => [tag.id, tag]));
    const map = new Map<string, AdsTag[]>();
    for (const assignment of assignments) {
      const tag = tagById.get(assignment.tagId);
      if (!tag) continue;
      const list = map.get(assignment.campaignRowId) ?? [];
      list.push(tag);
      map.set(assignment.campaignRowId, list);
    }
    return map;
  }, [tags, assignments]);

  const setCampaignTags = useCallback(
    async (campaignRowId: string, tagIds: string[]) => {
      const uniqueIds = [...new Set(tagIds)];
      const currentIds = assignments
        .filter((row) => row.campaignRowId === campaignRowId)
        .map((row) => row.tagId);
      const currentSet = new Set(currentIds);
      const nextSet = new Set(uniqueIds);
      const toAdd = uniqueIds.filter((id) => !currentSet.has(id));
      const toRemove = currentIds.filter((id) => !nextSet.has(id));

      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('ads_campaign_tags')
          .delete()
          .eq('platform', platform)
          .eq('campaign_row_id', campaignRowId)
          .in('tag_id', toRemove);
        if (deleteError) return { ok: false as const, error: deleteError.message };
      }

      if (toAdd.length > 0) {
        const { error: insertError } = await supabase.from('ads_campaign_tags').insert(
          toAdd.map((tagId) => ({
            tag_id: tagId,
            platform,
            campaign_row_id: campaignRowId,
          })),
        );
        if (insertError) return { ok: false as const, error: insertError.message };
      }

      setAssignments((prev) => [
        ...prev.filter((row) => row.campaignRowId !== campaignRowId),
        ...uniqueIds.map((tagId) => ({
          tagId,
          platform,
          campaignRowId,
        })),
      ]);
      return { ok: true as const };
    },
    [platform, assignments],
  );

  return {
    tags,
    assignments,
    tagsByCampaignId,
    loading,
    error,
    refresh,
    setCampaignTags,
  };
}
