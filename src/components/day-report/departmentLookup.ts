import { supabase } from '@/lib/supabase';

const EXCLUDED_DEPARTMENTS = new Set(['management', 'mgt team']);

export function isValidDepartment(dept: string | null | undefined): dept is string {
  const value = (dept || '').trim();
  return !!value && !EXCLUDED_DEPARTMENTS.has(value.toLowerCase());
}

/** Distinct department values from staffs.team_name. */
export async function fetchDistinctDepartments(): Promise<string[]> {
  const { data, error } = await supabase
    .from('staffs')
    .select('team_name')
    .not('team_name', 'is', null)
    .neq('team_name', '');

  if (error) {
    console.error('[departmentLookup] fetchDistinctDepartments error:', error);
    return [];
  }

  const set = new Set<string>();
  (data || []).forEach((row) => {
    if (isValidDepartment(row.team_name)) set.add(row.team_name.trim());
  });
  return Array.from(set).sort();
}

/** staff_id → department from staffs.team_name. */
export async function fetchDepartmentMap(staffIds?: string[]): Promise<Record<string, string>> {
  let query = supabase.from('staffs').select('id, team_name');
  if (staffIds?.length) query = query.in('id', staffIds);

  const { data, error } = await query;
  if (error) {
    console.error('[departmentLookup] fetchDepartmentMap error:', error);
    return {};
  }

  const map: Record<string, string> = {};
  (data || []).forEach((row) => {
    if (row.id && isValidDepartment(row.team_name)) {
      map[row.id] = row.team_name.trim();
    }
  });
  return map;
}

/** All staff_ids assigned to a department in staffs.team_name. */
export async function fetchStaffIdsByDepartment(department: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('staffs')
    .select('id')
    .eq('team_name', department);

  if (error) {
    console.error('[departmentLookup] fetchStaffIdsByDepartment error:', error);
    return [];
  }

  return (data || []).map((row) => row.id).filter(Boolean);
}

/** Resolve a single user's department from staffs via staff_id. */
export async function fetchDepartmentByStaffId(staffId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('staffs')
    .select('team_name')
    .eq('id', staffId)
    .maybeSingle();

  if (error) {
    console.error('[departmentLookup] fetchDepartmentByStaffId error:', error);
    return null;
  }

  return isValidDepartment(data?.team_name) ? data.team_name.trim() : null;
}
