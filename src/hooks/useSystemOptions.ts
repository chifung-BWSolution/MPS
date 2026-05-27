import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type OptionCategory = 'platform' | 'brand_category' | 'project_type';

export interface SystemOption {
  id: string;
  category: OptionCategory;
  value: string;
  sortOrder: number;
}

type DbRow = {
  id: string;
  category: string;
  value: string;
  sort_order: number;
};

function mapRow(row: DbRow): SystemOption {
  return {
    id: row.id,
    category: row.category as OptionCategory,
    value: row.value,
    sortOrder: row.sort_order,
  };
}

export function useSystemOptions() {
  const [options, setOptions] = useState<SystemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('system_options')
      .select('*')
      .order('category')
      .order('sort_order');
    if (error) {
      setError(error.message);
    } else {
      setOptions((data as DbRow[]).map(mapRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const byCategory = useCallback(
    (category: OptionCategory) => options.filter(o => o.category === category),
    [options]
  );

  const addOption = useCallback(async (category: OptionCategory, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const sortOrder = options.filter(o => o.category === category).length;
    const { data, error } = await supabase
      .from('system_options')
      .insert({ category, value: trimmed, sort_order: sortOrder })
      .select()
      .single();
    if (!error && data) {
      setOptions(prev => [...prev, mapRow(data as DbRow)]);
    }
    return error;
  }, [options]);

  const updateOption = useCallback(async (id: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const { error } = await supabase
      .from('system_options')
      .update({ value: trimmed, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      setOptions(prev => prev.map(o => o.id === id ? { ...o, value: trimmed } : o));
    }
    return error;
  }, []);

  const deleteOption = useCallback(async (id: string) => {
    const { error } = await supabase.from('system_options').delete().eq('id', id);
    if (!error) {
      setOptions(prev => prev.filter(o => o.id !== id));
    }
    return error;
  }, []);

  return { options, byCategory, loading, error, addOption, updateOption, deleteOption, refresh };
}
