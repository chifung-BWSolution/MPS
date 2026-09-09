import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { QUERY_CACHE_KEYS, cachedQuery, invalidateCachedQuery, isAbortError, peekCachedQuery } from '@/lib/queryCache';

export type OptionCategory = 'platform';

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

async function fetchSystemOptions(): Promise<SystemOption[]> {
  const { data, error } = await supabase
    .from('system_options')
    .select('*')
    .eq('category', 'platform')
    .order('sort_order');
  if (error) throw error;
  return ((data as DbRow[]) ?? []).map(mapRow);
}

export function useSystemOptions() {
  const cached = peekCachedQuery<SystemOption[]>(QUERY_CACHE_KEYS.systemOptions);
  const [options, setOptions] = useState<SystemOption[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (force) invalidateCachedQuery(QUERY_CACHE_KEYS.systemOptions);
    try {
      const rows = await cachedQuery(QUERY_CACHE_KEYS.systemOptions, fetchSystemOptions);
      setOptions(rows);
    } catch (err) {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
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
      invalidateCachedQuery(QUERY_CACHE_KEYS.systemOptions);
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
      invalidateCachedQuery(QUERY_CACHE_KEYS.systemOptions);
      setOptions(prev => prev.map(o => o.id === id ? { ...o, value: trimmed } : o));
    }
    return error;
  }, []);

  const deleteOption = useCallback(async (id: string) => {
    const { error } = await supabase.from('system_options').delete().eq('id', id);
    if (!error) {
      invalidateCachedQuery(QUERY_CACHE_KEYS.systemOptions);
      setOptions(prev => prev.filter(o => o.id !== id));
    }
    return error;
  }, []);

  return { options, byCategory, loading, error, addOption, updateOption, deleteOption, refresh };
}
