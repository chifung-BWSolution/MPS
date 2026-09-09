import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { QUERY_CACHE_KEYS, cachedQuery, isAbortError, peekCachedQuery } from '@/lib/queryCache';

async function fetchStaffNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('staffs')
    .select('display_name')
    .order('display_name', { ascending: true });
  if (error) throw error;
  return Array.from(
    new Set(
      (data || [])
        .map((r) => (r.display_name || '').trim())
        .filter(Boolean),
    ),
  );
}

export function useStaffNames() {
  const cached = peekCachedQuery<string[]>(QUERY_CACHE_KEYS.staffNames);
  const [names, setNames] = useState<string[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    void cachedQuery(QUERY_CACHE_KEYS.staffNames, fetchStaffNames)
      .then((list) => {
        if (cancelled) return;
        setNames(list);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        if (!isAbortError(err)) {
          console.warn('[useStaffNames] failed:', err.message);
          setNames([]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { names, loading };
}
