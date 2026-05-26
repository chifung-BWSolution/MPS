import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { WorkCategoryConfig, CategoryRelationType, ProjectModuleGroup } from '@/components/day-report/WorkCategoriesManager';

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

function mapRow(row: DbRow): WorkCategoryConfig {
  return {
    id: row.id,
    category: row.id,
    label: row.label,
    icon: row.icon,
    color: row.color,
    bg: row.bg,
    relationType: row.relation_type as CategoryRelationType,
    description: row.description,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    associatedModules: (row.associated_modules || []) as ProjectModuleGroup[],
  };
}

export function useDayReportTypes() {
  const [types, setTypes] = useState<WorkCategoryConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('day_report_type')
      .select('*')
      .order('sort_order')
      .then(({ data, error }) => {
        if (!error && data) setTypes((data as DbRow[]).map(mapRow));
        setLoading(false);
      });
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
