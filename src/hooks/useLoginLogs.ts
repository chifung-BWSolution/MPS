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
  'user:users!login_logs_user_id_fkey ( id, display_name, email, google_email )',
].join(', ');

const USER_SELECT = 'id, email, google_email, display_name';

async function fetchUsersForEmails(emails: string[]): Promise<LoginLogUserLookup[]> {
  const unique = Array.from(new Set(emails.map(normalizeLoginEmail).filter(Boolean)));
  if (unique.length === 0) return [];

  const orFilter = unique
    .map((email) => {
      const quoted = `"${email.replace(/"/g, '\\"')}"`;
      return `email.eq.${quoted},google_email.eq.${quoted}`;
    })
    .join(',');

  const { data, error } = await supabase.from('users').select(USER_SELECT).or(orFilter);
  if (error) {
    console.warn('[login_logs] users lookup failed:', error.message);
    return [];
  }
  return (data as LoginLogUserLookup[] | null) ?? [];
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

    const rows = (data as LoginLogRow[] | null) ?? [];
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
