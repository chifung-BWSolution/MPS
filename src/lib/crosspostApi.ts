import { supabase } from '@/lib/supabase';
import {
  PLATFORM_ORDER,
  countChars,
  deriveSetTitle,
  isCopyPlatform,
  isUuid,
  normalizeBrief,
  validateBrief,
  type CopyBrief,
  type CopyLanguage,
  type CopyPlatform,
  type CopyVariant,
} from '@/lib/crosspost';

export type CrosspostProvider = 'grok' | 'gemini';

export interface CrosspostGeneration {
  variants: CopyVariant[];
  provider: CrosspostProvider;
  model: string;
  latencyMs: number;
  missingPlatforms: CopyPlatform[];
}

export interface SavedCopySet {
  id: string;
  title: string;
  brief: CopyBrief;
  variants: CopyVariant[];
  provider: CrosspostProvider | null;
  model: string | null;
  createdAt: string;
  createdByName: string | null;
}

export class CrosspostError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CrosspostError';
    this.code = code;
  }
}

export function isMissingTableError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  if (!candidate) return false;
  if (candidate.code === '42P01') return true;
  const message = String(candidate.message || '').toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('undefined table') ||
    message.includes('找不到')
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  const candidate = error as { message?: string } | null | undefined;
  return candidate?.message || fallback;
}

function asLanguage(value: unknown): CopyLanguage {
  return value === 'zh-TW' || value === 'zh-CN' || value === 'zh-HK' ? value : 'zh-HK';
}

// ============================================================
// 生成（Edge Function）
// ============================================================

export type CrosspostServiceStatus = 'ready' | 'missing' | 'unknown';

/**
 * 探測生成服務是否存在：
 *   - 404 → 函式未部署
 *   - 401／405／200 → 函式已部署（GET 會被 gateway 或函式擋掉，屬正常）
 * 用簡單 GET（不帶自訂 header），避免 preflight 把「未部署」誤判成網絡錯誤。
 */
