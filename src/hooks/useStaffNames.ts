import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useStaffNames() {
  const [names, setNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('display_name, system_status')
        .order('display_name', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('[useStaffNames] failed:', error.message);
        setNames([]);
      } else {
        const list = (data || [])
          .map(r => (r.display_name || '').trim())
          .filter(Boolean);
        setNames(Array.from(new Set(list)));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { names, loading };
}
