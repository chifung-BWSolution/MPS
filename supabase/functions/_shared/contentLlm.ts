import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  DEFAULT_CONTENT_MODEL,
  estimateLlmCostUsd,
} from "../../../src/lib/contentFormat.ts";
import {
  buildGenerationPrompt,
  isValidGeneratedArticle,
  parseGeneratedArticle,
  type ParseGeneratedOptions,
} from "../../../src/lib/contentGenerate.ts";
import type {
  ContentBrief,
  ContentGeneratedArticle,
  ContentLlmResult,
} from "../../../src/lib/contentTypes.ts";

/**
 * Gemini 封裝（PRD §7.4、M2-02）
 *
 * 要求：
 *   - 強制 JSON 輸出（responseMimeType = application/json）
 *   - timeout 120 秒（AbortController）
 *   - 回傳 token 用量，讓 worker 寫 content_llm_usage
 *   - 失敗拋可辨識錯誤（rate limit / timeout / bad_json / upstream）
 */

const ENV_API_KEY = "GEMINI_API_KEY";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 120_000;

export type ContentLlmErrorCode =
  | "llm_not_configured"
  | "rate_limited"
  | "timeout"
  | "bad_json"
  | "upstream_error";

export class ContentLlmError extends Error {
  readonly code: ContentLlmErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    code: ContentLlmErrorCode,
    message: string,
    options: { retryable?: boolean; retryAfterMs?: number | null } = {},
  ) {
    super(message);
    this.name = "ContentLlmError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export function llmConfigured(): boolean {
  return Boolean((Deno.env.get(ENV_API_KEY) || "").trim());
}

export function defaultModel(): string {
  return (Deno.env.get("GEMINI_MODEL") || "").trim() || DEFAULT_CONTENT_MODEL;
}

export interface GeminiJsonOptions {
  prompt: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
  /** 期待 JSON 陣列時設為 true；預設要求物件 */
  expectArray?: boolean;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; status?: string };
}

function extractText(response: GeminiResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text || "").join("").trim();
}

/** 解析模型輸出；容忍 ```json 圍欄與前後空白 */
export function parseJsonResponse(raw: string): unknown {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    throw new ContentLlmError("bad_json", "模型沒有回傳內容");
  }
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // 有時模型會在 JSON 前後加一句話：抓第一個 { 到最後一個 }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new ContentLlmError("bad_json", "模型輸出不是合法 JSON", { retryable: true });
  }
}

export async function callGeminiJson<T = unknown>(
  options: GeminiJsonOptions,
): Promise<ContentLlmResult<T>> {
  const apiKey = (Deno.env.get(ENV_API_KEY) || "").trim();
  if (!apiKey) {
    throw new ContentLlmError(
      "llm_not_configured",
      `缺少 ${ENV_API_KEY}，無法生成內容`,
    );
  }

  const model = options.model || defaultModel();
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: options.prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxOutputTokens ?? 8_192,
          responseMimeType: "application/json",
          ...(options.expectArray ? { responseSchema: undefined } : {}),
        },
        safetySettings: [],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ContentLlmError("timeout", `Gemini 呼叫逾時（${timeoutMs}ms）`, {
        retryable: true,
      });
    }
    throw new ContentLlmError(
      "upstream_error",
      `Gemini 連線失敗：${error instanceof Error ? error.message : String(error)}`,
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => ({}))) as GeminiResponse;

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    throw new ContentLlmError("rate_limited", "Gemini 免費額度或速率上限（429）", {
      retryable: true,
      retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : 60_000,
    });
  }

  if (!response.ok) {
    throw new ContentLlmError(
      "upstream_error",
      payload?.error?.message || `Gemini 回應 ${response.status}`,
      { retryable: response.status >= 500 },
    );
  }

  const text = extractText(payload);
  const data = parseJsonResponse(text) as T;
  const tokensIn = Number(payload.usageMetadata?.promptTokenCount) || 0;
  const tokensOut = Number(payload.usageMetadata?.candidatesTokenCount) || 0;

  return {
    data,
    usage: {
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: estimateLlmCostUsd(model, tokensIn, tokensOut),
    },
    latencyMs: Date.now() - startedAt,
  };
}

export interface GenerateArticleLlmOptions {
  brief: ContentBrief;
  model?: string;
  parseOptions: ParseGeneratedOptions;
  timeoutMs?: number;
  /** 解析失敗時再試一次（PRD §9.2.3 步驟 4） */
  attempts?: number;
}

export interface GenerateArticleLlmResult {
  generated: ContentGeneratedArticle;
  usage: ContentLlmResult<unknown>["usage"];
  latencyMs: number;
  attempts: number;
}

/** 生成文章：prompt → JSON → 收斂成 ContentGeneratedArticle，含一次重試 */
export async function generateArticleWithLlm(
  options: GenerateArticleLlmOptions,
): Promise<GenerateArticleLlmResult> {
  const attempts = Math.max(1, Math.min(3, options.attempts ?? 2));
  const prompt = buildGenerationPrompt(options.brief);
  let lastError: unknown = null;
  const startedAt = Date.now();
  let usage: GenerateArticleLlmResult["usage"] = {
    model: options.model || defaultModel(),
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await callGeminiJson<Record<string, unknown>>({
        prompt,
        model: options.model,
        timeoutMs: options.timeoutMs,
        temperature: 0.65,
      });
      usage = {
        ...result.usage,
        tokens_in: usage.tokens_in + result.usage.tokens_in,
        tokens_out: usage.tokens_out + result.usage.tokens_out,
        cost_usd: usage.cost_usd + result.usage.cost_usd,
      };
      const generated = parseGeneratedArticle(result.data, options.parseOptions);
      if (!isValidGeneratedArticle(generated)) {
        throw new ContentLlmError("bad_json", "模型輸出內容不足（標題或正文過短）", {
          retryable: true,
        });
      }
      return {
        generated,
        usage,
        latencyMs: Date.now() - startedAt,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      if (error instanceof ContentLlmError && !error.retryable) break;
      if (error instanceof ContentLlmError && attempt < attempts) {
        const waitMs = error.retryAfterMs ?? 2_000 * attempt;
        await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 30_000)));
        continue;
      }
      if (attempt >= attempts) break;
    }
  }

  if (lastError instanceof ContentLlmError) throw lastError;
  throw new ContentLlmError(
    "upstream_error",
    lastError instanceof Error ? lastError.message : "文章生成失敗",
  );
}
