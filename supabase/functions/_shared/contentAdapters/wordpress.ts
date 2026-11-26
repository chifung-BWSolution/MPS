/**
 * WordPress adapter（M5-03）：REST API + Application Password（Basic Auth）。
 *
 * 憑證格式（存在 content_site_credentials.kind = wp_app_password，AES 加密）：
 *   `username:application_password`
 *
 * 端點：
 *   GET  {base}/wp-json/wp/v2/users/me                 連線測試
 *   GET  {base}/wp-json/wp/v2/posts?slug=<slug>&status=any  以 slug 查重（重試冪等）
 *   POST {base}/wp-json/wp/v2/posts                    建立文章（direct→publish、draft→draft）
 *
 * 純 TS：fetch 可注入，方便契約測試。
 */

import {
  AdapterError,
  type AdapterArticleInput,
  type AdapterArticleResult,
  type AdapterCredentials,
  type AdapterDeleteResult,
  type AdapterSite,
  type AdapterTestResult,
  type ContentAdapter,
} from './types.ts';

const DEFAULT_TIMEOUT_MS = 20_000;

function baseUrl(site: AdapterSite): string {
  const domain = (site.domain || '').trim();
  if (!domain) throw new AdapterError('missing_domain', '站點沒有設定網域');
  return (/^https?:\/\//i.test(domain) ? domain : `https://${domain}`).replace(/\/+$/, '');
}

function parseCredential(secret: string | null): { username: string; password: string } {
  const raw = (secret || '').trim();
  if (!raw) throw new AdapterError('missing_credential', '尚未設定 WordPress 應用程式密碼');
  const index = raw.indexOf(':');
  if (index <= 0) {
    throw new AdapterError(
      'invalid_credential_format',
      'WordPress 憑證格式應為「使用者名稱:應用程式密碼」',
    );
  }
  return { username: raw.slice(0, index), password: raw.slice(index + 1) };
}

function basicAuth(username: string, password: string): string {
  // btoa 在 Deno 與瀏覽器都有；adapter 只會跑在 Edge Function／Node 測試
  return `Basic ${btoa(`${username}:${password}`)}`;
}

async function request(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AdapterError('timeout', `請求逾時（${timeoutMs}ms）`);
    }
    throw new AdapterError('network_error', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function errorMessage(status: number, payload: Record<string, unknown>, fallback: string): string {
  const message =
    (payload.message as string | undefined) ||
    ((payload.code as string | undefined) ? String(payload.code) : '') ||
    fallback;
  return `HTTP ${status}：${String(message).slice(0, 300)}`;
}

export const wordpressAdapter: ContentAdapter = {
  name: 'wordpress',

  supports(mode) {
    return mode === 'draft' || mode === 'direct';
  },

  async testConnection({ site, credentials, fetchImpl }): Promise<AdapterTestResult> {
    const fetchFn = fetchImpl ?? fetch;
    const checks: AdapterTestResult['checks'] = [];
    let auth: { username: string; password: string };
    try {
      auth = parseCredential(credentials.secret);
      checks.push({ id: 'credential', label: '應用程式密碼格式', ok: true, detail: `使用者：${auth.username}` });
    } catch (error) {
      checks.push({
        id: 'credential',
        label: '應用程式密碼格式',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, checks };
    }

    try {
      const response = await request(fetchFn, `${baseUrl(site)}/wp-json/wp/v2/users/me`, {
        method: 'GET',
        headers: { Authorization: basicAuth(auth.username, auth.password), Accept: 'application/json' },
      });
      const payload = await readJson(response);
      checks.push({
        id: 'auth',
        label: 'REST API 授權',
        ok: response.ok,
        detail: response.ok
          ? `已登入 ${String((payload.name as string | undefined) ?? auth.username)}`
          : errorMessage(response.status, payload, '授權失敗'),
      });
    } catch (error) {
      checks.push({
        id: 'auth',
        label: 'REST API 授權',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    return { ok: checks.every((check) => check.ok), checks };
  },

  async createArticle({ site, credentials, article, fetchImpl }): Promise<AdapterArticleResult> {
    const fetchFn = fetchImpl ?? fetch;
    const base = baseUrl(site);
    const auth = parseCredential(credentials.secret);
    const headers = {
      Authorization: basicAuth(auth.username, auth.password),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // 冪等：同一 slug 已存在就直接沿用（重試時不重複發文）
    try {
      const existingResponse = await request(
        fetchFn,
        `${base}/wp-json/wp/v2/posts?slug=${encodeURIComponent(article.slug)}&status=any`,
        { method: 'GET', headers },
      );
      if (existingResponse.ok) {
        const existing = await readJson(existingResponse);
        const first = Array.isArray(existing) ? (existing[0] as Record<string, unknown> | undefined) : undefined;
        if (first && first.id) {
          const link = typeof first.link === 'string' ? first.link : null;
          return {
            ok: true,
            externalId: String(first.id),
            liveUrl: site.publishMode === 'direct' ? link : null,
            draftUrl: site.publishMode === 'draft' ? link : null,
            httpStatus: 200,
            raw: { reused: true, id: first.id, link },
          };
        }
      }
    } catch {
      // 查重失敗不阻擋發佈；最多是重試時多一篇草稿
    }

    const body = {
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      content: article.bodyHtml,
      status: site.publishMode === 'direct' ? 'publish' : 'draft',
      meta: { _yoast_wpseo_metadesc: article.metaDescription },
    };

    const response = await request(fetchFn, `${base}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new AdapterError(
        'wordpress_publish_failed',
        errorMessage(response.status, payload, 'WordPress 建立文章失敗'),
        response.status,
      );
    }
    const externalId = payload.id ? String(payload.id) : null;
    const link = typeof payload.link === 'string' ? payload.link : null;
    return {
      ok: Boolean(externalId),
      externalId,
      liveUrl: site.publishMode === 'direct' ? link : null,
      draftUrl: site.publishMode === 'draft' ? link : null,
      httpStatus: response.status,
      raw: payload,
    };
  },

  /** 真正刪除站點上的文章：DELETE /wp-json/wp/v2/posts/{id}?force=true（略過資源回收桶） */
  async deleteArticle({ site, credentials, externalId, fetchImpl }): Promise<AdapterDeleteResult> {
    const fetchFn = fetchImpl ?? fetch;
    const auth = parseCredential(credentials.secret);
    const response = await request(
      fetchFn,
      `${baseUrl(site)}/wp-json/wp/v2/posts/${encodeURIComponent(externalId)}?force=true`,
      {
        method: 'DELETE',
        headers: {
          Authorization: basicAuth(auth.username, auth.password),
          Accept: 'application/json',
        },
      },
    );
    const payload = await readJson(response);
    if (response.status === 404 || response.status === 410) {
      return { ok: true, alreadyGone: true, httpStatus: response.status, raw: payload };
    }
    if (!response.ok) {
      throw new AdapterError(
        'wordpress_delete_failed',
        errorMessage(response.status, payload, 'WordPress 刪除文章失敗'),
        response.status,
      );
    }
    return {
      ok: (payload.deleted as boolean | undefined) !== false,
      alreadyGone: false,
      httpStatus: response.status,
      raw: payload,
    };
  },
};
