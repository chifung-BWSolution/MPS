/**
 * ALT Pilot · Edge Function 抓取守門員
 *
 * 兩層防護：
 *   1. 頁面只允許公司已登記網域（webandsystem_list）或 ALT_ALLOWED_HOSTS
 *   2. 所有 fetch 都拒絕 private / loopback / link-local / metadata IP
 *
 * 圖片 CDN 可能與頁面不同網域（framerusercontent.com），所以圖片不套
 * 頁面 allowlist，但仍套 IP 與 redirect 檢查。
 */

import { hostMatches, normalizeHost } from '../../../src/lib/altUrl.ts';

export class AltFetchError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'AltFetchError';
    this.code = code;
    this.status = status;
  }
}

const USER_AGENT = 'MPS-AltPilot/1.0';
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_SITEMAP_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 2;

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
};

export function extractBearerToken(req: Request): string {
  const header = req.headers.get('Authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

export function isPrivateIpv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  if ([a, b].some((part) => part > 255)) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateIpv6(host: string): boolean {
  const value = host.toLowerCase();
  return (
    value === '::' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe80') ||
    value.startsWith('::ffff:')
  );
}

export function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || (host.includes(':') && /^[0-9a-f:]+$/i.test(host));
}

/** 同步檢查；不碰 DNS，適合圖片這種大量且低風險的請求。 */
export function assertPublicHost(host: string): void {
  const value = normalizeHost(host);
  if (!value) throw new AltFetchError('invalid_host', '缺少有效網域', 400);
  if (value === 'localhost' || value.endsWith('.localhost')) {
    throw new AltFetchError('host_not_allowed', '不可抓取 localhost', 400);
  }
  if (isPrivateIpv4(value) || isPrivateIpv6(value)) {
    throw new AltFetchError('host_not_allowed', '不可抓取內網或保留 IP', 400);
  }
  if (!value.includes('.') && !isIpLiteral(value)) {
    throw new AltFetchError('host_not_allowed', '不可抓取單一標籤主機', 400);
  }
}

/** 頁面請求額外做 DNS 解析，降低 DNS rebinding 風險；解析失敗不阻擋。 */
export async function assertPublicHostDeep(host: string): Promise<void> {
  assertPublicHost(host);
  const value = normalizeHost(host);
  if (isIpLiteral(value)) return;

  try {
    const resolver = (Deno as unknown as { resolveDns?: (name: string, type: string) => Promise<string[]> })
      .resolveDns;
    if (!resolver) return;
    const addresses = await resolver(value, 'A');
    for (const address of addresses) {
      if (isPrivateIpv4(address)) {
        throw new AltFetchError('host_not_allowed', '網域解析到內網 IP', 400);
      }
    }
  } catch (error) {
    if (error instanceof AltFetchError) throw error;
    // DNS 失敗讓 fetch 自然報錯；不因 resolver 差異誤擋正常網站。
  }
}

function assertAllowedPageHost(host: string, allowedHosts: string[]): void {
  if (allowedHosts.length === 0) {
    throw new AltFetchError('host_not_allowed', '沒有可用的網域白名單', 403);
  }
  const value = normalizeHost(host);
  const allowed = allowedHosts.some((candidate) => hostMatches(value, candidate));
  if (!allowed) {
    throw new AltFetchError(
      'host_not_allowed',
      `此網域未登記：${value}。請先在「網站+系統」加入，或設定 ALT_ALLOWED_HOSTS。`,
      403,
    );
  }
}

function responseError(status: number): AltFetchError {
  if (status === 401 || status === 403) {
    return new AltFetchError('fetch_forbidden', `目標網站拒絕存取（HTTP ${status}）`, 502);
  }
  if (status === 404) {
    return new AltFetchError('fetch_not_found', '找不到頁面（HTTP 404）', 502);
  }
  if (status === 429) {
    return new AltFetchError('fetch_rate_limited', '目標網站限流（HTTP 429）', 502);
  }
  return new AltFetchError('fetch_failed', `目標網站回應 HTTP ${status}`, 502);
}

function decodeHtml(buffer: ArrayBuffer, contentType: string): string {
  const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
  const charset = charsetMatch?.[1]?.trim().toLowerCase() || 'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

export interface FetchedPage {
  html: string;
  finalUrl: string;
}

export async function fetchPageHtml(rawUrl: string, allowedHosts: string[]): Promise<FetchedPage> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new AltFetchError('invalid_url', '頁面 URL 格式不正確', 400);
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertAllowedPageHost(current.hostname, allowedHosts);
    await assertPublicHostDeep(current.hostname);

    let response: Response;
    try {
      response = await fetch(current.href, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8',
        },
      });
    } catch (error) {
      throw new AltFetchError(
        'fetch_failed',
        `無法連線目標網站：${error instanceof Error ? error.message : String(error)}`,
        502,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new AltFetchError('fetch_failed', '目標網站回傳空 redirect', 502);
      if (hop === MAX_REDIRECTS) {
        throw new AltFetchError('too_many_redirects', '目標網站 redirect 次數過多', 502);
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) throw responseError(response.status);

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new AltFetchError('not_html', `目標不是 HTML（${contentType}）`, 422);
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_HTML_BYTES) {
      throw new AltFetchError('page_too_large', '頁面 HTML 超過 2MB 上限', 413);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_HTML_BYTES) {
      throw new AltFetchError('page_too_large', '頁面 HTML 超過 2MB 上限', 413);
    }

    return {
      html: decodeHtml(buffer, contentType),
      finalUrl: current.href,
    };
  }

  throw new AltFetchError('too_many_redirects', '目標網站 redirect 次數過多', 502);
}

