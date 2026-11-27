import { fetchWithAiUsage } from "../_shared/ai-usage.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  AD_SYSTEM_PROMPT,
  AdCreativeParseError,
  buildAdCreativePrompt,
  normalizeAdBrief,
  parseAdCreativeResponse,
  validateAdBrief,
  type AdAngleId,
  type AdBrief,
  type AdCreativeResult,
} from "../../../src/lib/adCreative.ts";
import { TEXT_LLM_ORDER } from "../../../src/lib/llmProviderOrder.ts";

/**
 * 文案工坊 · 廣告切角與 A/B 文案矩陣 · 生成 Edge Function
 *
 * 契約（POST /functions/v1/ad-creative-writer）：
 *   { brief: AdBrief }
 *   → { ok: true, data: { angles, provider, model, latencyMs, generatedAt, warnings } }
 *   → { ok: false, code, error }
 *
 * 供應商順序：Grok → Gemini。前一個失敗（含帳戶欠費）就試下一個。
 * 全部失敗時回 429 / 504 / 502 / 503，**不生成假文案**。
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOTAL_BUDGET_MS = 110_000;
const MIN_CALL_MS = 8_000;
const MAX_CALL_MS = 50_000;
const RETRY_MIN_REMAINING_MS = 18_000;
const MAX_RETRY_MS = 25_000;
const MAX_OUTPUT_TOKENS = 8_192;

const DEFAULT_GROK_MODEL = "grok-4.5";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const GROK_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").trim();
const SUPABASE_ANON_KEY = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();

type Provider = "grok" | "gemini";
type LlmCode =
  | "not_configured"
  | "rate_limited"
  | "timeout"
  | "bad_json"
  | "upstream_error";

class LlmError extends Error {
  readonly code: LlmCode;
  readonly status: number;
  readonly missingAngleIds?: AdAngleId[];

  constructor(
    code: LlmCode,
    message: string,
    status: number,
    missingAngleIds?: AdAngleId[],
  ) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    this.status = status;
    this.missingAngleIds = missingAngleIds;
  }
}

/**
 * SPA 的 access token 是 ES256，而 gateway 仍用退役的 HS256 secret 驗 JWT，
 * 所以本函式設 verify_jwt = false，改由這裡自己驗（與 crosspost-writer 一致）。
 * dev-bypass 登入沒有 Supabase session，會帶 anon key；沿用專案既有做法放行。
 */
async function validateSession(token: string): Promise<boolean> {
  if (!token) return false;
  if (SUPABASE_ANON_KEY && token === SUPABASE_ANON_KEY) return true;
  if (!SUPABASE_URL) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function okJson(data: unknown): Response {
  return json(200, { ok: true, data });
}

function failJson(status: number, code: string, error: string): Response {
  return json(status, { ok: false, code, error });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError",
  );
}

function asLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new LlmError("upstream_error", message || "AI 呼叫失敗", 502);
}

function asParseError(error: unknown): LlmError {
  if (error instanceof AdCreativeParseError) {
    return new LlmError("bad_json", error.message, 502, error.missingAngleIds);
  }
  return new LlmError(
    "bad_json",
    error instanceof Error ? error.message : "AI 輸出格式不符",
    502,
  );
}

// ============================================================
// Grok
// ============================================================

