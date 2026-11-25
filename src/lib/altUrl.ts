/**
 * ALT Pilot · URL 正規化與網域比對（瀏覽器、Node、Deno 共用）
 *
 * 只做字串與 URL 解析，不做 DNS；SSRF 的 IP 檢查在 Edge Function 的 guard.ts。
 */

export function normalizeHost(host: string): string {
  return String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

export function hostOf(rawUrl: string): string {
  try {
    return normalizeHost(new URL(rawUrl).hostname);
  } catch {
    return '';
  }
}

export function hostMatches(host: string, allowedHost: string): boolean {
  const target = normalizeHost(host);
  const allowed = normalizeHost(allowedHost);
  if (!target || !allowed) return false;
  return target === allowed || target.endsWith(`.${allowed}`);
}

function withScheme(raw: string): string {
  const trimmed = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

/**
 * 把使用者輸入變成可 fetch 的絕對 URL。
 * - 允許只輸入網域（補 https://）
 * - 允許相對於站點的 path（例如 `/about`）
 * - 移除 fragment；保留 query（CDN 圖片參數可能必要）
 */
export function normalizePageUrl(raw: string, base?: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) throw new Error('請輸入頁面 URL');

  let candidate = withScheme(trimmed);
  if (base && (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../'))) {
    candidate = new URL(trimmed, withScheme(base)).href;
  }

  const url = new URL(candidate);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支援 http / https 頁面');
  }
  if (url.username || url.password) {
    throw new Error('URL 不可包含帳號密碼');
  }
  url.hash = '';
  if (!url.pathname) url.pathname = '/';
  return url.href;
}

export function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(String(raw || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sameHost(a: string, b: string): boolean {
  return hostMatches(hostOf(a), hostOf(b));
}
