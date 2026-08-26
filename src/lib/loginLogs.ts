export const LOGIN_LOGS_TABLE = 'login_logs';
export const LOGIN_LOGS_LIMIT = 50;

export type LoginLogUserLookup = {
  email?: string | null;
  google_email?: string | null;
  display_name?: string | null;
};

export type LoginLogRow = {
  id: string;
  email: string;
  login_method: string;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean | null;
  created_at: string | null;
};

export type LoginLogRecord = {
  id: string;
  email: string;
  displayName: string;
  loginMethod: string;
  loginMethodLabel: string;
  ipAddress: string;
  success: boolean;
  createdAt: string;
};

export function normalizeLoginEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function loginMethodLabel(method: string | null | undefined): string {
  const value = (method || '').trim();
  if (!value) return '—';
  const normalized = value.toLowerCase();
  if (normalized === 'google') return 'Google';
  if (normalized.startsWith('dev_bypass')) return '開發登入';
  return value;
}

export function formatLoginLogTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' });
}

export function displayNameForLoginEmail(
  email: string,
  users: LoginLogUserLookup[],
): string {
  const normalized = normalizeLoginEmail(email);
  if (!normalized) return '—';
  const match = users.find((user) => {
    return (
      normalizeLoginEmail(user.email) === normalized ||
      normalizeLoginEmail(user.google_email) === normalized
    );
  });
  return match?.display_name?.trim() || email;
}

export function mapLoginLogRow(row: LoginLogRow, users: LoginLogUserLookup[]): LoginLogRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: displayNameForLoginEmail(row.email, users),
    loginMethod: row.login_method,
    loginMethodLabel: loginMethodLabel(row.login_method),
    ipAddress: row.ip_address?.trim() || '',
    success: row.success !== false,
    createdAt: row.created_at || '',
  };
}
