import { supabase } from '@/lib/supabase';
import {
  AdCreativeParseError,
  adErrorMessage,
  normalizeAdBrief,
  parseAdCreativeResponse,
  validateAdBrief,
  type AdBrief,
  type AdCreativeResult,
  type AdProvider,
} from '@/lib/adCreative';

export type AdServiceStatus = 'ready' | 'missing' | 'unknown';

export class AdCreativeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AdCreativeError';
    this.code = code;
  }
}

/**
 * 探測生成服務是否存在：
 *   - 404 → 函式未部署
 *   - 401／405／200 → 函式已部署（GET 會被 gateway 或函式擋掉，屬正常）
 * 用簡單 GET（不帶自訂 header），避免 preflight 把「未部署」誤判成網絡錯誤。
 */
export async function checkAdCreativeService(): Promise<AdServiceStatus> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  if (!supabaseUrl) return 'unknown';
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ad-creative-writer`, {
      method: 'GET',
      cache: 'no-store',
    });
    return response.status === 404 ? 'missing' : 'ready';
  } catch {
    return 'unknown';
  }
}

interface AdCreativeResponseData {
  angles?: unknown;
  provider?: unknown;
  model?: unknown;
  latencyMs?: unknown;
  generatedAt?: unknown;
  warnings?: unknown;
}

interface AdCreativePayload {
  ok?: boolean;
  data?: AdCreativeResponseData;
  code?: string;
  error?: string;
}

function readProvider(value: unknown): AdProvider {
  if (value === 'grok' || value === 'gemini') return value;
  return null;
}

export interface GenerateAdCreativeOptions {
  signal?: AbortSignal;
}

/**
 * 呼叫 ad-creative-writer，並在瀏覽器再做一次解析／限長，避免直接信任網絡回應。
 */
export async function generateAdCreative(
  brief: AdBrief,
  options: GenerateAdCreativeOptions = {},
): Promise<AdCreativeResult> {
  const normalized = normalizeAdBrief(brief);
  const issues = validateAdBrief(normalized);
  if (issues.length > 0) {
    throw new AdCreativeError('invalid_input', issues[0].message);
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AdCreativeError('config_missing', adErrorMessage('config_missing'));
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 135_000);
  const abortFromCaller = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', abortFromCaller);
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/ad-creative-writer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ brief: normalized }),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    if (aborted && options.signal?.aborted) {
      throw new AdCreativeError('aborted', '已取消生成');
    }
    if (aborted) {
      throw new AdCreativeError('timeout', adErrorMessage('timeout'));
    }
    const networkLike = error instanceof TypeError;
    throw new AdCreativeError(
      networkLike ? 'network_or_cors' : 'network',
      networkLike ? adErrorMessage('network_or_cors') : adErrorMessage('network'),
    );
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }

  if (response.status === 404) {
    throw new AdCreativeError('not_deployed', adErrorMessage('not_deployed'));
  }

  const payload = (await response.json().catch(() => ({}))) as AdCreativePayload;

  if (!response.ok || payload.ok === false || !payload.data) {
    const code = String(payload.code || `http_${response.status}`);
    const serverMessage = typeof payload.error === 'string' ? payload.error.trim() : '';
    throw new AdCreativeError(code, serverMessage || adErrorMessage(code));
  }

  const data = payload.data;
  try {
    const result = parseAdCreativeResponse(data, {
      brief: normalized,
      provider: readProvider(data.provider),
      model: typeof data.model === 'string' ? data.model : '',
      latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : 0,
      generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : undefined,
    });

    const serverWarnings = Array.isArray(data.warnings)
      ? data.warnings.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : [];
    if (serverWarnings.length > 0) {
      result.warnings = Array.from(new Set([...result.warnings, ...serverWarnings]));
    }
    return result;
  } catch (error) {
    if (error instanceof AdCreativeParseError) {
      throw new AdCreativeError('bad_json', error.message);
    }
    throw new AdCreativeError(
      'bad_json',
      error instanceof Error ? error.message : adErrorMessage('bad_json'),
    );
  }
}
