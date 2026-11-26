/**
 * next_custom adapter（M5-03）：站方提供 REST 端點時的標準接法。
 *
 * 契約（與 PRD §9.3.4 對齊）：
 *   POST {domain}/api/content/articles
 *   Authorization: Bearer <secret>
 *   body: { title, slug, excerpt, body_html, canonical, meta_description, cover? }
 *   回 2xx { id, url, status }
 *
 *   GET {domain}/api/content/health
 *   POST {domain}/api/content/images（multipart）
 *
 * 任何失敗都丟 AdapterError（code/httpStatus 可辨識），由呼叫端決定重試或轉 manual。
 */

import {
  AdapterError,
  type AdapterArticleInput,
  type AdapterArticleResult,
  type AdapterCredentials,
  type AdapterDeleteResult,
  type AdapterImage,
  type AdapterSite,
  type AdapterTestResult,
  type ContentAdapter,
} from './types.ts';

const DEFAULT_TIMEOUT_MS = 20_000;

function baseUrl(site: AdapterSite): string {
  const domain = (site.domain || '').trim();
  if (!domain) throw new AdapterError('missing_domain', '站點沒有設定網域');
  const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  return withScheme.replace(/\/+$/, '');
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
    throw new AdapterError(
      'network_error',
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timer);
  }
}

function readableMessage(status: number, body: string): string {
  if (status === 401 || status === 403) return '站點拒絕授權：請確認 API token';
  if (status === 404) return '站點沒有對應的 API 端點';
  if (status === 429) return '站點限流（429）：請稍後再試';
  if (status >= 500) return `站點伺服器錯誤（${status}）`;
  const text = body.replace(/\s+/g, ' ').trim();
  return text ? `HTTP ${status}：${text.slice(0, 200)}` : `HTTP ${status}`;
}

function secretOf(credentials: AdapterCredentials): string {
  const secret = (credentials.secret || '').trim();
  if (!secret) throw new AdapterError('missing_credential', '尚未設定站點 API token');
  return secret;
}

export const nextCustomAdapter: ContentAdapter = {
  name: 'next_custom',

  supports(mode) {
    return mode === 'draft' || mode === 'direct';
  },

  async testConnection(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterTestResult> {
    const fetchImpl = input.fetchImpl ?? fetch;
    const checks = [];
    const secret = (input.credentials.secret || '').trim();

    checks.push({
      id: 'credential',
      label: 'API token',
      ok: Boolean(secret),
      detail: secret ? '已設定' : '尚未設定（無法呼叫站點 API）',
    });

    if (!secret) {
      return { ok: false, checks };
    }

    let url: string;
    try {
      url = `${baseUrl(input.site)}/api/content/health`;
    } catch (error) {
      checks.push({
        id: 'endpoint',
        label: '健康檢查端點',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, checks };
    }

    try {
      const response = await request(fetchImpl, url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      });
      if (response.status === 404) {
        checks.push({ id: 'endpoint', label: '健康檢查端點', ok: false, detail: '站方尚未提供 /api/content/health（可忽略，直接測發佈）' });
      } else {
        checks.push({
          id: 'endpoint',
          label: '健康檢查端點',
          ok: response.ok,
          detail: response.ok ? '可用' : readableMessage(response.status, await response.text()),
        });
      }
    } catch (error) {
      checks.push({
        id: 'endpoint',
        label: '健康檢查端點',
        ok: false,
        detail: error instanceof AdapterError ? error.message : String(error),
      });
    }

    return { ok: checks.every((check) => check.id === 'endpoint' ? check.ok || check.detail.includes('尚未提供') : check.ok), checks };
  },

  async createArticle(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    article: AdapterArticleInput;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterArticleResult> {
    const fetchImpl = input.fetchImpl ?? fetch;
    const secret = secretOf(input.credentials);
    const url = `${baseUrl(input.site)}/api/content/articles`;
    const article = input.article;

    const response = await request(fetchImpl, url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        body_html: article.bodyHtml,
        canonical: article.canonical,
        meta_description: article.metaDescription,
        cover: article.coverImage
          ? { filename: article.coverImage.filename, content_type: article.coverImage.contentType }
          : null,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new AdapterError('publish_failed', readableMessage(response.status, text), response.status);
    }

    let payload: { id?: string; url?: string; status?: string } = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new AdapterError('bad_response', '站點回應不是合法 JSON', response.status);
    }

    return {
      ok: true,
      externalId: payload.id ?? null,
      liveUrl: payload.status === 'published' ? payload.url ?? null : null,
      draftUrl: payload.status === 'draft' ? payload.url ?? null : null,
      httpStatus: response.status,
      raw: payload,
    };
  },

  async deleteArticle(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    externalId: string;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterDeleteResult> {
    const fetchImpl = input.fetchImpl ?? fetch;
    const secret = secretOf(input.credentials);
    const url = `${baseUrl(input.site)}/api/content/articles/${encodeURIComponent(input.externalId)}`;
    const response = await request(fetchImpl, url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
    });
    const text = await response.text();
    if (response.status === 404 || response.status === 410) {
      return { ok: true, alreadyGone: true, httpStatus: response.status, raw: { note: 'already gone' } };
    }
    if (!response.ok) {
      throw new AdapterError('delete_failed', readableMessage(response.status, text), response.status);
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      payload = { raw: text.slice(0, 300) };
    }
    return { ok: true, alreadyGone: false, httpStatus: response.status, raw: payload };
  },

  async uploadImage(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    image: AdapterImage;
    fetchImpl?: typeof fetch;
  }) {
    const fetchImpl = input.fetchImpl ?? fetch;
    const secret = secretOf(input.credentials);
    const url = `${baseUrl(input.site)}/api/content/images`;
    const form = new FormData();
    form.append(
      'file',
      new Blob([input.image.bytes], { type: input.image.contentType }),
      input.image.filename,
    );
    if (input.image.alt) form.append('alt', input.image.alt);

    const response = await request(fetchImpl, url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
      body: form,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new AdapterError('upload_failed', readableMessage(response.status, text), response.status);
    }
    try {
      const payload = JSON.parse(text) as { url?: string };
      return { ok: true, url: payload.url ?? null, raw: payload };
    } catch {
      throw new AdapterError('bad_response', '站點回應不是合法 JSON', response.status);
    }
  },
};
