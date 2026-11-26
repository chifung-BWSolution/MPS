/**
 * 社媒自動化營運 · 平台 OAuth 登入（P4／M4-03）
 *
 * 純函式：平台 → OAuth provider 對照、授權範圍、必要 secrets、allowed origin。
 * 實際授權 URL 組裝與 token 交換在 `content-social` Edge Function（client secret 不外流）。
 *
 * 支援：
 *   instagram／facebook → Meta（Facebook Login for Business）
 *   threads             → Threads
 *   youtube             → Google
 *   xiaohongshu／other  → 無公開 OAuth，改用手動貼憑證（本期明確標示）
 */

export type SocialOAuthProvider = 'meta' | 'threads' | 'google';

/** popup → 主視窗的 postMessage 類型（與 callback 頁面共用） */
export const SOCIAL_OAUTH_MESSAGE = 'mps-social-oauth';

/** 前端 callback 路由（需在 App.tsx 註冊；provider 會把 code/state 帶到這裡） */
export const SOCIAL_OAUTH_REDIRECT_PATH = '/social-oauth-callback';

export interface SocialOAuthProviderDef {
  provider: SocialOAuthProvider;
  label: string;
  /** 對應的社群平台 */
  platforms: string[];
  /** 需要的 OAuth scopes（送給平台） */
  scopes: string[];
  /** 必要 secrets（缺一不可） */
  envKeys: string[];
  /** 給使用者的設定提示（要在平台後台登記 redirect URI 等） */
  note: string;
}

export const SOCIAL_OAUTH_PROVIDERS: Record<SocialOAuthProvider, SocialOAuthProviderDef> = {
  meta: {
    provider: 'meta',
    label: 'Meta（Facebook／Instagram）',
    platforms: ['facebook', 'instagram'],
    scopes: ['public_profile', 'pages_show_list', 'pages_read_engagement', 'instagram_basic'],
    envKeys: ['META_APP_ID', 'META_APP_SECRET'],
    note: '在 Meta App 後台把 redirect URI 設為 <站點>/social-oauth-callback；發佈權限（instagram_content_publish）需 App Review。',
  },
  threads: {
    provider: 'threads',
    label: 'Threads',
    platforms: ['threads'],
    scopes: ['threads_basic', 'threads_content_publish'],
    envKeys: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
    note: '在 Threads 開發者後台設定 redirect URI；發佈相關權限需通過審核。',
  },
  google: {
    provider: 'google',
    label: 'Google（YouTube）',
    platforms: ['youtube'],
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    envKeys: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
    note: '使用「專用」Google OAuth 用戶端（勿與 Gmail／GSC 共用）；在 Google Cloud Console 加入 redirect URI，YouTube 上傳需另外開權限與驗證。',
  },
};

const PLATFORM_TO_PROVIDER: Record<string, SocialOAuthProvider> = {
  facebook: 'meta',
  instagram: 'meta',
  threads: 'threads',
  youtube: 'google',
};

export function oauthProviderForPlatform(platform: string | null | undefined): SocialOAuthProvider | null {
  return PLATFORM_TO_PROVIDER[String(platform || '').toLowerCase()] ?? null;
}

export function oauthProviderDef(provider: SocialOAuthProvider): SocialOAuthProviderDef {
  return SOCIAL_OAUTH_PROVIDERS[provider];
}

/** 給 UI 的友善標籤；不支援的平台上回 null */
export function oauthProviderLabelForPlatform(platform: string | null | undefined): string | null {
  const provider = oauthProviderForPlatform(platform);
  return provider ? SOCIAL_OAUTH_PROVIDERS[provider].label : null;
}

export interface SocialOAuthProviderStatus {
  provider: SocialOAuthProvider;
  label: string;
  configured: boolean;
  missing_env: string[];
  platforms: string[];
  note: string;
}

export function oauthProviderConfigured(status: SocialOAuthProviderStatus | undefined | null): boolean {
  return Boolean(status?.configured);
}

/**
 * 只允許把 OAuth 導回自家前端：
 *   - 正式網域（bwteam-marketing.com 及其子網域）
 *   - 本機開發（localhost／127.0.0.1 任意埠）
 * 其餘 origin 一律拒絕，避免 open redirect／授權碼被帶到第三方站。
 */
export function isAllowedSocialOAuthOrigin(origin: string | null | undefined): boolean {
  const value = String(origin || '').trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (!parsed.protocol.startsWith('https')) return false;
    return host === 'bwteam-marketing.com' || host.endsWith('.bwteam-marketing.com');
  } catch {
    return false;
  }
}

/** 由 origin 組出 callback 頁 URL（provider 會把 ?code=&state= 接在後面） */
export function socialOAuthRedirectUri(origin: string): string {
  return `${String(origin || '').replace(/\/+$/, '')}${SOCIAL_OAUTH_REDIRECT_PATH}`;
}
