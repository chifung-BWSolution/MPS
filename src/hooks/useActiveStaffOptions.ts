import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SearchableSelectOption } from '@/components/ui/searchable-select';
import { QUERY_CACHE_KEYS, cachedQuery, isAbortError, peekCachedQuery } from '@/lib/queryCache';

export type StaffSelectOption = SearchableSelectOption & {
  status: string;
};

type StaffOptionRow = StaffSelectOption;

async function fetchStaffOptions(): Promise<StaffOptionRow[]> {
  const { data, error } = await supabase
    .from('staffs')
    .select('id, display_name, work_email, status')
    .order('display_name', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    value: row.id,
    label: (row.display_name || '').trim() || '—',
    keywords: row.work_email || '',
    status: row.status || '',
  }));
}

export function useActiveStaffOptions(includeIds: Array<string | undefined | null> = []) {
  const extras = useMemo(
    () =>
      includeIds
        .map((id) => (id || '').trim())
        .filter(Boolean)
        .sort(),
    [includeIds],
  );
  const cached = peekCachedQuery<StaffOptionRow[]>(QUERY_CACHE_KEYS.staffOptions);
  const [allOptions, setAllOptions] = useState<StaffOptionRow[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    void cachedQuery(QUERY_CACHE_KEYS.staffOptions, fetchStaffOptions)
      .then((rows) => {
        if (cancelled) return;
        setAllOptions(rows);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        if (!isAbortError(err)) {
          console.warn('[useActiveStaffOptions] failed:', err.message);
          setAllOptions([]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    const extraSet = new Set(extras);
    return allOptions.filter((row) => {
      const status = (row.status || '').toLowerCase();
      return status === 'active' || extraSet.has(row.value);
    });
  }, [allOptions, extras]);

  return { options, loading };
}
