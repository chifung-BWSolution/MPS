/**
 * ALT Pilot · 前端 API 封裝
 *
 * 兩條通道：
 *   1. supabase-js 直連（RLS）：runs / suggestions / settings / 關鍵字
 *   2. Edge Function `alt-pilot`：抓頁、抓圖、LLM 生成
 *
 * 所有錯誤都收斂成 AltApiError；資料表未建立時是 AltSchemaMissingError，
 * 由外殼顯示「功能尚未啟用」而不是白屏。
 */

import { supabase } from '@/lib/supabase';
import {
  ALT_FUNCTION_NAME,
  ALT_SCHEMA_MISSING_MESSAGE,
  DEFAULT_ALT_SETTINGS,
  type AltImageLocation,
  type AltKeywordOption,
  type AltRisk,
  type AltRunRow,
  type AltRunStatus,
  type AltSettingsRow,
  type AltSuggestionRow,
  type AltSuggestionStatus,
  type AltUsageSummary,
} from '@/lib/altTypes.ts';

export class AltApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'AltApiError';
    this.code = code;
    this.status = status;
  }
}

export class AltSchemaMissingError extends AltApiError {
  constructor(message: string = ALT_SCHEMA_MISSING_MESSAGE) {
    super('schema_missing', message);
    this.name = 'AltSchemaMissingError';
  }
}

const SCHEMA_MISSING_PATTERN =
  /42P01|PGRST205|PGRST204|does not exist|could not find the table|schema cache|relation .* does not exist/i;

export function isAltSchemaMissing(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof AltSchemaMissingError) return true;
  const shape = error as { code?: string; message?: string; details?: string; hint?: string };
  const code = String(shape.code || '');
  if (code === 'schema_missing' || code === '42P01' || code === 'PGRST205' || code === 'PGRST204') {
    return true;
  }
  const text = [shape.message, shape.details, shape.hint].filter(Boolean).join(' ');
  return SCHEMA_MISSING_PATTERN.test(text);
}

export function toAltApiError(error: unknown): AltApiError {
  if (error instanceof AltApiError) return error;
  if (isAltSchemaMissing(error)) return new AltSchemaMissingError();
  const shape = error as { message?: string; code?: string; status?: number };
  return new AltApiError(shape?.code || 'unknown', shape?.message || 'ALT Pilot 暫時無法使用', shape?.status);
}

export function altErrorMessage(error: unknown): string {
  return toAltApiError(error).message;
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anonKey) {
    throw new AltApiError('config_missing', '缺少 Supabase 環境設定，無法呼叫 ALT Pilot。');
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || anonKey;
  return {
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
  };
}

