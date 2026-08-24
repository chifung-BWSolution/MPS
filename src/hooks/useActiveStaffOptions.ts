import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SearchableSelectOption } from '@/components/ui/searchable-select';

export type StaffSelectOption = SearchableSelectOption & {
  status: string;
};

export function useActiveStaffOptions(includeIds: Array<string | undefined | null> = []) {
  const [options, setOptions] = useState<StaffSelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const extraKey = useMemo(
    () =>
      includeIds
        .map((id) => (id || '').trim())
        .filter(Boolean)
        .sort()
        .join(','),
    [includeIds],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('staffs')
        .select('id, display_name, work_email, status')
        .order('display_name', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('[useActiveStaffOptions] failed:', error.message);
        setOptions([]);
      } else {
        const extras = new Set(extraKey.split(',').filter(Boolean));
        setOptions(
          (data || [])
            .filter((row) => {
              const status = (row.status || '').toLowerCase();
              return status === 'active' || extras.has(row.id);
            })
            .map((row) => ({
              value: row.id,
              label: (row.display_name || '').trim() || '—',
              keywords: row.work_email || '',
              status: row.status || '',
            })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [extraKey]);

  return { options, loading };
}
