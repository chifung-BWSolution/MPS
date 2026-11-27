import { fetchWithAiUsage } from "../_shared/ai-usage.ts";
/**
 * ALT Pilot · LLM provider（Grok → Gemini）
 *
 * 三者都收圖片 base64，回傳純文字 JSON。Provider 只負責呼叫與用量，
 * JSON 解析與品質規則在 index.ts / altPrompt.ts。
 */

export class AltProviderError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'AltProviderError';
    this.code = code;
    this.status = status;
  }
}

export interface VisionRequest {
  system: string;
  user: string;
  mimeType: string;
  base64: string;
  model: string;
  fallbackModel: string;
}

export interface ProviderResult {
  text: string;
  provider: 'gemini' | 'grok' | 'deepseek';
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_GROK_MODEL = 'grok-4.7';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4.1-flash';
const DEFAULT_OPENCODE_GO_BASE_URL = 'https://opencode.ai/inference/go/v1';
const MAX_OUTPUT_TOKENS = 700;
// DeepSeek 會先產生 reasoning_content；max_tokens 太小會讓 content 為空。
const DEEPSEEK_MAX_OUTPUT_TOKENS = 2000;

const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
};

function asNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function estimateGeminiCost(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = GEMINI_PRICING[model] || GEMINI_PRICING[DEFAULT_GEMINI_MODEL];
  return (tokensIn / 1_000_000) * pricing.input + (tokensOut / 1_000_000) * pricing.output;
}

function pickProviderModel(
  prefix: 'gemini' | 'grok' | 'deepseek',
  requested: string,
  fallback: string,
  defaultModel: string,
): string {
  const matcher = new RegExp(`^${prefix}`, 'i');
  if (matcher.test(requested.trim())) return requested.trim();
  if (matcher.test(fallback.trim())) return fallback.trim();
  return defaultModel;
}

function geminiModel(request: VisionRequest): string {
  const envModel = (Deno.env.get('GEMINI_MODEL') || '').trim();
  return envModel || pickProviderModel('gemini', request.model, request.fallbackModel, DEFAULT_GEMINI_MODEL);
}

function grokModel(request: VisionRequest): string {
  const envModel = (Deno.env.get('GROK_MODEL') || '').trim();
  return envModel || pickProviderModel('grok', request.model, request.fallbackModel, DEFAULT_GROK_MODEL);
}

function deepseekModel(request: VisionRequest): string {
  const envModel = (Deno.env.get('OPENCODE_GO_MODEL') || '').trim();
  return (
    envModel ||
    pickProviderModel('deepseek', request.model, request.fallbackModel, DEFAULT_DEEPSEEK_MODEL)
  );
}

