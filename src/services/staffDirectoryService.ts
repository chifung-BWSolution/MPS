import { supabase } from '@/lib/supabase';

export type StaffDirectoryOption = {
  staffId: string;
  displayName: string;
};

export async function fetchStaffDirectoryOptions(): Promise<StaffDirectoryOption[]> {
  const { data, error } = await supabase
    .from('staffs')
    .select('id, display_name')
    .not('id', 'is', null)
    .order('display_name');

  if (error) throw error;

  return (data ?? [])
    .filter(r => r.id)
    .map(r => ({
      staffId: r.id as string,
      displayName: (r.display_name as string) || (r.id as string),
    }));
}

/** Map a stored staff key onto staffs.id. */
export function resolveStaffOptionId(
  storedId: string | null | undefined,
  staffOptions: StaffDirectoryOption[],
): string {
  if (!storedId) return '';
  if (staffOptions.some(s => s.staffId === storedId)) return storedId;
  return storedId;
}
