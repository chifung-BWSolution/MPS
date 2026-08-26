import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LOGIN_LOGS_LIMIT,
  LOGIN_LOGS_TABLE,
  mapLoginLogRow,
  normalizeLoginEmail,
  type LoginLogRecord,
  type LoginLogRow,
  type LoginLogUserLookup,
} from '@/lib/loginLogs';

const LOG_SELECT = [
  'id',
  'email',
  'login_method',
  'ip_address',
  'user_agent',
  'success',
  'created_at',
  'user_id',
  'user:users!login_logs_user_id_fkey ( id, email, staffs(display_name) )',
].join(', ');

const USER_SELECT = 'id, email, staff_id, staffs(display_name)';

type StaffNameJoin = { display_name?: string | null } | { display_name?: string | null }[] | null;

type UsersEmailRow = {
  id?: string | null;
  email?: string | null;
  staff_id?: string | null;
  staffs?: StaffNameJoin;
};

type JoinedUserRow = {
  id?: string | null;
  email?: string | null;
  display_name?: string | null;
  staffs?: StaffNameJoin;
};

function staffDisplayName(staffs: StaffNameJoin): string | null {
  if (!staffs) return null;
  const row = Array.isArray(staffs) ? staffs[0] : staffs;
  return row?.display_name?.trim() || null;
}

function flattenJoinedUser(user: JoinedUserRow | JoinedUserRow[] | null | undefined): LoginLogUserLookup | null {
  if (!user) return null;
  const row = Array.isArray(user) ? user[0] : user;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name?.trim() || staffDisplayName(row.staffs),
  };
}

async function fetchUsersForEmails(emails: string[]): Promise<LoginLogUserLookup[]> {
  const unique = Array.from(new Set(emails.map(normalizeLoginEmail).filter(Boolean)));
  if (unique.length === 0) return [];

  const orFilter = unique
    .map((email) => {
      const quoted = `"${email.replace(/"/g, '\\"')}"`;
      return `email.eq.${quoted}`;
    })
    .join(',');

  const { data, error } = await supabase.from('users').select(USER_SELECT).or(orFilter);
  if (error) {
    console.warn('[login_logs] users lookup failed:', error.message);
    return [];
  }
  return ((data as UsersEmailRow[] | null) ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    display_name: staffDisplayName(row.staffs),
  }));
}

export function useLoginLogs() {
  const [logs, setLogs] = useState<LoginLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from(LOGIN_LOGS_TABLE)
      .select(LOG_SELECT)
      .order('created_at', { ascending: false })
      .limit(LOGIN_LOGS_LIMIT);

    if (err) {
      setError(err.message);
      setLogs([]);
      setLoading(false);
      return;
    }

    const rows = ((data as (LoginLogRow & { user?: JoinedUserRow | JoinedUserRow[] | null })[] | null) ?? []).map((row) => ({
      ...row,
      user: flattenJoinedUser(row.user),
    }));
    const missingName = rows.filter((row) => {
      const joined = Array.isArray(row.user) ? row.user[0] : row.user;
      return !joined?.display_name?.trim();
    });
    const users = await fetchUsersForEmails(missingName.map((row) => row.email));
    setError(null);
    setLogs(rows.map((row) => mapLoginLogRow(row, users)));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { logs, loading, error, refresh };
}