export interface FetchedSitemap {
  xml: string;
  finalUrl: string;
}

/**
 * 抓 sitemap（XML）。與 fetchPageHtml 相同的 allowlist／private IP／redirect 規則，
 * 但允許 XML／text，上限 5MB。
 */
export async function fetchSitemapText(
  rawUrl: string,
  allowedHosts: string[],
): Promise<FetchedSitemap> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new AltFetchError('invalid_url', 'sitemap URL 格式不正確', 400);
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertAllowedPageHost(current.hostname, allowedHosts);
    await assertPublicHostDeep(current.hostname);

    let response: Response;
    try {
      response = await fetch(current.href, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5',
        },
      });
    } catch (error) {
      throw new AltFetchError(
        'fetch_failed',
        `無法連線 sitemap：${error instanceof Error ? error.message : String(error)}`,
        502,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new AltFetchError('fetch_failed', 'sitemap 回傳空 redirect', 502);
      if (hop === MAX_REDIRECTS) {
        throw new AltFetchError('too_many_redirects', 'sitemap redirect 次數過多', 502);
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) throw responseError(response.status);

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !/xml|text\//i.test(contentType)) {
      throw new AltFetchError('not_sitemap', `目標不是 sitemap XML（${contentType}）`, 422);
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_SITEMAP_BYTES) {
      throw new AltFetchError('sitemap_too_large', 'sitemap 超過 5MB 上限', 413);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_SITEMAP_BYTES) {
      throw new AltFetchError('sitemap_too_large', 'sitemap 超過 5MB 上限', 413);
    }

    return {
      xml: new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, ''),
      finalUrl: current.href,
    };
  }

  throw new AltFetchError('too_many_redirects', 'sitemap redirect 次數過多', 502);
}

export interface FetchedImage {
  bytes: Uint8Array;
  mimeType: string;
  hash: string;
}

export async function fetchImageBytes(rawUrl: string): Promise<FetchedImage> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new AltFetchError('invalid_image_url', '圖片 URL 格式不正確', 422);
  }
  if (current.protocol !== 'http:' && current.protocol !== 'https:') {
    throw new AltFetchError('invalid_image_url', '只支援 http / https 圖片', 422);
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertPublicHost(current.hostname);

    let response: Response;
    try {
      response = await fetch(current.href, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': USER_AGENT,
          // 不主動要 AVIF；Gemini／Grok 對 AVIF 支援不穩定，讓 CDN 回 webp/jpeg。
          Accept: 'image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.5',
        },
      });
    } catch (error) {
      throw new AltFetchError(
        'image_fetch_failed',
        `無法下載圖片：${error instanceof Error ? error.message : String(error)}`,
        502,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new AltFetchError('image_fetch_failed', '圖片回傳空 redirect', 502);
      if (hop === MAX_REDIRECTS) {
        throw new AltFetchError('image_fetch_failed', '圖片 redirect 次數過多', 502);
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) throw responseError(response.status);

    const rawType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const mimeType = MIME_ALIASES[rawType] || rawType;
    if (mimeType === 'image/svg+xml' || mimeType === 'image/gif') {
      throw new AltFetchError('image_unsupported', `不處理 ${mimeType} 圖片`, 415);
    }
    if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
      throw new AltFetchError('image_unsupported', `不支援的圖片格式：${rawType || '未知'}`, 415);
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_IMAGE_BYTES) {
      throw new AltFetchError('image_too_large', '圖片超過 6MB 上限', 413);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new AltFetchError('image_too_large', '圖片超過 6MB 上限', 413);
    }

    const bytes = new Uint8Array(buffer);
    return {
      bytes,
      mimeType,
      hash: await sha256Hex(bytes),
    };
  }

  throw new AltFetchError('image_fetch_failed', '圖片 redirect 次數過多', 502);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
