import { supabase } from '@/lib/supabase';

/** Resolve display names keyed by staffs.id (uuid). */
export async function fetchStaffNameMap(staffIds: string[]): Promise<Record<string, string>> {
  const nameMap: Record<string, string> = {};
  const unique = [...new Set(staffIds.filter(Boolean))];
  if (unique.length === 0) return nameMap;

  const [{ data: sdRows }, { data: uiRows }] = await Promise.all([
    supabase
      .from('staffs')
      .select('id, display_name')
      .in('id', unique),
    supabase
      .from('users')
      .select('staff_id, display_name')
      .in('staff_id', unique),
  ]);

  (sdRows || []).forEach((r) => {
    const name = (r.display_name || '').trim();
    if (r.id && name) nameMap[r.id] = name;
  });

  (uiRows || []).forEach((r) => {
    const name = (r.display_name || '').trim();
    if (r.staff_id && name && !nameMap[r.staff_id]) {
      nameMap[r.staff_id] = name;
    }
  });

  return nameMap;
}
