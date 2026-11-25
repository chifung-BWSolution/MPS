/**
 * 社媒自動化營運 · 前端 API 封裝
 *
 * 兩條通道：
 *   1. supabase-js 直連（RLS）：一般讀寫
 *   2. Edge Functions：長任務、需要憑證／密鑰的操作
 *
 * 部署順序顛倒時（表未建立），所有錯誤都會被歸一成
 * ContentSchemaMissingError，由外殼顯示「功能尚未啟用」而非白屏。
 */

import { supabase } from '@/lib/supabase';
import type {
  ContentAsset,
  ContentApiErrorShape,
  ContentSettings,
} from '@/lib/contentTypes.ts';
import { CONTENT_NOT_ENABLED_MESSAGE } from '@/lib/contentTypes.ts';

export const CONTENT_FUNCTIONS = {
  sites: 'content-sites',
  keywords: 'content-keywords',
  worker: 'content-worker',
  publish: 'content-publish',
  digest: 'content-digest',
} as const;

export class ContentApiError extends Error implements ContentApiErrorShape {
  readonly code: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(code: string, message: string, options?: { details?: unknown; status?: number }) {
    super(message);
    this.name = 'ContentApiError';
    this.code = code;
    this.details = options?.details;
    this.status = options?.status;
  }
}

export class ContentSchemaMissingError extends ContentApiError {
  constructor(message: string = CONTENT_NOT_ENABLED_MESSAGE) {
    super('schema_missing', message);
    this.name = 'ContentSchemaMissingError';
  }
}

const SCHEMA_MISSING_PATTERN =
  /42P01|PGRST205|PGRST204|does not exist|could not find the table|schema cache|relation .* does not exist/i;

/** Postgres 42P01 / PostgREST PGRST205 一律視為「功能尚未啟用」 */
export function isContentSchemaMissing(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof ContentSchemaMissingError) return true;
  const shape = error as { code?: string; message?: string; details?: string; hint?: string };
  const code = String(shape.code || '');
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') return true;
  const text = [shape.message, shape.details, shape.hint].filter(Boolean).join(' ');
  return SCHEMA_MISSING_PATTERN.test(text);
}

export function toContentApiError(error: unknown): ContentApiError {
  if (error instanceof ContentApiError) return error;
  if (isContentSchemaMissing(error)) return new ContentSchemaMissingError();
  const shape = error as { message?: string; code?: string; status?: number };
  return new ContentApiError(
    shape?.code || 'unknown',
    shape?.message || '內容自動化服務暫時無法使用',
    { status: shape?.status },
  );
}

/** 型別守衛：讓上層可以安全地讀取 code（例如 409 version_conflict） */
export function isContentApiError(value: unknown): value is ContentApiError {
  return value instanceof ContentApiError;
}

/** UI 一律用這支取可顯示的錯誤訊息（含降級文案） */
export function contentErrorMessage(error: unknown): string {
  const apiError = toContentApiError(error);
  return apiError.message;
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anonKey) {
    throw new ContentApiError('config_missing', '缺少 Supabase 環境設定，無法呼叫內容自動化服務。');
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || anonKey;
  return {
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
  };
}

/**
 * 呼叫 content-* Edge Function。
 * 契約：`{ ok: true, data }` 或 `{ ok: false, code, error }`（PRD §7.1）。
 */
export async function invokeContentFunction<TResponse>(
  functionName: string,
  body: Record<string, unknown> = {},
): Promise<TResponse> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  let headers: Record<string, string>;
  try {
    headers = await authHeaders();
  } catch (error) {
    throw toContentApiError(error);
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ContentApiError(
      'network_error',
      `無法連線 ${functionName}：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; data?: unknown; error?: string; code?: string; message?: string }
    | null;

  if (!response.ok || payload?.ok === false) {
    const code = payload?.code || `http_${response.status}`;
    const message =
      payload?.error || payload?.message || `${response.status} ${response.statusText}`;
    throw new ContentApiError(code, message, { status: response.status, details: payload });
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as TResponse;
  }
  return payload as TResponse;
}

/**
 * 探測資料表是否就緒：用最小成本查詢 content_settings。
 * 回傳 true = 已就緒；false = 功能尚未啟用（不拋錯）。
 */
export async function detectContentSchema(): Promise<boolean> {
  try {
    const { error } = await supabase.from('content_settings').select('id').limit(1);
    if (!error) return true;
    if (isContentSchemaMissing(error)) return false;
    throw error;
  } catch (error) {
    if (isContentSchemaMissing(error)) return false;
    throw toContentApiError(error);
  }
}

/** 全域設定（單列）；缺列時回傳安全的出廠預設（不寫入） */
export async function fetchContentSettings(): Promise<ContentSettings> {
  const { data, error } = await supabase
    .from('content_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw toContentApiError(error);
  if (!data) return { ...FALLBACK_SETTINGS };
  return normalizeSettings(data as Partial<ContentSettings>);
}

export const FALLBACK_SETTINGS: ContentSettings = {
  id: 'default',
  model: 'gemini-2.5-flash',
  daily_article_limit: 0,
  daily_llm_call_limit: 30,
  digest_time: '09:00',
  digest_enabled: false,
  digest_recipients: [],
  breaker_mode: 'full',
  feature_flags: {},
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export function normalizeSettings(row: Partial<ContentSettings> | null): ContentSettings {
  return {
    ...FALLBACK_SETTINGS,
    ...(row || {}),
    daily_article_limit: Number(row?.daily_article_limit ?? 0),
    daily_llm_call_limit: Number(row?.daily_llm_call_limit ?? 30),
    digest_recipients: Array.isArray(row?.digest_recipients) ? row!.digest_recipients! : [],
    feature_flags: (row?.feature_flags as Record<string, unknown>) || {},
  };
}

/** private bucket → 簽名 URL（有效期 ≤ 1 小時，PRD §6.4 規則 4） */
export async function signedAssetUrl(
  asset: Pick<ContentAsset, 'bucket' | 'storage_path'> | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!asset?.storage_path) return null;
  const { data, error } = await supabase.storage
    .from(asset.bucket || 'content-assets')
    .createSignedUrl(asset.storage_path, Math.min(3600, Math.max(60, expiresInSeconds)));
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** 批次取簽名 URL（素材面板用），失敗的項目略過 */
export async function signedAssetUrls(
  assets: readonly Pick<ContentAsset, 'id' | 'bucket' | 'storage_path'>[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    assets.map(async (asset) => {
      const url = await signedAssetUrl(asset, expiresInSeconds);
      return url ? ([asset.id, url] as const) : null;
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => !!entry));
}

/** 上傳素材到 private bucket，並回傳 storage path */
export async function uploadContentAsset(params: {
  file: File | Blob;
  filename: string;
  siteId?: string | null;
  contentType?: string;
}): Promise<{ path: string; bucket: string }> {
  const bucket = 'content-assets';
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safeName = params.filename.replace(/[^\w.-]+/g, '_');
  const prefix = params.siteId ? `${params.siteId}` : 'shared';
  const path = `${prefix}/${stamp}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(bucket).upload(path, params.file, {
    contentType: params.contentType,
    upsert: false,
  });
  if (error) throw new ContentApiError('upload_failed', error.message);
  return { path, bucket };
}