async function callGemini(request: VisionRequest): Promise<ProviderResult> {
  const apiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  if (!apiKey) throw new AltProviderError('provider_not_configured', 'GEMINI_API_KEY 未設定', 503);

  const model = geminiModel(request);
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetchWithAiUsage(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: request.system }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: request.user },
              { inline_data: { mime_type: request.mimeType, data: request.base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      }),
    }, { feature: "alt-pilot", operation: "alt_generate", provider: "gemini", model });
  } catch (error) {
    throw new AltProviderError(
      'provider_error',
      `Gemini 連線失敗：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AltProviderError(
      'provider_error',
      `Gemini (${model}) HTTP ${response.status}${detail ? `：${detail.slice(0, 200)}` : ''}`,
      response.status,
    );
  }

  const payload = await response.json().catch(() => null) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  } | null;

  if (payload?.promptFeedback?.blockReason) {
    throw new AltProviderError(
      'provider_blocked',
      `Gemini 拒絕生成（${payload.promptFeedback.blockReason}）`,
      422,
    );
  }

  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
  if (!text) {
    throw new AltProviderError(
      'provider_empty',
      `Gemini (${model}) 回傳空白${payload?.candidates?.[0]?.finishReason ? `（${payload.candidates[0].finishReason}）` : ''}`,
    );
  }

  const tokensIn = asNumber(payload?.usageMetadata?.promptTokenCount);
  const tokensOut = asNumber(payload?.usageMetadata?.candidatesTokenCount);

  return {
    text,
    provider: 'gemini',
    model,
    tokensIn,
    tokensOut,
    costUsd: estimateGeminiCost(model, tokensIn, tokensOut),
  };
}

async function callGrok(request: VisionRequest): Promise<ProviderResult> {
  const apiKey = (Deno.env.get('XAI_API_KEY') || Deno.env.get('GROK_API_KEY') || '').trim();
  if (!apiKey) throw new AltProviderError('provider_not_configured', 'XAI_API_KEY 未設定', 503);

  const model = grokModel(request);
  let response: Response;
  try {
    response = await fetchWithAiUsage('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        reasoning_effort: 'low',
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: request.system },
          {
            role: 'user',
            content: [
              { type: 'text', text: request.user },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${request.mimeType};base64,${request.base64}`,
                },
              },
            ],
          },
        ],
      }),
    }, { feature: "alt-pilot", operation: "alt_generate", provider: "grok", model });
  } catch (error) {
    throw new AltProviderError(
      'provider_error',
      `Grok 連線失敗：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AltProviderError(
      'provider_error',
      `Grok (${model}) HTTP ${response.status}${detail ? `：${detail.slice(0, 200)}` : ''}`,
      response.status,
    );
  }

  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;

  const rawContent = payload?.choices?.[0]?.message?.content;
  const text = Array.isArray(rawContent)
    ? rawContent.map((part) => part.text || '').join('').trim()
    : String(rawContent || '').trim();

  if (!text) throw new AltProviderError('provider_empty', `Grok (${model}) 回傳空白`);

  return {
    text,
    provider: 'grok',
    model,
    tokensIn: asNumber(payload?.usage?.prompt_tokens),
    tokensOut: asNumber(payload?.usage?.completion_tokens),
    costUsd: 0,
  };
}

function estimateDeepSeekCost(model: string, tokensIn: number, tokensOut: number): number {
  // OpenCode Go 的 DeepSeek V4.1 Flash 1017 價格（USD / 1M tokens）。
  const pricing =
    model === 'deepseek-v4.1-flash'
      ? { input: 0.15, output: 0.6 }
      : { input: 0.15, output: 0.6 };
  return (tokensIn / 1_000_000) * pricing.input + (tokensOut / 1_000_000) * pricing.output;
}

async function callDeepSeek(request: VisionRequest): Promise<ProviderResult> {
  const apiKey = (
    Deno.env.get('OPENCODE_GO_API_KEY') ||
    Deno.env.get('OPENCODE_API_KEY') ||
    ''
  ).trim();
  if (!apiKey) {
    throw new AltProviderError(
      'provider_not_configured',
      'OPENCODE_GO_API_KEY 未設定，無法使用 DeepSeek 備援',
      503,
    );
  }

  const model = deepseekModel(request);
  const baseUrl = (
    Deno.env.get('OPENCODE_GO_BASE_URL') || DEFAULT_OPENCODE_GO_BASE_URL
  ).replace(/\/+$/, '');

  let response: Response;
  try {
    response = await fetchWithAiUsage(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(90_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenCode Go 需要 session header 才能路由；每次呼叫一個新 session。
        'x-opencode-session': crypto.randomUUID(),
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        reasoning_effort: 'low',
        max_tokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
        stream: false,
        messages: [
          { role: 'system', content: request.system },
          {
            role: 'user',
            content: [
              { type: 'text', text: request.user },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${request.mimeType};base64,${request.base64}`,
                },
              },
            ],
          },
        ],
      }),
    }, { feature: "alt-pilot", operation: "alt_generate", provider: "deepseek", model });
  } catch (error) {
    throw new AltProviderError(
      'provider_error',
      `DeepSeek 連線失敗：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AltProviderError(
      'provider_error',
      `DeepSeek (${model}) HTTP ${response.status}${detail ? `：${detail.slice(0, 200)}` : ''}`,
      response.status,
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | Array<{ text?: string }>; reasoning_content?: string };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      opencode?: { list_cost?: number };
    };
  } | null;

  const rawContent = payload?.choices?.[0]?.message?.content;
  const text = Array.isArray(rawContent)
    ? rawContent.map((part) => part.text || '').join('').trim()
    : String(rawContent || '').trim();

  if (!text) {
    const finish = payload?.choices?.[0]?.finish_reason || 'unknown';
    throw new AltProviderError(
      'provider_empty',
      `DeepSeek (${model}) 回傳空白（finish_reason=${finish}）`,
    );
  }

  const tokensIn = asNumber(payload?.usage?.prompt_tokens);
  const tokensOut = asNumber(payload?.usage?.completion_tokens);
  const listedCost = asNumber(payload?.usage?.opencode?.list_cost);

  return {
    text,
    provider: 'deepseek',
    model,
    tokensIn,
    tokensOut,
    costUsd: listedCost > 0 ? listedCost : estimateDeepSeekCost(model, tokensIn, tokensOut),
  };
}

/**
 * 預設 Grok → Gemini。帳戶欠費或呼叫失敗就試下一個。
 * `ALT_PROVIDER=gemini` 或設定模型以 gemini 開頭時，才把 Gemini 放在 Grok 前面。
 */
export async function generateVision(request: VisionRequest): Promise<ProviderResult> {
  const geminiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  const grokKey = (Deno.env.get('XAI_API_KEY') || Deno.env.get('GROK_API_KEY') || '').trim();

  if (!geminiKey && !grokKey) {
    throw new AltProviderError(
      'provider_not_configured',
      '未設定 XAI_API_KEY（Grok）或 GEMINI_API_KEY，無法生成 ALT。',
      503,
    );
  }

  const preferred = (Deno.env.get('ALT_PROVIDER') || '').trim().toLowerCase();
  const preferGrok =
    preferred === 'grok' ||
    (preferred !== 'gemini' && /^grok/i.test(request.model.trim()));
  const order: Array<'grok' | 'gemini'> = preferGrok
    ? ['grok', 'gemini']
    : ['gemini', 'grok'];

  const errors: string[] = [];
  for (const provider of order) {
    if (provider === 'grok' && !grokKey) continue;
    if (provider === 'gemini' && !geminiKey) continue;

    try {
      if (provider === 'grok') return await callGrok(request);
      return await callGemini(request);
    } catch (error) {
      const label = provider === 'grok' ? 'Grok' : 'Gemini';
      errors.push(`${label} 失敗：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new AltProviderError(
    'provider_error',
    errors.length > 0 ? errors.join('；') : '沒有可用的 LLM provider',
  );
}
