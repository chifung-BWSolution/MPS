import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { WorkCategoryConfig, CategoryRelationType, ProjectModuleGroup } from '@/components/day-report/WorkCategoriesManager';
import { useAuth } from '@/context/AuthContext';
import { categoryConfig } from '@/data/dayReportDataV2';

const defaultRelation: Record<string, CategoryRelationType> = {
  website_design: 'project_website',
  website_dev: 'project_website',
  article_writing: 'project_website',
  video_shooting: 'project_website',
  video_editing: 'project_website',
  social_media: 'project_website',
  edm: 'project_website',
  paid_ads: 'project_website',
  seo: 'project_website',
  graphic_design: 'project_website',
  client_meeting: 'project_website',
  internal_meeting: 'internal_project',
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

const validRelationTypes = new Set<CategoryRelationType>(['project_website', 'internal_project', 'none']);
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

export function useDayReportTypes() {
  const { session } = useAuth();
  const [types, setTypes] = useState<WorkCategoryConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('day_report_type')
      .select('*')
      .order('sort_order')
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) {
          setTypes(staticTypes);
        } else {
          setTypes((data as DbRow[]).map(mapRow));
        }
        setLoading(false);
      });
  }, [session]);

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
    if (!error) setTypes(prev => [...prev, item]);
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
    if (!error) setTypes(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    return error;
  }, []);

  const deleteType = useCallback(async (id: string) => {
    const { error } = await supabase.from('day_report_type').delete().eq('id', id);
    if (!error) setTypes(prev => prev.filter(t => t.id !== id));
    return error;
  }, []);

  return { types, loading, addType, updateType, deleteType };
}
