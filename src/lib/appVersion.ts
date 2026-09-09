export const VERSION_UPDATE_MESSAGE = '系統已推出新版本，請重新整理頁面。';
export const VERSION_UPDATE_ACTION_LABEL = '立即重新整理';
export const VERSION_UPDATE_BAR_HEIGHT_PX = 40;
export const APP_VERSION_POLL_MS = 60_000;

export type AppVersionPayload = {
  version: string;
};

export function getAppVersionUrl(baseUrl = '/'): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}version.json`;
}

export function parseAppVersionPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const version = (data as { version?: unknown }).version;
  return typeof version === 'string' && version.trim() ? version.trim() : null;
}

export function isNewerAppVersion(current: string, remote: string): boolean {
  return Boolean(current && remote && current !== remote);
}

export async function fetchRemoteAppVersion(
  fetchFn: typeof fetch = fetch,
  baseUrl = '/',
): Promise<string | null> {
  try {
    const res = await fetchFn(`${getAppVersionUrl(baseUrl)}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return parseAppVersionPayload(await res.json());
  } catch {
    return null;
  }
}

export function getRunningAppVersion(): string {
  try {
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  } catch {
    return '';
  }
}