async function callGrok(
  prompt: string,
  model: string,
  apiKey: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchWithAiUsage(GROK_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: AD_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    }, { feature: "ad-creative-writer", operation: "generate_copy", provider: "grok", model });

    const rawText = await response.text().catch(() => "");

    if (response.status === 429 || response.status === 402) {
      throw new LlmError("rate_limited", `Grok 額度或速率上限（${response.status}）`, response.status);
    }
    if (!response.ok) {
      throw new LlmError(
        "upstream_error",
        `Grok 回應 ${response.status}：${rawText.slice(0, 200)}`,
        502,
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw new LlmError("upstream_error", "Grok 回傳的不是 JSON", 502);
    }

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = (choices[0] ?? {}) as { message?: { content?: unknown } };
    const content = typeof first.message?.content === "string" ? first.message.content.trim() : "";
    if (!content) throw new LlmError("upstream_error", "Grok 回傳空白內容", 502);
    return content;
  } catch (error) {
    if (error instanceof LlmError) throw error;
    if (isAbortError(error)) {
      throw new LlmError("timeout", `Grok 逾時（${Math.round(timeoutMs / 1000)} 秒）`, 504);
    }
    throw new LlmError(
      "upstream_error",
      `Grok 連線失敗：${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Gemini
// ============================================================

async function callGemini(
  prompt: string,
  model: string,
  apiKey: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchWithAiUsage(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${AD_SYSTEM_PROMPT}\n\n${prompt}` }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
          },
          safetySettings: [],
        }),
        signal: controller.signal,
      },
      { feature: "ad-creative-writer", operation: "generate_copy", provider: "gemini", model },
    );

    const rawText = await response.text().catch(() => "");

    if (response.status === 429) {
      throw new LlmError("rate_limited", "Gemini 額度或速率上限（429）", 429);
    }
    if (!response.ok) {
      throw new LlmError(
        "upstream_error",
        `Gemini 回應 ${response.status}：${rawText.slice(0, 200)}`,
        502,
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw new LlmError("upstream_error", "Gemini 回傳的不是 JSON", 502);
    }

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const first = (candidates[0] ?? {}) as {
      content?: { parts?: Array<{ text?: unknown }> };
    };
    const parts = Array.isArray(first.content?.parts) ? first.content.parts : [];
    const content = parts
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!content) throw new LlmError("upstream_error", "Gemini 回傳空白內容", 502);
    return content;
  } catch (error) {
    if (error instanceof LlmError) throw error;
    if (isAbortError(error)) {
      throw new LlmError("timeout", `Gemini 逾時（${Math.round(timeoutMs / 1000)} 秒）`, 504);
    }
    throw new LlmError(
      "upstream_error",
      `Gemini 連線失敗：${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

function callProvider(
  provider: Provider,
  prompt: string,
  model: string,
  apiKey: string,
  timeoutMs: number,
): Promise<string> {
  if (provider === "grok") return callGrok(prompt, model, apiKey, timeoutMs);
  return callGemini(prompt, model, apiKey, timeoutMs);
}

// ============================================================
// 單一供應商：呼叫 → 解析 → 必要時重試一次
// ============================================================

interface ProviderResult {
  result: AdCreativeResult;
  provider: Provider;
  model: string;
}

interface AttemptOptions {
  provider: Provider;
  model: string;
  apiKey: string;
  brief: AdBrief;
  deadline: number;
  startedAt: number;
}

async function attemptProvider(options: AttemptOptions): Promise<ProviderResult> {
  const { provider, model, apiKey, brief, deadline, startedAt } = options;

  const basePrompt = buildAdCreativePrompt(brief);
  let prompt = basePrompt;
  let lastError: LlmError = new LlmError("upstream_error", "AI 生成失敗", 502);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= MIN_CALL_MS) {
      throw new LlmError("timeout", "生成時間不足，請重試", 504);
    }

    const isRetry = attempt > 0;
    const firstCallCap = provider === "gemini" ? MAX_CALL_MS : 15_000;
    const timeoutMs = Math.min(
      isRetry ? MAX_RETRY_MS : firstCallCap,
      Math.max(MIN_CALL_MS, remaining - 3_000),
    );

    let raw = "";
    try {
      raw = await callProvider(provider, prompt, model, apiKey, timeoutMs);
    } catch (error) {
      // 429 / 逾時／上游錯誤：不重試，直接交由下一個供應商。
      throw asLlmError(error);
    }

    try {
      const result = parseAdCreativeResponse(raw, {
        brief,
        provider,
        model,
        latencyMs: Date.now() - startedAt,
        generatedAt: new Date().toISOString(),
      });
      return { result, provider, model };
    } catch (error) {
      lastError = asParseError(error);
      const canRetry = attempt === 0 && deadline - Date.now() >= RETRY_MIN_REMAINING_MS;
      if (!canRetry) break;

      const parseError = error instanceof AdCreativeParseError ? error : null;
      if (parseError?.code === "angles_insufficient") {
        prompt = buildAdCreativePrompt(brief, {
          retry: "angles",
          missingAngleIds: lastError.missingAngleIds,
        });
      } else {
        prompt = buildAdCreativePrompt(brief, { retry: "json" });
      }
    }
  }

  throw lastError;
}

// ============================================================
// Handler
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return failJson(405, "method_not_allowed", "只接受 POST");
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return failJson(401, "unauthorized", "登入已逾時，請重新整理");
  }

  const token = authorization.slice(7).trim();
  if (!token || !(await validateSession(token))) {
    return failJson(401, "unauthorized", "登入已逾時，請重新整理");
  }

  const body = await readJson(req);
  const briefRaw =
    body.brief && typeof body.brief === "object"
      ? (body.brief as Partial<AdBrief>)
      : ({} as Partial<AdBrief>);
  const brief = normalizeAdBrief(briefRaw);

  const issues = validateAdBrief(brief);
  if (issues.length > 0) {
    return failJson(400, "invalid_input", issues[0].message);
  }

  const grokKey = (Deno.env.get("XAI_API_KEY") || Deno.env.get("GROK_API_KEY") || "").trim();
  const geminiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim();

  if (!grokKey && !geminiKey) {
    return failJson(503, "llm_not_configured", "系統未設定 AI，請聯絡管理員");
  }

  const grokModel = (Deno.env.get("GROK_MODEL") || "").trim() || DEFAULT_GROK_MODEL;
  const geminiModel = (Deno.env.get("GEMINI_MODEL") || "").trim() || DEFAULT_GEMINI_MODEL;

  const startedAt = Date.now();
  const deadline = startedAt + TOTAL_BUDGET_MS;
  const failures: LlmError[] = [];

  const keyed: Record<Provider, { model: string; apiKey: string }> = {
    grok: { model: grokModel, apiKey: grokKey },
    gemini: { model: geminiModel, apiKey: geminiKey },
  };
  const providers = TEXT_LLM_ORDER
    .map((provider) => ({ provider, ...keyed[provider] }))
    .filter((candidate) => Boolean(candidate.apiKey));

  for (const candidate of providers) {
    try {
      const outcome = await attemptProvider({
        ...candidate,
        brief,
        deadline,
        startedAt,
      });
      const latencyMs = Date.now() - startedAt;
      console.log(
        JSON.stringify({
          event: "ad_creative.generate",
          provider: outcome.provider,
          model: outcome.model,
          latencyMs,
          angles: outcome.result.angles.length,
          warnings: outcome.result.warnings.length,
        }),
      );
      return okJson({
        angles: outcome.result.angles,
        provider: outcome.provider,
        model: outcome.model,
        latencyMs,
        generatedAt: outcome.result.generatedAt,
        warnings: outcome.result.warnings,
      });
    } catch (error) {
      failures.push(asLlmError(error));
    }
  }

  const messages = failures.map((failure) => failure.message).filter(Boolean);
  const detail = messages.join("；").slice(0, 400) || "AI 暫時無法使用";

  console.error(
    JSON.stringify({
      event: "ad_creative.failure",
      failures: failures.map((failure) => ({
        code: failure.code,
        message: failure.message.slice(0, 240),
      })),
    }),
  );

  if (failures.length > 0 && failures.every((failure) => failure.code === "rate_limited")) {
    return failJson(429, "rate_limited", `AI 額度暫時用盡，請 60 秒後再試（${detail}）`);
  }
  if (failures.length > 0 && failures.every((failure) => failure.code === "timeout")) {
    return failJson(504, "timeout", `生成逾時，請重試（${detail}）`);
  }
  if (failures.length > 0 && failures.every((failure) => failure.code === "bad_json")) {
    return failJson(502, "bad_json", `AI 回傳格式不符，請重試（${detail}）`);
  }

  return failJson(502, "llm_unavailable", `AI 暫時無法使用，請重試（${detail}）`);
});
