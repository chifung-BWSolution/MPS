import { supabase } from '@/lib/supabase';

const EXCLUDED_DEPARTMENTS = new Set(['management']);

export function isValidDepartment(dept: string | null | undefined): dept is string {
  const value = (dept || '').trim();
  return !!value && !EXCLUDED_DEPARTMENTS.has(value.toLowerCase());
}

/** Distinct department values from user_info (canonical source). */
export async function fetchDistinctDepartments(): Promise<string[]> {
  const { data, error } = await supabase
    .from('users')
    .select('department')
    .not('department', 'is', null)
    .neq('department', '')
    .neq('department', 'Management');

  if (error) {
    console.error('[departmentLookup] fetchDistinctDepartments error:', error);
    return [];
  }

  const set = new Set<string>();
  (data || []).forEach((row) => {
    if (isValidDepartment(row.department)) set.add(row.department.trim());
  });
  return Array.from(set).sort();
}

/** staff_id → department from user_info. */
export async function fetchDepartmentMap(staffIds?: string[]): Promise<Record<string, string>> {
  let query = supabase.from('users').select('staff_id, department');
  if (staffIds?.length) query = query.in('staff_id', staffIds);

  const { data, error } = await query;
  if (error) {
    console.error('[departmentLookup] fetchDepartmentMap error:', error);
    return {};
  }

  const map: Record<string, string> = {};
  (data || []).forEach((row) => {
    if (row.staff_id && isValidDepartment(row.department)) {
      map[row.staff_id] = row.department.trim();
    }
  });
  return map;
}

/** All staff_ids assigned to a department in user_info. */
export async function fetchStaffIdsByDepartment(department: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('users')
    .select('staff_id')
    .eq('department', department);

  if (error) {
    console.error('[departmentLookup] fetchStaffIdsByDepartment error:', error);
    return [];
  }

  return (data || []).map((row) => row.staff_id).filter(Boolean);
}

/** Resolve a single user's department from user_info. */
export async function fetchDepartmentByStaffId(staffId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('department')
    .eq('staff_id', staffId)
    .maybeSingle();

  if (error) {
    console.error('[departmentLookup] fetchDepartmentByStaffId error:', error);
    return null;
  }

  return isValidDepartment(data?.department) ? data.department.trim() : null;
}
