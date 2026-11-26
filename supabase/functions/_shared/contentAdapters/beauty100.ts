/**
 * Beauty100 adapter（真正呼叫 Beauty100 既有 Supabase REST）
 *
 * 為什麼不是 next_custom：
 *   Beauty100 沒有 `/api/content/*` 端點，也不允許改它的程式碼。
 *   站方自己的後台就是「staff JWT + Supabase REST」，MPS 用同一條路徑，
 *   只是換成專用帳號，並把錯誤／重試／刪除語義包成 adapter 契約。
 *
 * 契約：
 *   POST {supabase}/auth/v1/token?grant_type=password        專用帳號登入
 *   GET  {supabase}/rest/v1/blog_articles?handle=eq.{slug}   查重
 *   POST {supabase}/rest/v1/blog_articles                    發佈
 *   DELETE {supabase}/rest/v1/blog_articles?id=eq.{id}       真正刪文
 *   POST {supabase}/storage/v1/object/{bucket}/{path}        封面
 *
 * 純 TS：不 import Deno API，可用 Node 注入 fetchImpl 跑契約測試。
 */

import {
  BEAUTY100_CATEGORY_LABEL,
  BEAUTY100_DEFAULT_BUCKET,
  BEAUTY100_PROBE_PREFIX,
  beauty100ArticleUrl,
  beauty100CategoryForSection,
  isBeauty100Category,
  parseBeauty100Credential,
  type Beauty100CredentialConfig,
} from '../../../../src/lib/contentBeauty100.ts';
import {
  AdapterError,
  type AdapterArticleInput,
  type AdapterArticleResult,
  type AdapterCheck,
  type AdapterCredentials,
  type AdapterDeleteResult,
  type AdapterImage,
  type AdapterSite,
  type AdapterTestResult,
  type AdapterVerifyInput,
  type AdapterVerifyResult,
  type ContentAdapter,
} from './types.ts';

const DEFAULT_TIMEOUT_MS = 20_000;
const AUTH_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 12_000;
const IMAGE_PROBE_TIMEOUT_MS = 10_000;

// ============================================================
// 小工具
// ============================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTitle(value: unknown): string {
  return trimmed(value).replace(/\s+/g, ' ');
}

function randomToken(length = 8): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
}

function safePathSegment(value: string, maxLength = 60): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
  return cleaned || 'article';
}

function readableError(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return 'Beauty100 拒絕授權：請確認專用帳號仍有 staff（admin／marketing）權限，且憑證未過期';
  }
  if (status === 404) return 'Beauty100 找不到對應資源（文章或 bucket）';
  if (status === 409) return 'Beauty100 資料衝突（slug 已存在或同時寫入）';
  if (status === 413) return 'Beauty100 拒絕：檔案太大';
  if (status === 429) return 'Beauty100 限流（429）：請稍後重試';
  if (status >= 500) return `Beauty100 伺服器錯誤（${status}）`;
  const text = body.replace(/\s+/g, ' ').trim();
  return text ? `HTTP ${status}：${text.slice(0, 180)}` : `HTTP ${status}`;
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
    if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) {
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

async function responseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function parseRows(text: string, status: number): Record<string, unknown>[] {
  if (!text.trim()) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(isRecord);
    }
    return isRecord(parsed) ? [parsed] : [];
  } catch {
    throw new AdapterError('bad_response', 'Beauty100 回應不是合法 JSON', status);
  }
}

function parseConfig(credentials: AdapterCredentials): Beauty100CredentialConfig {
  const parsed = parseBeauty100Credential(credentials.secret);
  if ('errors' in parsed) {
    throw new AdapterError(
      'invalid_credential',
      `Beauty100 憑證格式不正確：${parsed.errors.join('；')}`,
    );
  }
  return parsed.config;
}

function restHeaders(config: Beauty100CredentialConfig, token: string): Record<string, string> {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

function storageHeaders(config: Beauty100CredentialConfig, token: string): Record<string, string> {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
  };
}

function objectPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

// ============================================================
// Auth
// ============================================================

async function signIn(
  config: Beauty100CredentialConfig,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await request(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email: config.email, password: config.password }),
    },
    AUTH_TIMEOUT_MS,
  );

  if (!response.ok) {
    const body = await responseText(response);
    if (response.status === 400 || response.status === 401) {
      throw new AdapterError(
        'invalid_credential',
        'Beauty100 登入失敗：專用帳號 email 或密碼不正確',
        response.status,
      );
    }
    throw new AdapterError(
      `auth_${response.status}`,
      readableError(response.status, body),
      response.status,
    );
  }

  const text = await responseText(response);
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new AdapterError('bad_response', 'Beauty100 登入回應不是合法 JSON', response.status);
  }
  const token = isRecord(payload) ? trimmed(payload.access_token) : '';
  if (!token) {
    throw new AdapterError('auth_failed', 'Beauty100 登入回應缺少 access_token', response.status);
  }
  return token;
}

// ============================================================
// 文章查詢／寫入
// ============================================================

async function lookupByHandle(
  config: Beauty100CredentialConfig,
  token: string,
  handle: string,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown> | null> {
  const response = await request(
    fetchImpl,
    `${config.supabaseUrl}/rest/v1/blog_articles?select=id,title,handle,status,category&handle=eq.${encodeURIComponent(handle)}&limit=1`,
    { method: 'GET', headers: restHeaders(config, token) },
  );
  if (!response.ok) {
    throw new AdapterError(
      'lookup_failed',
      readableError(response.status, await responseText(response)),
      response.status,
    );
  }
  const rows = parseRows(await responseText(response), response.status);
  return rows[0] ?? null;
}

function liveUrlFor(
  site: AdapterSite,
  category: string,
  handle: string,
): string {
  const url = beauty100ArticleUrl(site.domain, category, handle);
  if (!url) {
    throw new AdapterError(
      'missing_domain',
      '站點沒有可用的網域（webandsystem_list.domain_url），無法組出 Beauty100 文章網址',
    );
  }
  return url;
}

function adoptedResult(
  row: Record<string, unknown>,
  site: AdapterSite,
  category: string,
  handle: string,
): AdapterArticleResult {
  const id = trimmed(row.id);
  if (!id) throw new AdapterError('bad_response', 'Beauty100 既有文章缺少 id');
  const remoteCategoryRaw = trimmed(row.category);
  const remoteCategory = isBeauty100Category(remoteCategoryRaw)
    ? remoteCategoryRaw
    : category;
  const liveUrl = liveUrlFor(site, remoteCategory, handle);
  return {
    ok: true,
    externalId: id,
    liveUrl,
    canonicalUrl: liveUrl,
    draftUrl: null,
    httpStatus: 200,
    raw: {
      adopted: true,
      id,
      handle,
      category: remoteCategory,
      note: 'handle 已存在且 title 相同，視為上一次成功但 MPS 未回寫',
    },
  };
}

// ============================================================
// 封面
// ============================================================

type ImageExtension = 'svg' | 'png' | 'jpg' | 'webp' | 'gif';

function extensionForImage(image: AdapterImage): ImageExtension {
  const mime = (image.contentType || '').toLowerCase();
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  const filename = (image.filename || '').toLowerCase();
  const match = /\.(svg|png|jpe?g|webp|gif)$/.exec(filename);
  if (match) return match[1] === 'jpeg' ? 'jpg' : (match[1] as ImageExtension);
  return 'png';
}

async function uploadCover(
  config: Beauty100CredentialConfig,
  token: string,
  article: AdapterArticleInput,
  fetchImpl: typeof fetch,
): Promise<{ bucket: string; path: string; url: string }> {
  const image = article.coverImage;
  if (!image || !image.bytes || image.bytes.byteLength === 0) {
    throw new AdapterError(
      'missing_cover',
      'Beauty100 發佈必須有封面圖；請先在審核工作室按「重生封面」或上傳封面',
    );
  }

  const extension = extensionForImage(image);
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const path = `mps/${month}/${safePathSegment(article.slug)}-${randomToken(8)}.${extension}`;
  const bucket = config.bucket || BEAUTY100_DEFAULT_BUCKET;

  const response = await request(
    fetchImpl,
    `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath(path)}`,
    {
      method: 'POST',
      headers: {
        ...storageHeaders(config, token),
        'Content-Type': image.contentType || 'application/octet-stream',
      },
      body: image.bytes,
    },
    30_000,
  );

  if (!response.ok) {
    const body = await responseText(response);
    if (response.status === 403 || response.status === 401) {
      throw new AdapterError(
        'cover_upload_forbidden',
        `Beauty100 不允許上傳封面到 bucket「${bucket}」：請確認 storage policy，或把憑證的 bucket 改成 public`,
        response.status,
      );
    }
    throw new AdapterError(
      'cover_upload_failed',
      `封面圖上傳失敗：${readableError(response.status, body)}`,
      response.status,
    );
  }

  const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath(path)}`;
  const readable = await probeUrl(fetchImpl, publicUrl);
  if (readable.status === null || readable.status >= 400) {
    await deleteStorageObject(config, token, bucket, path, fetchImpl);
    throw new AdapterError(
      'cover_not_public',
      `封面已上傳，但公開 URL 無法讀取（${readable.status ?? readable.error ?? '未知錯誤'}）；請確認 bucket「${bucket}」是 public`,
      readable.status,
    );
  }

  return { bucket, path, url: publicUrl };
}

async function deleteStorageObject(
  config: Beauty100CredentialConfig,
  token: string,
  bucket: string,
  path: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  try {
    const response = await request(
      fetchImpl,
      `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath(path)}`,
      {
        method: 'DELETE',
        headers: storageHeaders(config, token),
      },
      PROBE_TIMEOUT_MS,
    );
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

// ============================================================
// 驗證用的 URL 探測
// ============================================================

async function probeUrl(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs = IMAGE_PROBE_TIMEOUT_MS,
): Promise<{ status: number | null; error: string | null }> {
  try {
    let response = await request(fetchImpl, url, { method: 'HEAD', redirect: 'follow' }, timeoutMs);
    if (response.status === 405 || response.status === 501) {
      response = await request(fetchImpl, url, { method: 'GET', redirect: 'follow' }, timeoutMs);
    }
    return { status: response.status, error: null };
  } catch (error) {
    return {
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================
// Adapter
// ============================================================

export const beauty100Adapter: ContentAdapter = {
  name: 'beauty100',
  requiresCover: true,

  supports(mode) {
    // Beauty100 有 draft 狀態，但 MPS 目前只做「直接公開」；
    // 若日後要支援草稿，再另開明確流程，不要在 direct 模式偷偷建 draft。
    return mode === 'direct';
  },

  async testConnection(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterTestResult> {
    const fetchImpl = input.fetchImpl ?? fetch;
    const checks: AdapterCheck[] = [];

    let config: Beauty100CredentialConfig;
    try {
      config = parseConfig(input.credentials);
      checks.push({
        id: 'config',
        label: '憑證設定',
        ok: true,
        detail: `${config.supabaseUrl} · ${config.email}`,
      });
    } catch (error) {
      checks.push({
        id: 'config',
        label: '憑證設定',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, checks };
    }

    let token: string;
    try {
      token = await signIn(config, fetchImpl);
      checks.push({
        id: 'auth',
        label: 'Beauty100 登入',
        ok: true,
        detail: `專用帳號 ${config.email} 登入成功`,
      });
    } catch (error) {
      checks.push({
        id: 'auth',
        label: 'Beauty100 登入',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, checks };
    }

    try {
      const response = await request(
        fetchImpl,
        `${config.supabaseUrl}/rest/v1/blog_articles?select=id&limit=1`,
        { method: 'GET', headers: restHeaders(config, token) },
      );
      checks.push({
        id: 'table',
        label: '文章資料表',
        ok: response.ok,
        detail: response.ok
          ? '可以讀取 blog_articles'
          : readableError(response.status, await responseText(response)),
      });
    } catch (error) {
      checks.push({
        id: 'table',
        label: '文章資料表',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    const rawCategory = trimmed(input.site.sectionExternalId);
    if (rawCategory && !isBeauty100Category(rawCategory)) {
      checks.push({
        id: 'category',
        label: '發佈分類',
        ok: false,
        detail: `欄目 external_id「${rawCategory}」不是合法 Beauty100 分類；請改成 ${Object.keys(BEAUTY100_CATEGORY_LABEL).join('／')}`,
      });
    } else {
      const category = beauty100CategoryForSection({ external_id: rawCategory || null });
      checks.push({
        id: 'category',
        label: '發佈分類',
        ok: true,
        detail: `${category}（${BEAUTY100_CATEGORY_LABEL[category]}）`,
      });
    }

    // 上傳 probe：真正驗證「封面搬得過去」。同一個路徑覆寫，避免留下垃圾。
    const probePath = `${BEAUTY100_PROBE_PREFIX}/${randomToken(12)}.svg`;
    let uploaded = false;
    try {
      const response = await request(
        fetchImpl,
        `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${objectPath(probePath)}`,
        {
          method: 'POST',
          headers: {
            ...storageHeaders(config, token),
            'Content-Type': 'image/svg+xml',
          },
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
        },
        PROBE_TIMEOUT_MS,
      );
      uploaded = response.ok;
      checks.push({
        id: 'storage',
        label: '封面 bucket 可上傳',
        ok: response.ok,
        detail: response.ok
          ? `bucket「${config.bucket}」可上傳`
          : `bucket「${config.bucket}」上傳失敗：${readableError(response.status, await responseText(response))}`,
      });
    } catch (error) {
      checks.push({
        id: 'storage',
        label: '封面 bucket 可上傳',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    if (uploaded) {
      const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${objectPath(probePath)}`;
      const readable = await probeUrl(fetchImpl, publicUrl);
      checks.push({
        id: 'storage_public',
        label: '封面 bucket 公開可讀',
        ok: readable.status !== null && readable.status < 400,
        detail:
          readable.status !== null
            ? `HTTP ${readable.status}`
            : readable.error ?? '公開 URL 無法連線',
      });

      const cleaned = await deleteStorageObject(
        config,
        token,
        config.bucket,
        probePath,
        fetchImpl,
      );
      checks.push({
        id: 'storage_cleanup',
        label: '測試檔清理',
        ok: true,
        detail: cleaned ? '已刪除測試檔' : '測試檔刪除失敗（可忽略；不影響發佈）',
      });
    }

    return { ok: checks.every((check) => check.ok), checks };
  },

  async createArticle(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    article: AdapterArticleInput;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterArticleResult> {
    const fetchImpl = input.fetchImpl ?? fetch;
    const config = parseConfig(input.credentials);
    const article = input.article;

    const title = trimmed(article.title);
    const slug = trimmed(article.slug);
    const bodyHtml = trimmed(article.bodyHtml);
    if (!title) throw new AdapterError('invalid_article', '文章缺少標題');
    if (!slug) throw new AdapterError('invalid_article', '文章缺少 slug');
    if (/[/?#\s]/.test(slug)) {
      throw new AdapterError(
        'invalid_article',
        'slug 不可包含斜線、問號、井號或空白；請在工作室修正',
      );
    }
    if (!bodyHtml) throw new AdapterError('invalid_article', '文章沒有正文 HTML');
    if (!article.coverImage) {
      throw new AdapterError(
        'missing_cover',
        'Beauty100 發佈必須有封面圖；請先在審核工作室按「重生封面」或上傳封面',
      );
    }

    const rawSectionExternalId = trimmed(article.section?.externalId);
    if (rawSectionExternalId && !isBeauty100Category(rawSectionExternalId)) {
      throw new AdapterError(
        'invalid_category',
        `欄目 external_id「${rawSectionExternalId}」不是合法 Beauty100 分類；請改成 trending-topics／facial-care 等`,
      );
    }
    const category = beauty100CategoryForSection({
      external_id: rawSectionExternalId || null,
    });
    const liveUrl = liveUrlFor(input.site, category, slug);
    const token = await signIn(config, fetchImpl);

    const existing = await lookupByHandle(config, token, slug, fetchImpl);
    if (existing) {
      const existingStatus = trimmed(existing.status);
      if (normalizeTitle(existing.title) === normalizeTitle(title) && existingStatus === 'active') {
        return adoptedResult(existing, input.site, category, slug);
      }
      if (normalizeTitle(existing.title) === normalizeTitle(title)) {
        throw new AdapterError(
          'slug_conflict',
          `Beauty100 已有相同 slug／標題的文章，但狀態是「${existingStatus || '未知'}」而不是 active；請先在站方處理或改 slug`,
          409,
        );
      }
      throw new AdapterError(
        'slug_conflict',
        `Beauty100 已有相同 slug 的文章「${trimmed(existing.title).slice(0, 60)}」，且標題與這篇不同；請改文章的 slug 再發佈`,
        409,
      );
    }

    const cover = await uploadCover(config, token, article, fetchImpl);

    const payload = {
      handle: slug,
      title,
      author: trimmed(article.author) || 'Beauty100 編輯部',
      seo_title: trimmed(article.metaTitle) || title,
      seo_description:
        trimmed(article.metaDescription) ||
        trimmed(article.excerpt) ||
        trimmed(article.bodyMd).slice(0, 155),
      tags: Array.isArray(article.tags)
        ? article.tags.map((tag) => trimmed(tag)).filter(Boolean).slice(0, 5)
        : [],
      published_at: new Date().toISOString(),
      cover_image_url: cover.url,
      cover_image_alt: title,
      intro: bodyHtml,
      status: 'active',
      category,
      is_celebrity: false,
    };

    let response: Response;
    try {
      response = await request(fetchImpl, `${config.supabaseUrl}/rest/v1/blog_articles`, {
        method: 'POST',
        headers: {
          ...restHeaders(config, token),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      await deleteStorageObject(config, token, cover.bucket, cover.path, fetchImpl);
      throw error;
    }

    if (!response.ok) {
      const body = await responseText(response);
      // 併發：另一個 job 剛好建了同 slug。重新查一次，title 相同就 adopt。
      if (response.status === 409) {
        const raced = await lookupByHandle(config, token, slug, fetchImpl).catch(() => null);
        if (
          raced &&
          normalizeTitle(raced.title) === normalizeTitle(title) &&
          trimmed(raced.status) === 'active'
        ) {
          await deleteStorageObject(config, token, cover.bucket, cover.path, fetchImpl);
          return adoptedResult(raced, input.site, category, slug);
        }
        await deleteStorageObject(config, token, cover.bucket, cover.path, fetchImpl);
        throw new AdapterError(
          'slug_conflict',
          'Beauty100 同時有另一個請求建立了相同 slug；請重新整理後再試',
          409,
        );
      }
      await deleteStorageObject(config, token, cover.bucket, cover.path, fetchImpl);
      throw new AdapterError(
        'publish_failed',
        `Beauty100 建立文章失敗：${readableError(response.status, body)}`,
        response.status,
      );
    }

    const rows = parseRows(await responseText(response), response.status);
    const row = rows[0];
    const externalId = row ? trimmed(row.id) : '';
    if (!externalId) {
      // 204／格式異常：再查一次 handle，確認是否其實已寫入（避免誤刪剛上傳的封面）。
      const written = await lookupByHandle(config, token, slug, fetchImpl).catch(() => null);
      if (
        written &&
        normalizeTitle(written.title) === normalizeTitle(title) &&
        trimmed(written.status) === 'active'
      ) {
        return adoptedResult(written, input.site, category, slug);
      }
      await deleteStorageObject(config, token, cover.bucket, cover.path, fetchImpl);
      throw new AdapterError('bad_response', 'Beauty100 建立成功但沒有回傳文章 id', response.status);
    }

    return {
      ok: true,
      externalId,
      liveUrl,
      canonicalUrl: liveUrl,
      draftUrl: null,
      httpStatus: response.status,
      raw: {
        id: externalId,
        handle: slug,
        category,
        cover_bucket: cover.bucket,
        cover_path: cover.path,
        cover_url: cover.url,
      },
    };
  },

  async deleteArticle(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    externalId: string;
    slug?: string | null;
    cover?: { bucket: string; path: string } | null;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterDeleteResult> {
    const fetchImpl = input.fetchImpl ?? fetch;
    const config = parseConfig(input.credentials);
    const externalId = trimmed(input.externalId);
    if (!externalId) {
      throw new AdapterError('missing_external_id', '缺少 Beauty100 文章 id，無法遠端刪除');
    }

    const token = await signIn(config, fetchImpl);
    const response = await request(
      fetchImpl,
      `${config.supabaseUrl}/rest/v1/blog_articles?id=eq.${encodeURIComponent(externalId)}`,
      {
        method: 'DELETE',
        headers: {
          ...restHeaders(config, token),
          Prefer: 'return=representation',
        },
      },
    );

    if (response.status === 404 || response.status === 410) {
      return {
        ok: true,
        alreadyGone: true,
        httpStatus: response.status,
        raw: { id: externalId, note: 'already gone' },
      };
    }

    if (!response.ok) {
      throw new AdapterError(
        'delete_failed',
        `Beauty100 刪除失敗：${readableError(response.status, await responseText(response))}`,
        response.status,
      );
    }

    const rows = parseRows(await responseText(response), response.status);
    let alreadyGone = rows.length === 0;
    let deleted = rows.length > 0;

    // PostgREST 對「刪 0 列」也可能回 204；再查一次確認，避免把失敗當成功。
    if (!deleted) {
      const check = await request(
        fetchImpl,
        `${config.supabaseUrl}/rest/v1/blog_articles?id=eq.${encodeURIComponent(externalId)}&select=id&limit=1`,
        { method: 'GET', headers: restHeaders(config, token) },
      );
      if (!check.ok) {
        throw new AdapterError(
          'delete_verify_failed',
          `Beauty100 刪除後無法確認狀態：${readableError(check.status, await responseText(check))}`,
          check.status,
        );
      }
      const remaining = parseRows(await responseText(check), check.status);
      if (remaining.length > 0) {
        throw new AdapterError('delete_failed', 'Beauty100 回報刪除成功，但文章仍然存在', response.status);
      }
      // 刪除請求沒有回傳 row，且確認已不存在 → 冪等視為成功
      deleted = true;
      alreadyGone = true;
    }

    if (input.cover?.bucket && input.cover.path) {
      await deleteStorageObject(config, token, input.cover.bucket, input.cover.path, fetchImpl);
    }

    return {
      ok: true,
      alreadyGone,
      httpStatus: response.status,
      raw: { id: externalId, deleted, already_gone: alreadyGone },
    };
  },

  async verifyArticle(input: {
    site: AdapterSite;
    credentials: AdapterCredentials;
    article: AdapterVerifyInput;
    fetchImpl?: typeof fetch;
  }): Promise<AdapterVerifyResult> {
    const fetchImpl = input.fetchImpl ?? fetch;

    let config: Beauty100CredentialConfig;
    try {
      config = parseConfig(input.credentials);
    } catch (error) {
      return {
        ok: false,
        httpStatus: null,
        checks: [
          {
            id: 'beauty100_config',
            label: 'Beauty100 憑證',
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          },
        ],
        raw: null,
      };
    }

    let token: string;
    try {
      token = await signIn(config, fetchImpl);
    } catch (error) {
      return {
        ok: false,
        httpStatus: null,
        checks: [
          {
            id: 'beauty100_auth',
            label: 'Beauty100 登入',
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          },
        ],
        raw: null,
      };
    }

    const checks: AdapterCheck[] = [];
    let row: Record<string, unknown> | null = null;
    let restStatus: number | null = null;

    try {
      const response = await request(
        fetchImpl,
        `${config.supabaseUrl}/rest/v1/blog_articles?id=eq.${encodeURIComponent(input.article.externalId)}&select=id,handle,title,status,category,cover_image_url&limit=1`,
        { method: 'GET', headers: restHeaders(config, token) },
      );
      restStatus = response.status;
      const text = await responseText(response);
      if (response.ok) {
        const rows = parseRows(text, response.status);
        row = rows[0] ?? null;
      }
      checks.push({
        id: 'beauty100_row',
        label: 'Beauty100 文章存在',
        ok: Boolean(row),
        detail: row
          ? `id ${trimmed(row.id)}`
          : response.ok
            ? '找不到符合 id 的文章列'
            : readableError(response.status, text),
      });
    } catch (error) {
      checks.push({
        id: 'beauty100_row',
        label: 'Beauty100 文章存在',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    if (row) {
      checks.push({
        id: 'beauty100_status',
        label: '文章狀態 active',
        ok: trimmed(row.status) === 'active',
        detail: `目前 status=${trimmed(row.status) || '空'}`,
      });

      checks.push({
        id: 'beauty100_handle',
        label: 'handle 一致',
        ok: trimmed(row.handle) === trimmed(input.article.slug),
        detail: `站方 ${trimmed(row.handle) || '空'}／MPS ${trimmed(input.article.slug)}`,
      });

      const expectedCategory = beauty100CategoryForSection({
        external_id: input.article.sectionExternalId ?? null,
      });
      checks.push({
        id: 'beauty100_category',
        label: '發佈分類一致',
        ok: trimmed(row.category) === expectedCategory,
        detail: `站方 ${trimmed(row.category) || '空'}／預期 ${expectedCategory}`,
      });

      const expectedTitles = [input.article.title, input.article.metaTitle ?? '']
        .map(normalizeTitle)
        .filter(Boolean);
      const actualTitle = normalizeTitle(row.title);
      checks.push({
        id: 'beauty100_title',
        label: '文章標題一致',
        ok: Boolean(actualTitle) && expectedTitles.includes(actualTitle),
        detail: actualTitle ? `站方：${actualTitle.slice(0, 80)}` : '站方沒有標題',
      });

      const coverUrl = trimmed(row.cover_image_url);
      if (!coverUrl) {
        checks.push({
          id: 'beauty100_cover',
          label: '封面圖可讀',
          ok: false,
          detail: '文章沒有 cover_image_url',
        });
      } else {
        const image = await probeUrl(fetchImpl, coverUrl);
        checks.push({
          id: 'beauty100_cover',
          label: '封面圖可讀',
          ok: image.status !== null && image.status < 400,
          detail: image.status !== null ? `HTTP ${image.status}` : image.error ?? '無法連線',
        });
      }
    }

    const live = await probeUrl(fetchImpl, input.article.liveUrl, 15_000);
    checks.push({
      id: 'beauty100_live_url',
      label: '公開網址可開啟',
      ok: live.status !== null && live.status < 400,
      detail: live.status !== null ? `HTTP ${live.status}` : live.error ?? '無法連線',
    });

    return {
      ok: checks.every((check) => check.ok),
      httpStatus: live.status ?? restStatus,
      checks,
      raw: row
        ? {
            id: trimmed(row.id),
            handle: trimmed(row.handle),
            status: trimmed(row.status),
            title: trimmed(row.title),
          }
        : null,
    };
  },
};
