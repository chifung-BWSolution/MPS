import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { QUERY_CACHE_KEYS, cachedQuery, invalidateCachedQuery, isAbortError, peekCachedQuery } from '@/lib/queryCache';
import type { WorkCategoryConfig, LinkMode, LinkProjectType } from '@/components/day-report/WorkCategoriesManager';
import { categoryConfig } from '@/data/dayReportDataV2';

const ALL_LINK_TYPES: LinkProjectType[] = ['webandsystem', 'quotation_client', 'vchannel'];

const defaultRules: Record<string, { mode: LinkMode; types: LinkProjectType[] }> = {
  website_design: { mode: 'required', types: ['webandsystem'] },
  website_dev: { mode: 'required', types: ['webandsystem'] },
  article_writing: { mode: 'required', types: ['webandsystem'] },
  video_shooting: { mode: 'required', types: ['vchannel'] },
  video_editing: { mode: 'required', types: ['vchannel'] },
  social_media: { mode: 'required', types: ['vchannel'] },
  edm: { mode: 'required', types: ['webandsystem'] },
  paid_ads: { mode: 'required', types: ['webandsystem'] },
  seo: { mode: 'required', types: ['webandsystem'] },
  graphic_design: { mode: 'required', types: ['webandsystem'] },
  client_meeting: { mode: 'required', types: ['quotation_client'] },
  internal_meeting: { mode: 'optional', types: [...ALL_LINK_TYPES] },
  training: { mode: 'none', types: [] },
};

const staticTypes: WorkCategoryConfig[] = Object.entries(categoryConfig).map(
  ([id, cfg], index) => {
    const rule = defaultRules[id] ?? { mode: 'none' as const, types: [] };
    return {
      id,
      category: id,
      label: cfg.label,
      icon: cfg.icon,
      color: cfg.color,
      bg: cfg.bg,
      linkMode: rule.mode,
      linkTypes: rule.types,
      description: cfg.label,
      isActive: true,
      sortOrder: index,
    };
  }
);

type DbRow = {
  id: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  link_mode: string;
  link_types: string[] | null;
  description: string;
  is_active: boolean;
  sort_order: number;
};

const validModes = new Set<LinkMode>(['required', 'optional', 'none']);
const validLinkTypes = new Set<LinkProjectType>(ALL_LINK_TYPES);

function mapRow(row: DbRow): WorkCategoryConfig {
  const linkMode = validModes.has(row.link_mode as LinkMode)
    ? (row.link_mode as LinkMode)
    : 'none';
  const linkTypes = linkMode === 'none'
    ? []
    : (row.link_types || []).filter((t): t is LinkProjectType => validLinkTypes.has(t as LinkProjectType));

  return {
    id: row.id,
    category: row.id,
    label: row.label,
    icon: row.icon,
    color: row.color,
    bg: row.bg,
    linkMode,
    linkTypes,
    description: row.description,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

async function fetchDayReportTypes(): Promise<WorkCategoryConfig[]> {
  const { data, error } = await supabase
    .from('day_report_type')
    .select('*')
    .order('sort_order');
  if (error || !data || data.length === 0) return staticTypes;
  return (data as DbRow[]).map(mapRow);
}

export function useDayReportTypes() {
  const cached = peekCachedQuery<WorkCategoryConfig[]>(QUERY_CACHE_KEYS.dayReportTypes);
  const [types, setTypes] = useState<WorkCategoryConfig[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    void cachedQuery(QUERY_CACHE_KEYS.dayReportTypes, fetchDayReportTypes)
      .then((rows) => {
        if (cancelled) return;
        setTypes(rows);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        if (!isAbortError(err)) {
          setTypes(staticTypes);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addType = useCallback(async (item: WorkCategoryConfig) => {
    const row = {
      id: item.id,
      label: item.label,
      icon: item.icon,
      color: item.color,
      bg: item.bg,
      link_mode: item.linkMode,
      link_types: item.linkMode === 'none' ? [] : item.linkTypes,
      description: item.description,
      is_active: item.isActive,
      sort_order: item.sortOrder,
    };
    const { error } = await supabase.from('day_report_type').insert(row);
    if (!error) {
      invalidateCachedQuery(QUERY_CACHE_KEYS.dayReportTypes);
      setTypes(prev => [...prev, item]);
    }
    return error;
  }, []);

  const updateType = useCallback(async (id: string, updates: Partial<WorkCategoryConfig>) => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.label !== undefined) row.label = updates.label;
    if (updates.icon !== undefined) row.icon = updates.icon;
    if (updates.color !== undefined) row.color = updates.color;
    if (updates.bg !== undefined) row.bg = updates.bg;
    if (updates.linkMode !== undefined) row.link_mode = updates.linkMode;
    if (updates.linkTypes !== undefined || updates.linkMode === 'none') {
      row.link_types = updates.linkMode === 'none' ? [] : (updates.linkTypes ?? []);
    }
    if (updates.description !== undefined) row.description = updates.description;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;

    const { error } = await supabase.from('day_report_type').update(row).eq('id', id);
    if (!error) {
      invalidateCachedQuery(QUERY_CACHE_KEYS.dayReportTypes);
      setTypes(prev => prev.map(t => t.id === id ? { ...t, ...updates, ...(updates.linkMode === 'none' ? { linkTypes: [] } : {}) } : t));
    }
    return error;
  }, []);

  const deleteType = useCallback(async (id: string) => {
    const { error } = await supabase.from('day_report_type').delete().eq('id', id);
    if (!error) {
      invalidateCachedQuery(QUERY_CACHE_KEYS.dayReportTypes);
      setTypes(prev => prev.filter(t => t.id !== id));
    }
    return error;
  }, []);

  return { types, loading, addType, updateType, deleteType };
}