/** 呼叫 Edge Function `alt-pilot`；契約：`{ ok:true, data }` 或 `{ ok:false, code, error }`。 */
export async function invokeAltFunction<TResponse>(
  action: 'discover' | 'analyze' | 'generate' | 'regenerate' | 'verify',
  payload: Record<string, unknown> = {},
): Promise<TResponse> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  let headers: Record<string, string>;
  try {
    headers = await authHeaders();
  } catch (error) {
    throw toAltApiError(error);
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${ALT_FUNCTION_NAME}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (error) {
    throw new AltApiError(
      'network_error',
      `無法連線 ALT Pilot：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; data?: unknown; code?: string; error?: string; message?: string }
    | null;

  if (!response.ok || body?.ok === false) {
    const code = body?.code || `http_${response.status}`;
    const message = body?.error || body?.message || `${response.status} ${response.statusText}`;
    if (isAltSchemaMissing({ code, message })) throw new AltSchemaMissingError();
    throw new AltApiError(code, message, response.status);
  }

  if (body && typeof body === 'object' && 'data' in body) {
    return body.data as TResponse;
  }
  return body as TResponse;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asStatus(value: unknown): AltSuggestionStatus {
  return value === 'approved' ||
    value === 'rejected' ||
    value === 'exported' ||
    value === 'failed' ||
    value === 'pending'
    ? value
    : 'pending';
}

function asRunStatus(value: unknown): AltRunStatus {
  return value === 'analyzed' ||
    value === 'generating' ||
    value === 'ready' ||
    value === 'exported' ||
    value === 'failed' ||
    value === 'archived'
    ? value
    : 'analyzed';
}

function asRisk(value: unknown): AltRisk {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}

function asLocation(value: unknown): AltImageLocation {
  return value === 'header' || value === 'main' || value === 'footer' ? value : 'unknown';
}

export function normalizeAltSettings(row: Partial<AltSettingsRow> | null | undefined): AltSettingsRow {
  return {
    ...DEFAULT_ALT_SETTINGS,
    ...(row || {}),
    enabled: row?.enabled === true,
    model: asString(row?.model, DEFAULT_ALT_SETTINGS.model),
    fallback_model: asString(row?.fallback_model, DEFAULT_ALT_SETTINGS.fallback_model),
    daily_call_limit: Math.max(0, Math.round(asNumber(row?.daily_call_limit, DEFAULT_ALT_SETTINGS.daily_call_limit))),
    max_images_per_run: Math.max(1, Math.round(asNumber(row?.max_images_per_run, DEFAULT_ALT_SETTINGS.max_images_per_run))),
    max_images_per_call: Math.max(1, Math.round(asNumber(row?.max_images_per_call, DEFAULT_ALT_SETTINGS.max_images_per_call))),
  };
}

export function normalizeAltRun(row: Partial<AltRunRow> | null | undefined): AltRunRow {
  return {
    id: asString(row?.id),
    site_id: row?.site_id ? String(row.site_id) : null,
    page_url: asString(row?.page_url),
    page_host: asString(row?.page_host),
    page_title: asString(row?.page_title),
    page_lang: asString(row?.page_lang),
    page_hash: asString(row?.page_hash),
    context_summary: asString(row?.context_summary),
    keyword: asString(row?.keyword),
    status: asRunStatus(row?.status),
    image_count: Math.max(0, Math.round(asNumber(row?.image_count))),
    generated_count: Math.max(0, Math.round(asNumber(row?.generated_count))),
    approved_count: Math.max(0, Math.round(asNumber(row?.approved_count))),
    model: asString(row?.model),
    error: row?.error ? String(row.error) : null,
    created_by: row?.created_by ? String(row.created_by) : null,
    created_at: asString(row?.created_at, new Date(0).toISOString()),
    updated_at: asString(row?.updated_at, new Date(0).toISOString()),
  };
}

function normalizeIssues(value: unknown): AltSuggestionRow['issues'] {
  if (!Array.isArray(value)) return [];
  const issues: AltSuggestionRow['issues'] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      issues.push({ id: 'model_note', severity: 'soft', message: item });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const message = asString(record.message).trim();
    if (!message) continue;
    issues.push({
      id: asString(record.id, 'issue'),
      severity: record.severity === 'hard' ? 'hard' : 'soft',
      message,
    });
  }
  return issues;
}

export function normalizeAltSuggestion(
  row: Partial<AltSuggestionRow> | null | undefined,
): AltSuggestionRow {
  return {
    id: asString(row?.id),
    run_id: asString(row?.run_id),
    image_url: asString(row?.image_url),
    image_host: asString(row?.image_host),
    image_hash: row?.image_hash ? String(row.image_hash) : null,
    filename: asString(row?.filename),
    location: asLocation(row?.location),
    current_alt: asString(row?.current_alt),
    context_excerpt: asString(row?.context_excerpt),
    suggested_alt: asString(row?.suggested_alt),
    short_alt: asString(row?.short_alt),
    alternatives: asArray<string>(row?.alternatives)
      .map((item) => String(item || '').trim())
      .filter(Boolean),
    rationale: asString(row?.rationale),
    keyword: asString(row?.keyword),
    confidence: Math.min(1, Math.max(0, asNumber(row?.confidence, 0.5))),
    risk: asRisk(row?.risk),
    issues: normalizeIssues(row?.issues),
    decorative: Boolean(row?.decorative),
    provider: asString(row?.provider),
    status: asStatus(row?.status),
    final_alt: row?.final_alt == null ? null : String(row.final_alt),
    reviewed_by: row?.reviewed_by ? String(row.reviewed_by) : null,
    reviewed_at: row?.reviewed_at ? String(row.reviewed_at) : null,
    created_at: asString(row?.created_at, new Date(0).toISOString()),
    updated_at: asString(row?.updated_at, new Date(0).toISOString()),
  };
}

export async function fetchAltSettings(): Promise<AltSettingsRow> {
  const { data, error } = await supabase
    .from('alt_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw toAltApiError(error);
  return normalizeAltSettings((data as Partial<AltSettingsRow> | null) ?? null);
}

export function hongKongDayStartIso(now = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const startUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - 8 * 60 * 60 * 1000;
  return new Date(startUtc).toISOString();
}

export async function fetchAltUsageToday(limit: number): Promise<AltUsageSummary> {
  const start = hongKongDayStartIso();
  const [usageResult, runResult] = await Promise.all([
    supabase
      .from('alt_llm_usage')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start),
    supabase
      .from('alt_runs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start),
  ]);
  if (usageResult.error) throw toAltApiError(usageResult.error);
  if (runResult.error) throw toAltApiError(runResult.error);
  return {
    today: usageResult.count ?? 0,
    limit,
    analyses: runResult.count ?? 0,
  };
}

export async function listAltRuns(limit = 30): Promise<AltRunRow[]> {
  const { data, error } = await supabase
    .from('alt_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) throw toAltApiError(error);
  return (data || []).map((row) => normalizeAltRun(row as Partial<AltRunRow>));
}

export async function fetchAltRunBundle(runId: string): Promise<{
  run: AltRunRow;
  suggestions: AltSuggestionRow[];
}> {
  const [runResult, suggestionResult] = await Promise.all([
    supabase.from('alt_runs').select('*').eq('id', runId).maybeSingle(),
    supabase
      .from('alt_suggestions')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true }),
  ]);

  if (runResult.error) throw toAltApiError(runResult.error);
  if (suggestionResult.error) throw toAltApiError(suggestionResult.error);
  if (!runResult.data) throw new AltApiError('not_found', '找不到這次 ALT 分析紀錄。');

  return {
    run: normalizeAltRun(runResult.data as Partial<AltRunRow>),
    suggestions: (suggestionResult.data || []).map((row) =>
      normalizeAltSuggestion(row as Partial<AltSuggestionRow>),
    ),
  };
}

export async function fetchSeoKeywordOptions(siteId: string): Promise<AltKeywordOption[]> {
  if (!siteId) return [];
  const { data, error } = await supabase
    .from('seo_keywords')
    .select('id, keyword, level, search_volume, target_page')
    .eq('website_profile_id', siteId)
    .order('level', { ascending: true })
    .order('search_volume', { ascending: false })
    .limit(200);
  if (error) throw toAltApiError(error);
  return (data || []).map((row) => ({
    id: String(row.id),
    keyword: String(row.keyword || ''),
    level: String(row.level || 'level_3'),
    search_volume: row.search_volume == null ? null : Number(row.search_volume),
    target_page: row.target_page ? String(row.target_page) : null,
  }));
}

export async function updateAltSuggestion(
  id: string,
  patch: Pick<Partial<AltSuggestionRow>, 'suggested_alt' | 'short_alt' | 'final_alt' | 'status'>,
): Promise<AltSuggestionRow> {
  const { data, error } = await supabase
    .from('alt_suggestions')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toAltApiError(error);
  return normalizeAltSuggestion(data as Partial<AltSuggestionRow>);
}

export async function updateAltRunKeyword(runId: string, keyword: string): Promise<void> {
  const { error } = await supabase
    .from('alt_runs')
    .update({ keyword })
    .eq('id', runId);
  if (error) throw toAltApiError(error);
}

export async function approveAltSuggestions(
  ids: string[],
  reviewerId: string | null,
): Promise<AltSuggestionRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('alt_suggestions')
    .select('id, suggested_alt, status, decorative')
    .in('id', ids);
  if (error) throw toAltApiError(error);

  const reviewable = (data || []).filter(
    (row) =>
      row.status !== 'approved' &&
      typeof row.suggested_alt === 'string' &&
      (row.suggested_alt.trim().length > 0 || row.decorative === true),
  );
  if (reviewable.length === 0) return [];

  const reviewedAt = new Date().toISOString();
  const results = await Promise.all(
    reviewable.map(async (row) => {
      const { data: updated, error: updateError } = await supabase
        .from('alt_suggestions')
        .update({
          status: 'approved',
          final_alt: row.suggested_alt,
          reviewed_by: reviewerId,
          reviewed_at: reviewedAt,
        })
        .eq('id', row.id)
        .select('*')
        .single();
      if (updateError) throw toAltApiError(updateError);
      return normalizeAltSuggestion(updated as Partial<AltSuggestionRow>);
    }),
  );
  return results;
}

export async function rejectAltSuggestions(
  ids: string[],
  reviewerId: string | null,
): Promise<AltSuggestionRow[]> {
  if (ids.length === 0) return [];
  const reviewedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('alt_suggestions')
    .update({
      status: 'rejected',
      final_alt: null,
      reviewed_by: reviewerId,
      reviewed_at: reviewedAt,
    })
    .in('id', ids)
    .select('*');
  if (error) throw toAltApiError(error);
  return (data || []).map((row) => normalizeAltSuggestion(row as Partial<AltSuggestionRow>));
}

export async function resetAltSuggestion(id: string): Promise<AltSuggestionRow> {
  const { data, error } = await supabase
    .from('alt_suggestions')
    .update({
      status: 'pending',
      final_alt: null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toAltApiError(error);
  return normalizeAltSuggestion(data as Partial<AltSuggestionRow>);
}

export async function deleteAltRun(runId: string): Promise<void> {
  await invokeAltFunction<{ deleted: string }>('delete_run', { run_id: runId });
}

export async function markAltRunExported(runId: string, approvedCount: number): Promise<void> {
  const { error } = await supabase
    .from('alt_runs')
    .update({ status: 'exported', approved_count: approvedCount })
    .eq('id', runId);
  if (error) throw toAltApiError(error);
}
