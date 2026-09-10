import type { Session, SupabaseClient } from '@supabase/supabase-js';

/** Fall through to real getSession() (and refresh) when the JWT is this close to expiry. */
export const CACHED_JWT_EXPIRY_MARGIN_MS = 10_000;

let cachedSession: Session | null = null;

export function setCachedAuthSession(session: Session | null): void {
  cachedSession = session;
}

export function getCachedAccessToken(): string | null {
  return cachedSession?.access_token ?? null;
}

export function peekCachedAuthSession(): Session | null {
  return cachedSession;
}

export function isCachedSessionFresh(session: Session | null, now = Date.now()): boolean {
  if (!session?.access_token) return false;
  const expiresAt = session.expires_at;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return true;
  return expiresAt * 1000 - now > CACHED_JWT_EXPIRY_MARGIN_MS;
}

export function peekValidCachedSession(now = Date.now()): Session | null {
  return isCachedSessionFresh(cachedSession, now) ? cachedSession : null;
}

export function supabaseAuthStorageKey(supabaseUrl: string): string {
  try {
    const host = new URL(supabaseUrl).hostname;
    const ref = host.split('.')[0];
    return ref ? `sb-${ref}-auth-token` : '';
  } catch {
    return '';
  }
}

function coerceStoredSession(value: unknown): Session | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.access_token === 'string' && rec.access_token) {
    return rec as unknown as Session;
  }
  if (rec.currentSession) return coerceStoredSession(rec.currentSession);
  return null;
}

export function hydrateCachedAuthSessionFromStorage(
  supabaseUrl: string,
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): Session | null {
  if (!storage) return null;
  const key = supabaseAuthStorageKey(supabaseUrl);
  if (!key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const session = coerceStoredSession(JSON.parse(raw));
    if (session) setCachedAuthSession(session);
    return session;
  } catch {
    return null;
  }
}

/** Return the memory JWT from getSession() so PostgREST does not wait on the auth lock. */
export function installCachedAuthSession(
  client: SupabaseClient,
  supabaseUrl: string,
): void {
  hydrateCachedAuthSessionFromStorage(supabaseUrl);
  const originalGetSession = client.auth.getSession.bind(client.auth);
  client.auth.getSession = (async () => {
    const cached = peekValidCachedSession();
    if (cached) return { data: { session: cached }, error: null };
    const result = await originalGetSession();
    if (result.data?.session) setCachedAuthSession(result.data.session);
    return result;
  }) as typeof client.auth.getSession;
}

export function resetCachedAuthSessionForTests(): void {
  cachedSession = null;
}
