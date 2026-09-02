import { supabase } from '@/lib/supabase';
import { remapStaleStaffUuid } from '@/services/staffIdentity';
import {
  normalizeLoginEmail,
  pickPreferredWhitelistRow,
  scoreWhitelistCandidate,
} from '@/services/authStaffScore';

export {
  normalizeLoginEmail,
  pickPreferredWhitelistRow,
  scoreWhitelistCandidate,
} from '@/services/authStaffScore';

export type UsersWhitelistRow = {
  id: string;
  staff_id: string;
  auth_user_id?: string | null;
  role_tag?: string | null;
  email?: string | null;
  [key: string]: unknown;
};

export async function fetchUsersByAuthUserId(
  authUserId: string,
): Promise<{ data: UsersWhitelistRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  return { data: (data as UsersWhitelistRow | null) || null, error };
}

/** Dev-bypass / unlinked fallback only. OAuth path uses resolve_users_for_auth(). */
export async function fetchUsersCandidatesByEmail(
  email: string,
): Promise<{ data: UsersWhitelistRow[]; error: unknown }> {
  const normalized = normalizeLoginEmail(email);
  if (!normalized) return { data: [], error: null };

  // Use eq (not ilike): emails contain `.` which PostgREST can misread in LIKE filters.
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', normalized);

  return { data: (data as UsersWhitelistRow[] | null) || [], error };
}

/** OAuth: resolve whitelist by auth.uid() (auth_user_id), linking once if needed. */
export async function resolveUsersRowForAuthUid(): Promise<{
  data: UsersWhitelistRow | null;
  error: unknown;
}> {
  const { data, error } = await supabase.rpc('resolve_users_for_auth');
  if (error) return { data: null, error };
  return { data: (data as UsersWhitelistRow | null) || null, error: null };
}

export function staffIdFromUsersRow(row: UsersWhitelistRow | null | undefined): string | null {
  return remapStaleStaffUuid(row?.staff_id || null) || null;
}
