/**
 * Webflow adapter（M5-03）：Data API v2 + Site API token。
 *
 * 憑證格式（content_site_credentials.kind = webflow_token，AES 加密）：
 *   - 純 token：`wf_xxx`（會用站點網域自動找 site 與第一個可用 collection）
 *   - 或 JSON：
 *     {
 *       "token": "wf_xxx",
 *       "site_id": "…",              // 可省略，用網域比對
 *       "collection_id": "…",        // 建議指定，避免挑錯
 *       "field_map": { "title": "name", "slug": "slug", "body": "post-body", "excerpt": "post-summary" }
 *     }
 *
 * 端點：
 *   GET  /v2/sites                                  連線／找 site
 *   GET  /v2/sites/{site}/collections               找 collection 與欄位
 *   POST /v2/collections/{collection}/items         建立 item（CMS 草稿）
 *
 * 注意：Webflow CMS item 建立後是否公開取決於 collection 頁面與站方發佈流程；
 * API 回應不含公開 URL，因此 direct 模式在 worker 會落成「已建立草稿（draft_published）」，
 * 由站方在 Webflow 按發佈後回填 URL——這是刻意保守，不假裝已上線。
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
const API_BASE = 'https://api.webflow.com/v2';

interface WebflowConfig {
  token: string;
  siteId: string | null;
  collectionId: string | null;
  fieldMap: Record<string, string>;
}

interface WebflowField {
  slug?: string;
  displayName?: string;
  type?: string;
}

interface WebflowCollection {
  id: string;
  displayName?: string;
  slug?: string;
  fields?: WebflowField[];
}

function parseCredential(secret: string | null): WebflowConfig {
  const raw = (secret || '').trim();
  if (!raw) throw new AdapterError('missing_credential', '尚未設定 Webflow API token');
  if (!raw.startsWith('{')) {
    return { token: raw, siteId: null, collectionId: null, fieldMap: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const token = typeof parsed.token === 'string' ? parsed.token.trim() : '';
    if (!token) throw new Error('缺少 token');
    return {
      token,
      siteId: parsed.site_id != null ? String(parsed.site_id) : null,
      collectionId: parsed.collection_id != null ? String(parsed.collection_id) : null,
      fieldMap:
        parsed.field_map && typeof parsed.field_map === 'object'
          ? (parsed.field_map as Record<string, string>)
          : {},
    };
  } catch (error) {
    throw new AdapterError(
      'invalid_credential_format',
      `Webflow 憑證 JSON 無法解析：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function hostOf(site: AdapterSite): string {
  const domain = (site.domain || '').trim();
  if (!domain) throw new AdapterError('missing_domain', '站點沒有設定網域');
  const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  try {
    return new URL(withScheme).hostname.replace(/^www\./i, '');
  } catch {
    throw new AdapterError('invalid_domain', `無法解析站點網域：${domain}`);
  }
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

function headers(config: WebflowConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function resolveSiteId(
  fetchFn: typeof fetch,
  config: WebflowConfig,
  site: AdapterSite,
): Promise<{ siteId: string; siteName: string | null }> {
  if (config.siteId) return { siteId: config.siteId, siteName: site.name };
  const response = await request(fetchFn, `${API_BASE}/sites`, { method: 'GET', headers: headers(config) });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new AdapterError('webflow_sites_failed', `讀取 Webflow 站點失敗（HTTP ${response.status}）`, response.status);
  }
  const sites = Array.isArray(payload.sites) ? (payload.sites as Record<string, unknown>[]) : [];
  const host = hostOf(site);
  const matched = sites.find((entry) => {
    const customDomains = Array.isArray(entry.customDomains)
      ? (entry.customDomains as Record<string, unknown>[]).map((domain) => String(domain.url ?? ''))
      : [];
    const shortName = String(entry.shortName ?? '');
    return (
      customDomains.some((domain) => domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').startsWith(host)) ||
      (shortName && host.startsWith(shortName))
    );
  });
  const picked = matched ?? sites[0];
  if (!picked?.id) throw new AdapterError('webflow_site_missing', 'Webflow 找不到可用站點');
  return { siteId: String(picked.id), siteName: String(picked.displayName ?? site.name) };
}

async function resolveCollection(
  fetchFn: typeof fetch,
  config: WebflowConfig,
  siteId: string,
): Promise<WebflowCollection> {
  const response = await request(fetchFn, `${API_BASE}/sites/${siteId}/collections`, {
    method: 'GET',
    headers: headers(config),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new AdapterError('webflow_collections_failed', `讀取 Webflow collections 失敗（HTTP ${response.status}）`, response.status);
  }
  const collections = Array.isArray(payload.collections)
    ? (payload.collections as unknown as WebflowCollection[])
    : [];
  if (collections.length === 0) throw new AdapterError('webflow_collection_missing', '站點沒有任何 collection');
  if (config.collectionId) {
    const exact = collections.find((collection) => collection.id === config.collectionId);
    if (!exact) throw new AdapterError('webflow_collection_not_found', '憑證指定的 collection_id 不存在');
    return exact;
  }
  // 優先挑有 RichText 欄位的 collection（文章用），否則第一個
  return (
    collections.find((collection) => (collection.fields ?? []).some((field) => field.type === 'RichText')) ??
    collections[0]
  );
}

function pickFields(
  collection: WebflowCollection,
  config: WebflowConfig,
): { title: string; slug: string; body: string | null; excerpt: string | null } {
  const fields = collection.fields ?? [];
  const bySlug = new Map(fields.map((field) => [String(field.slug ?? ''), field]));
  const title = config.fieldMap.title || (bySlug.has('name') ? 'name' : fields[0]?.slug || 'name');
  const slug = config.fieldMap.slug || (bySlug.has('slug') ? 'slug' : 'slug');
  const body =
    config.fieldMap.body ||
    fields.find((field) => field.type === 'RichText')?.slug ||
    null;
  const excerpt =
    config.fieldMap.excerpt ||
    fields.find(
      (field) =>
        field.type === 'PlainText' &&
        field.slug !== title &&
        field.slug !== slug,
    )?.slug ||
    null;
  return { title, slug, body, excerpt };
}

export const webflowAdapter: ContentAdapter = {
  name: 'webflow',

  supports(mode) {
    return mode === 'draft' || mode === 'direct';
  },

  async testConnection({ site, credentials, fetchImpl }): Promise<AdapterTestResult> {
    const fetchFn = fetchImpl ?? fetch;
    const checks: AdapterTestResult['checks'] = [];
    let config: WebflowConfig;
    try {
      config = parseCredential(credentials.secret);
      checks.push({ id: 'credential', label: 'API token 格式', ok: true, detail: '已提供' });
    } catch (error) {
      checks.push({
        id: 'credential',
        label: 'API token 格式',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, checks };
    }

    try {
      const resolved = await resolveSiteId(fetchFn, config, site);
      checks.push({ id: 'site', label: '站點', ok: true, detail: resolved.siteName ?? resolved.siteId });
      const collection = await resolveCollection(fetchFn, config, resolved.siteId);
      checks.push({
        id: 'collection',
        label: 'Collection',
        ok: true,
        detail: `${collection.displayName ?? collection.id}（${collection.fields?.length ?? 0} 個欄位）`,
      });
    } catch (error) {
      checks.push({
        id: 'site',
        label: '站點／Collection',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    return { ok: checks.every((check) => check.ok), checks };
  },

  async createArticle({ site, credentials, article, fetchImpl }): Promise<AdapterArticleResult> {
    const fetchFn = fetchImpl ?? fetch;
    const config = parseCredential(credentials.secret);
    const resolved = await resolveSiteId(fetchFn, config, site);
    const collection = await resolveCollection(fetchFn, config, resolved.siteId);
    const fields = pickFields(collection, config);

    const fieldData: Record<string, unknown> = {
      [fields.title]: article.title,
      [fields.slug]: article.slug,
    };
    if (fields.body) fieldData[fields.body] = article.bodyHtml;
    if (fields.excerpt) fieldData[fields.excerpt] = article.excerpt;

    const response = await request(
      fetchFn,
      `${API_BASE}/collections/${collection.id}/items${site.publishMode === 'direct' ? '?live=true' : ''}`,
      { method: 'POST', headers: headers(config), body: JSON.stringify({ fieldData, isArchived: false, isDraft: site.publishMode !== 'direct' }) },
    );
    const payload = await readJson(response);
    if (!response.ok) {
      throw new AdapterError(
        'webflow_publish_failed',
        `Webflow 建立 item 失敗（HTTP ${response.status}）：${String((payload.message as string | undefined) ?? '').slice(0, 200)}`,
        response.status,
      );
    }
    const externalId = payload.id ? String(payload.id) : null;
    return {
      ok: Boolean(externalId),
      // API 不回傳公開 URL；worker 會把這類結果落成 draft_published（誠實標示待站方發佈）
      externalId,
      liveUrl: null,
      draftUrl: null,
      httpStatus: response.status,
      raw: {
        id: externalId,
        collection_id: collection.id,
        collection_slug: collection.slug ?? null,
        field_data_keys: Object.keys(fieldData),
        note: 'Webflow 未回傳公開 URL；請在 Webflow 發佈後回填',
      },
    };
  },

  /**
   * 真正刪除 Webflow CMS item：DELETE /v2/collections/{collection}/items/{id}
   * 建議憑證 JSON 明確指定 collection_id；未指定時沿用「第一個 RichText collection」推測。
   */
  async deleteArticle({ site, credentials, externalId, fetchImpl }): Promise<AdapterDeleteResult> {
    const fetchFn = fetchImpl ?? fetch;
    const config = parseCredential(credentials.secret);
    const resolved = await resolveSiteId(fetchFn, config, site);
    const collection = await resolveCollection(fetchFn, config, resolved.siteId);
    const response = await request(
      fetchFn,
      `${API_BASE}/collections/${collection.id}/items/${encodeURIComponent(externalId)}`,
      { method: 'DELETE', headers: headers(config) },
    );
    const payload = await readJson(response);
    if (response.status === 404 || response.status === 410) {
      return { ok: true, alreadyGone: true, httpStatus: response.status, raw: payload };
    }
    if (!response.ok) {
      throw new AdapterError(
        'webflow_delete_failed',
        `Webflow 刪除 item 失敗（HTTP ${response.status}）`,
        response.status,
      );
    }
    return { ok: true, alreadyGone: false, httpStatus: response.status, raw: payload };
  },
};
