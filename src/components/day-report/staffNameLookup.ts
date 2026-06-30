import { supabase } from '@/lib/supabase';

/** Resolve display names: staff_directory first, then user_info fallback. */
export async function fetchStaffNameMap(staffIds: string[]): Promise<Record<string, string>> {
  const nameMap: Record<string, string> = {};
  const unique = [...new Set(staffIds.filter(Boolean))];
  if (unique.length === 0) return nameMap;

  const [{ data: sdRows }, { data: uiRows }] = await Promise.all([
    supabase
      .from('staff_directory')
      .select('bubble_staff_id, display_name')
      .in('bubble_staff_id', unique),
    supabase
      .from('user_info')
      .select('staff_id, display_name')
      .in('staff_id', unique),
  ]);

  (sdRows || []).forEach((r) => {
    const name = (r.display_name || '').trim();
    if (r.bubble_staff_id && name) nameMap[r.bubble_staff_id] = name;
  });

  (uiRows || []).forEach((r) => {
    const name = (r.display_name || '').trim();
    if (r.staff_id && name && !nameMap[r.staff_id]) {
      nameMap[r.staff_id] = name;
    }
  });

  return nameMap;
}
