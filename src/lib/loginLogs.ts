export const LOGIN_LOGS_TABLE = 'login_logs';
export const LOGIN_LOGS_LIMIT = 50;

const USERS_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUsersUuid(value: string | null | undefined): value is string {
  return !!value && USERS_UUID_RE.test(value);
}

export type LoginLogUserLookup = {
  id?: string | null;
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
  user_id?: string | null;
  user?: LoginLogUserLookup | LoginLogUserLookup[] | null;
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

export function mapLoginLogRow(row: LoginLogRow, users: LoginLogUserLookup[] = []): LoginLogRecord {
  const joined = Array.isArray(row.user) ? row.user[0] : row.user;
  const byId = row.user_id ? users.find((user) => user.id === row.user_id) : undefined;
  const displayName =
    joined?.display_name?.trim() ||
    byId?.display_name?.trim() ||
    displayNameForLoginEmail(row.email, users);

  return {
    id: row.id,
    email: row.email,
    displayName,
    loginMethod: row.login_method,
    loginMethodLabel: loginMethodLabel(row.login_method),
    ipAddress: row.ip_address?.trim() || '',
    success: row.success !== false,
    createdAt: row.created_at || '',
  };
}
