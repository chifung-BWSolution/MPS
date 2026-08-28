import { supabase } from '@/lib/supabase';

/** staffs.id values that have a public.users row (login allowlist). */
export async function fetchUserStaffIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('users')
    .select('staff_id');

  if (error) {
    console.error('[userStaffLookup] fetchUserStaffIds error:', error);
    return [];
  }

  return [...new Set((data || []).map((row) => (row.staff_id || '').trim()).filter(Boolean))];
}

export function filterStaffInUsers<T extends { id: string }>(
  staff: T[],
  userStaffIds: Iterable<string>,
): T[] {
  const allowed = userStaffIds instanceof Set ? userStaffIds : new Set(userStaffIds);
  return staff.filter((s) => !!s.id && allowed.has(s.id));
}
