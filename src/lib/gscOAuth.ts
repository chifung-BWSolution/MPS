export const GSC_OAUTH_MESSAGE = 'mps-gsc-oauth';
export const GSC_OAUTH_LOGIN_HINT = 'chifung.login@gmail.com';

export type GscOAuthStatus = {
  connected: boolean;
  has_webmasters_scope: boolean;
  source: 'gsc' | 'ga4' | null;
  token_preview: string;
  last_used_at: string | null;
  scopes: string;
  sites_listed: number | null;
  probe_error: string | null;
  login_hint: string;
  client_id: string;
  redirect_uri: string;
};

export function maskRefreshToken(token: string): string {
  const t = String(token || '').trim();
  if (!t) return '';
  if (t.length <= 8) return '••••';
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

export function hasWebmastersScope(scope: string | null | undefined): boolean {
  return /webmasters/i.test(String(scope || ''));
}

export function isGscOAuthMessage(data: unknown): data is {
  type: string;
  ok: boolean;
  message?: string;
} {
  return Boolean(
    data &&
      typeof data === 'object' &&
      (data as { type?: string }).type === GSC_OAUTH_MESSAGE,
  );
}
