import { supabase } from '@/lib/supabase';
import { remapStaleStaffUuid } from '@/services/staffIdentity';
import {
  pickPreferredWhitelistRow,
  scoreWhitelistCandidate,
} from '@/services/authStaffScore';

export {
  pickPreferredWhitelistRow,
  scoreWhitelistCandidate,
} from '@/services/authStaffScore';

export type UsersWhitelistRow = {
  id: string;
  staff_id: string;
  auth_user_id?: string | null;
  role_tag?: string | null;
  system_status?: string | null;
  classification?: string | null;
  display_name?: string | null;
  email?: string | null;
  google_email?: string | null;
  department?: string | null;
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
  const normalized = email.toLowerCase().trim();
  if (!normalized) return { data: [], error: null };

  const [byGoogle, byEmail] = await Promise.all([
    supabase.from('users').select('*').ilike('google_email', normalized),
    supabase.from('users').select('*').ilike('email', normalized),
  ]);

  const seen = new Set<string>();
  const rows: UsersWhitelistRow[] = [];
  for (const row of [...(byGoogle.data || []), ...(byEmail.data || [])] as UsersWhitelistRow[]) {
    const key = row.id || JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  return { data: rows, error: byGoogle.error || byEmail.error || null };
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