export async function checkCrosspostService(): Promise<CrosspostServiceStatus> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  if (!supabaseUrl) return 'unknown';
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/crosspost-writer`, {
      method: 'GET',
      cache: 'no-store',
    });
    return response.status === 404 ? 'missing' : 'ready';
  } catch {
    return 'unknown';
  }
}

export async function generateCrosspost(brief: CopyBrief): Promise<CrosspostGeneration> {
  const normalized = normalizeBrief(brief);
  const validationError = validateBrief(normalized);
  if (validationError) throw new CrosspostError('invalid_input', validationError);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new CrosspostError('config_missing', '系統未設定 Supabase 連線');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 135_000);

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/crosspost-writer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brief: normalized,
        platforms: [...PLATFORM_ORDER],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    if (aborted) {
      throw new CrosspostError('timeout', '生成逾時，請重試');
    }
    const networkLike = error instanceof TypeError;
    throw new CrosspostError(
      networkLike ? 'network_or_cors' : 'network',
      networkLike
        ? '無法連線到生成服務：crosspost-writer 可能尚未部署，或請求被瀏覽器阻擋'
        : '網絡連線失敗，請檢查網絡後重試',
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    throw new CrosspostError(
      'not_deployed',
      '生成服務未部署（404）：請先部署 crosspost-writer',
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: {
      variants?: unknown;
      provider?: unknown;
      model?: unknown;
      latencyMs?: unknown;
      missingPlatforms?: unknown;
    };
    code?: string;
    error?: string;
  };

  if (!response.ok || payload.ok === false || !payload.data) {
    throw new CrosspostError(
      String(payload.code || `http_${response.status}`),
      String(payload.error || `生成失敗（${response.status}）`),
    );
  }

  const rawVariants = Array.isArray(payload.data.variants) ? payload.data.variants : [];
  const variants: CopyVariant[] = rawVariants
    .map((item): CopyVariant | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const platform = typeof row.platform === 'string' ? row.platform : '';
      if (!isCopyPlatform(platform)) return null;
      const body = typeof row.body === 'string' ? row.body.trim() : '';
      if (!body) return null;
      return {
        platform,
        title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null,
        previewText:
          typeof row.previewText === 'string' && row.previewText.trim()
            ? row.previewText.trim()
            : null,
        body,
        hashtags: Array.isArray(row.hashtags)
          ? row.hashtags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim()))
          : [],
      };
    })
    .filter((variant): variant is CopyVariant => Boolean(variant));

  const seenPlatforms = new Set<string>();
  const uniqueVariants = variants.filter((variant) => {
    if (seenPlatforms.has(variant.platform)) return false;
    seenPlatforms.add(variant.platform);
    return true;
  });

  if (uniqueVariants.length === 0) {
    throw new CrosspostError('bad_json', 'AI 沒有回傳可用的文案，請重試');
  }

  const provider: CrosspostProvider = payload.data.provider === 'gemini' ? 'gemini' : 'grok';
  const missingPlatforms = Array.isArray(payload.data.missingPlatforms)
    ? payload.data.missingPlatforms.filter(isCopyPlatform)
    : [];

  return {
    variants: uniqueVariants,
    provider,
    model: typeof payload.data.model === 'string' ? payload.data.model : '',
    latencyMs: typeof payload.data.latencyMs === 'number' ? payload.data.latencyMs : 0,
    missingPlatforms,
  };
}

// ============================================================
// 落庫
// ============================================================

export interface SaveCrosspostInput {
  brief: CopyBrief;
  variants: CopyVariant[];
  provider: CrosspostProvider | null;
  model: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
}

export interface SavedCrosspostRef {
  id: string;
  createdAt: string;
}

export async function saveCrosspostSet(input: SaveCrosspostInput): Promise<SavedCrosspostRef> {
  const brief = normalizeBrief(input.brief);
  const variants = input.variants.filter((variant) => Boolean(variant.body?.trim()));

  if (variants.length === 0) {
    throw new CrosspostError('empty_variants', '沒有可儲存的版本');
  }

  const setRow = {
    title: deriveSetTitle(brief.coreInfo),
    core_info: brief.coreInfo,
    audience: brief.audience,
    cta: brief.cta,
    brand_id: isUuid(brief.brandId) ? brief.brandId : null,
    brand_name: brief.brandName ?? null,
    tone: brief.tone ?? null,
    language: brief.language ?? 'zh-HK',
    extra_notes: brief.extraNotes ?? null,
    platforms: variants.map((variant) => variant.platform),
    llm_provider: input.provider,
    llm_model: input.model,
    created_by: isUuid(input.createdBy) ? input.createdBy : null,
    created_by_name: input.createdByName?.trim() || null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('crosspost_sets')
    .insert(setRow)
    .select('id, created_at')
    .single();

  if (insertError || !inserted) {
    const missingTable = isMissingTableError(insertError);
    throw new CrosspostError(
      missingTable ? 'table_missing' : String((insertError as { code?: string } | null)?.code || 'save_failed'),
      missingTable
        ? '歷史資料表尚未建立；本次結果仍可複製或下載'
        : errorMessage(insertError, '未能寫入生成紀錄'),
    );
  }

  const setId = String((inserted as { id: string }).id);
  const createdAt = String((inserted as { created_at?: string }).created_at || new Date().toISOString());

  const variantRows = variants.map((variant) => ({
    set_id: setId,
    platform: variant.platform,
    title: variant.title ?? null,
    preview_text: variant.previewText ?? null,
    body: variant.body.trim(),
    hashtags: variant.hashtags,
    char_count: countChars(variant.body.trim()),
  }));

  const { error: variantError } = await supabase.from('crosspost_variants').insert(variantRows);
  if (variantError) {
    // 補償：不留下半組資料
    await supabase.from('crosspost_sets').delete().eq('id', setId);
    const missingTable = isMissingTableError(variantError);
    throw new CrosspostError(
      missingTable ? 'table_missing' : String((variantError as { code?: string } | null)?.code || 'save_failed'),
      missingTable
        ? '歷史資料表尚未建立；本次結果仍可複製或下載'
        : errorMessage(variantError, '未能寫入各平台版本'),
    );
  }

  return { id: setId, createdAt };
}

// ============================================================
// 讀取與刪除
// ============================================================

interface CopyVariantRow {
  platform: string;
  title: string | null;
  preview_text: string | null;
  body: string;
  hashtags: string[] | null;
}

interface CopySetRow {
  id: string;
  title: string | null;
  core_info: string;
  audience: string;
  cta: string;
  brand_id: string | null;
  brand_name: string | null;
  tone: string | null;
  language: string | null;
  extra_notes: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  created_by_name: string | null;
  created_at: string;
  crosspost_variants?: CopyVariantRow[] | null;
}

function mapSetRow(row: CopySetRow): SavedCopySet {
  const variants: CopyVariant[] = (row.crosspost_variants ?? [])
    .map((variant): CopyVariant | null => {
      if (!isCopyPlatform(variant.platform)) return null;
      const body = (variant.body || '').trim();
      if (!body) return null;
      return {
        platform: variant.platform,
        title: variant.title?.trim() || null,
        previewText: variant.preview_text?.trim() || null,
        body,
        hashtags: Array.isArray(variant.hashtags) ? variant.hashtags : [],
      };
    })
    .filter((variant): variant is CopyVariant => Boolean(variant))
    .sort(
      (a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform),
    );

  const provider: CrosspostProvider | null =
    row.llm_provider === 'grok' || row.llm_provider === 'gemini' ? row.llm_provider : null;

  return {
    id: row.id,
    title: row.title?.trim() || deriveSetTitle(row.core_info),
    brief: normalizeBrief({
      coreInfo: row.core_info,
      audience: row.audience,
      cta: row.cta,
      brandId: isUuid(row.brand_id) ? row.brand_id : null,
      brandName: row.brand_name ?? undefined,
      tone: row.tone ?? undefined,
      language: asLanguage(row.language),
      extraNotes: row.extra_notes ?? undefined,
    }),
    variants,
    provider,
    model: row.llm_model ?? null,
    createdAt: row.created_at,
    createdByName: row.created_by_name ?? null,
  };
}

export async function listCrosspostSets(limit = 50): Promise<SavedCopySet[]> {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
  const { data, error } = await supabase
    .from('crosspost_sets')
    .select(
      'id, title, core_info, audience, cta, brand_id, brand_name, tone, language, extra_notes, llm_provider, llm_model, created_by_name, created_at, crosspost_variants(platform, title, preview_text, body, hashtags)',
    )
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return ((data ?? []) as unknown as CopySetRow[]).map(mapSetRow);
}

export async function deleteCrosspostSet(id: string): Promise<void> {
  const { error } = await supabase.from('crosspost_sets').delete().eq('id', id);
  if (error) throw error;
}
