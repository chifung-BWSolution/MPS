import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { QUERY_CACHE_KEYS, cachedQuery, invalidateCachedQuery, isAbortError, peekCachedQuery } from '@/lib/queryCache';
import type { WorkCategoryConfig, CategoryRelationType, ProjectModuleGroup } from '@/components/day-report/WorkCategoriesManager';
import { categoryConfig } from '@/data/dayReportDataV2';

const defaultRelation: Record<string, CategoryRelationType> = {
  website_design: 'webandsystem',
  website_dev: 'webandsystem',
  article_writing: 'webandsystem',
  video_shooting: 'vchannel',
  video_editing: 'vchannel',
  social_media: 'vchannel',
  edm: 'webandsystem',
  paid_ads: 'webandsystem',
  seo: 'webandsystem',
  graphic_design: 'webandsystem',
  client_meeting: 'quotation_client',
  internal_meeting: 'optional',
  training: 'none',
};

const defaultModules: Record<string, ProjectModuleGroup[]> = {
  website_design: ['website_system'],
  website_dev: ['website_system'],
  article_writing: ['marketing', 'website_system'],
  video_shooting: ['video_production'],
  video_editing: ['video_production'],
  social_media: ['marketing'],
  edm: ['marketing'],
  paid_ads: ['marketing'],
  seo: ['website_system', 'marketing'],
  graphic_design: ['marketing', 'website_system'],
  client_meeting: ['website_system', 'marketing', 'video_production'],
  internal_meeting: [],
  training: [],
};

const staticTypes: WorkCategoryConfig[] = Object.entries(categoryConfig).map(
  ([id, cfg], index) => ({
    id,
    category: id,
    label: cfg.label,
    icon: cfg.icon,
    color: cfg.color,
    bg: cfg.bg,
    relationType: defaultRelation[id] ?? 'none',
    description: cfg.label,
    isActive: true,
    sortOrder: index,
    associatedModules: defaultModules[id] ?? [],
  })
);

type DbRow = {
  id: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  relation_type: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  associated_modules: string[];
};

const validRelationTypes = new Set<CategoryRelationType>([
  'webandsystem',
  'quotation_client',
  'vchannel',
  'optional',
  'none',
]);
const validModuleGroups = new Set<ProjectModuleGroup>(['website_system', 'marketing', 'video_production', 'talent']);

function mapRow(row: DbRow): WorkCategoryConfig {
  const relationType = validRelationTypes.has(row.relation_type as CategoryRelationType)
    ? (row.relation_type as CategoryRelationType)
    : 'none';
  const associatedModules = (row.associated_modules || []).filter(
    (m): m is ProjectModuleGroup => validModuleGroups.has(m as ProjectModuleGroup)
  );

  return {
    id: row.id,
    category: row.id,
    label: row.label,
    icon: row.icon,
    color: row.color,
    bg: row.bg,
    relationType,
    description: row.description,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    associatedModules,
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
        if (cancelled || isAbortError(err)) return;
        setTypes(staticTypes);
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
      relation_type: item.relationType,
      description: item.description,
      is_active: item.isActive,
      sort_order: item.sortOrder,
      associated_modules: item.associatedModules,
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
    if (updates.relationType !== undefined) row.relation_type = updates.relationType;
    if (updates.description !== undefined) row.description = updates.description;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;
    if (updates.associatedModules !== undefined) row.associated_modules = updates.associatedModules;

    const { error } = await supabase.from('day_report_type').update(row).eq('id', id);
    if (!error) {
      invalidateCachedQuery(QUERY_CACHE_KEYS.dayReportTypes);
      setTypes(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
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
