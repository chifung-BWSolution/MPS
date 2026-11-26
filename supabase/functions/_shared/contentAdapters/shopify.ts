/**
 * Shopify adapter（M5-03）：Admin REST API + custom app admin token。
 *
 * 憑證格式（content_site_credentials.kind = shopify_admin，AES 加密）：
 *   - 純 token：`shpat_xxx`（會自動找第一個 blog）
 *   - 或 JSON：`{"token":"shpat_xxx","blog_id":123456,"api_version":"2024-10"}`
 *
 * 端點（Admin API）：
 *   GET  /admin/api/{version}/shop.json                     連線測試
 *   GET  /admin/api/{version}/blogs/{id}.json               取 blog handle（組公開 URL）
 *   GET  /admin/api/{version}/blogs.json?limit=1            未指定 blog_id 時自動挑第一個
 *   POST /admin/api/{version}/blogs/{id}/articles.json      建立文章
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
const DEFAULT_API_VERSION = '2024-10';

interface ShopifyConfig {
  token: string;
  blogId: string | null;
  apiVersion: string;
}

function baseUrl(site: AdapterSite): string {
  const domain = (site.domain || '').trim();
  if (!domain) throw new AdapterError('missing_domain', '站點沒有設定網域');
  return (/^https?:\/\//i.test(domain) ? domain : `https://${domain}`).replace(/\/+$/, '');
}

function parseCredential(secret: string | null): ShopifyConfig {
  const raw = (secret || '').trim();
  if (!raw) throw new AdapterError('missing_credential', '尚未設定 Shopify Admin API token');
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const token = typeof parsed.token === 'string' ? parsed.token.trim() : '';
      if (!token) throw new Error('缺少 token');
      return {
        token,
        blogId: parsed.blog_id != null ? String(parsed.blog_id) : null,
        apiVersion:
          typeof parsed.api_version === 'string' && parsed.api_version.trim()
            ? parsed.api_version.trim()
            : DEFAULT_API_VERSION,
      };
    } catch (error) {
      throw new AdapterError(
        'invalid_credential_format',
        `Shopify 憑證 JSON 無法解析：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { token: raw, blogId: null, apiVersion: DEFAULT_API_VERSION };
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

function adminHeaders(config: ShopifyConfig): Record<string, string> {
  return {
    'X-Shopify-Access-Token': config.token,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function resolveBlogId(
  fetchFn: typeof fetch,
  base: string,
  config: ShopifyConfig,
): Promise<string> {
  if (config.blogId) return config.blogId;
  const response = await request(fetchFn, `${base}/admin/api/${config.apiVersion}/blogs.json?limit=1`, {
    method: 'GET',
    headers: adminHeaders(config),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new AdapterError(
      'shopify_blogs_failed',
      `讀取 Shopify blogs 失敗（HTTP ${response.status}）`,
      response.status,
    );
  }
  const blogs = Array.isArray(payload.blogs) ? (payload.blogs as Record<string, unknown>[]) : [];
  const first = blogs[0];
  if (!first?.id) {
    throw new AdapterError('shopify_blog_missing', 'Shopify 找不到任何 blog；請在憑證 JSON 指定 blog_id');
  }
  return String(first.id);
}

async function resolveBlogHandle(
  fetchFn: typeof fetch,
  base: string,
  config: ShopifyConfig,
  blogId: string,
): Promise<string> {
  try {
    const response = await request(
      fetchFn,
      `${base}/admin/api/${config.apiVersion}/blogs/${blogId}.json`,
      { method: 'GET', headers: adminHeaders(config) },
    );
    if (!response.ok) return 'news';
    const payload = await readJson(response);
    const blog = (payload.blog ?? {}) as Record<string, unknown>;
    return typeof blog.handle === 'string' && blog.handle ? blog.handle : 'news';
  } catch {
    return 'news';
  }
}

export const shopifyAdapter: ContentAdapter = {
  name: 'shopify',

  supports(mode) {
    return mode === 'draft' || mode === 'direct';
  },

  async testConnection({ site, credentials, fetchImpl }): Promise<AdapterTestResult> {
    const fetchFn = fetchImpl ?? fetch;
    const checks: AdapterTestResult['checks'] = [];
    let config: ShopifyConfig;
    try {
      config = parseCredential(credentials.secret);
      checks.push({ id: 'credential', label: 'Admin API token 格式', ok: true, detail: '已提供' });
    } catch (error) {
      checks.push({
        id: 'credential',
        label: 'Admin API token 格式',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, checks };
    }

    try {
      const base = baseUrl(site);
      const response = await request(fetchFn, `${base}/admin/api/${config.apiVersion}/shop.json`, {
        method: 'GET',
        headers: adminHeaders(config),
      });
      const payload = await readJson(response);
      const shop = (payload.shop ?? {}) as Record<string, unknown>;
      checks.push({
        id: 'auth',
        label: 'Admin API 授權',
        ok: response.ok,
        detail: response.ok
          ? `已連線 ${String(shop.name ?? shop.domain ?? '')}`.trim()
          : `HTTP ${response.status}`,
      });
      if (response.ok) {
        const blogId = await resolveBlogId(fetchFn, base, config);
        checks.push({ id: 'blog', label: 'Blog 可用', ok: Boolean(blogId), detail: `blog_id=${blogId}` });
      }
    } catch (error) {
      checks.push({
        id: 'auth',
        label: 'Admin API 授權',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    return { ok: checks.every((check) => check.ok), checks };
  },

  async createArticle({ site, credentials, article, fetchImpl }): Promise<AdapterArticleResult> {
    const fetchFn = fetchImpl ?? fetch;
    const base = baseUrl(site);
    const config = parseCredential(credentials.secret);
    const blogId = await resolveBlogId(fetchFn, base, config);
    const blogHandle = await resolveBlogHandle(fetchFn, base, config, blogId);

    const isDirect = site.publishMode === 'direct';
    const body = {
      article: {
        title: article.title,
        handle: article.slug,
        body_html: article.bodyHtml,
        summary_html: article.excerpt,
        published: isDirect,
        published_at: isDirect ? new Date().toISOString() : null,
        metafields: [
          {
            namespace: 'global',
            key: 'description_tag',
            value: article.metaDescription,
            type: 'single_line_text_field',
          },
        ],
      },
    };

    const response = await request(
      fetchFn,
      `${base}/admin/api/${config.apiVersion}/blogs/${blogId}/articles.json`,
      { method: 'POST', headers: adminHeaders(config), body: JSON.stringify(body) },
    );
    const payload = await readJson(response);
    if (!response.ok) {
      throw new AdapterError(
        'shopify_publish_failed',
        `Shopify 建立文章失敗（HTTP ${response.status}）`,
        response.status,
      );
    }
    const record = (payload.article ?? {}) as Record<string, unknown>;
    const externalId = record.id ? String(record.id) : null;
    const handle = typeof record.handle === 'string' ? record.handle : article.slug;
    const url = `https://${new URL(base).hostname}/blogs/${blogHandle}/${handle}`;
    return {
      ok: Boolean(externalId),
      externalId,
      liveUrl: isDirect ? url : null,
      draftUrl: isDirect ? null : url,
      httpStatus: response.status,
      raw: { id: externalId, handle, blog_id: blogId },
    };
  },

  /** 真正刪除站點上的文章：DELETE /admin/api/{version}/blogs/{blog}/articles/{id}.json */
  async deleteArticle({ site, credentials, externalId, fetchImpl }): Promise<AdapterDeleteResult> {
    const fetchFn = fetchImpl ?? fetch;
    const base = baseUrl(site);
    const config = parseCredential(credentials.secret);
    const blogId = await resolveBlogId(fetchFn, base, config);
    const response = await request(
      fetchFn,
      `${base}/admin/api/${config.apiVersion}/blogs/${blogId}/articles/${encodeURIComponent(externalId)}.json`,
      { method: 'DELETE', headers: adminHeaders(config) },
    );
    const payload = await readJson(response);
    if (response.status === 404 || response.status === 410) {
      return { ok: true, alreadyGone: true, httpStatus: response.status, raw: payload };
    }
    if (!response.ok) {
      throw new AdapterError(
        'shopify_delete_failed',
        `Shopify 刪除文章失敗（HTTP ${response.status}）`,
        response.status,
      );
    }
    return { ok: true, alreadyGone: false, httpStatus: response.status, raw: payload };
  },
};
