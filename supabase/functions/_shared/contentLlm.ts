import { fetchWithAiUsage } from "./ai-usage.ts";
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
import { TEXT_LLM_ORDER } from "../../../src/lib/llmProviderOrder.ts";
import { callOpencodeChat, opencodeApiKey, opencodeModel, OpencodeError } from "./opencode.ts";

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

function grokApiKey(): string {
  return (Deno.env.get("XAI_API_KEY") || Deno.env.get("GROK_API_KEY") || "").trim();
}

export function llmConfigured(): boolean {
  return Boolean(grokApiKey() || opencodeApiKey() || (Deno.env.get(ENV_API_KEY) || "").trim());
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
    response = await fetchWithAiUsage(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
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
    }, { feature: "content-automation", operation: "generate_article", provider: "gemini", model });
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

const GROK_ENDPOINT = "https://api.x.ai/v1/chat/completions";

async function callGrokJson(
  prompt: string,
  timeoutMs: number,
): Promise<ContentLlmResult<Record<string, unknown>>> {
  const apiKey = grokApiKey();
  const model = (Deno.env.get("GROK_MODEL") || "").trim() || "grok-4.5";
  const startedAt = Date.now();
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
        temperature: 0.65,
        messages: [
          { role: "system", content: "只輸出合法 JSON，不要 Markdown。" },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    }, {
      feature: "content-automation",
      operation: "generate_article",
      provider: "grok",
      model,
    });
    const raw = await response.text().catch(() => "");
    if (!response.ok) {
      throw new ContentLlmError(
        response.status === 429 || response.status === 402 ? "rate_limited" : "upstream_error",
        `Grok 回應 ${response.status}：${raw.slice(0, 180)}`,
        { retryable: response.status === 429 || response.status === 402 || response.status >= 500 },
      );
    }
    const payload = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = payload.choices?.[0]?.message?.content?.trim() || "";
    const data = parseJsonResponse(text) as Record<string, unknown>;
    const tokensIn = Number(payload.usage?.prompt_tokens) || 0;
    const tokensOut = Number(payload.usage?.completion_tokens) || 0;
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
  } catch (error) {
    if (error instanceof ContentLlmError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ContentLlmError("timeout", "Grok 逾時", { retryable: true });
    }
    throw new ContentLlmError(
      "upstream_error",
      error instanceof Error ? error.message : "Grok 失敗",
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
}

async function callOpencodeJson(
  prompt: string,
  timeoutMs: number,
): Promise<ContentLlmResult<Record<string, unknown>>> {
  const model = opencodeModel();
  const startedAt = Date.now();
  try {
    const text = await callOpencodeChat({
      system: "只輸出合法 JSON，不要 Markdown。",
      prompt,
      model,
      apiKey: opencodeApiKey(),
      timeoutMs,
      temperature: 0.65,
      usage: { feature: "content-automation", operation: "generate_article" },
    });
    return {
      data: parseJsonResponse(text) as Record<string, unknown>,
      usage: {
        model,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
      },
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof OpencodeError) {
      throw new ContentLlmError(
        error.kind === "timeout"
          ? "timeout"
          : error.kind === "rate_limited" || error.status === 402
          ? "rate_limited"
          : "upstream_error",
        error.message,
        { retryable: true },
      );
    }
    throw error;
  }
}

/** 生成文章：Grok → Gemini → OpenCode。前一個失敗（含欠費）就試下一個。 */
export async function generateArticleWithLlm(
  options: GenerateArticleLlmOptions,
): Promise<GenerateArticleLlmResult> {
  const prompt = buildGenerationPrompt(options.brief);
  const budgetMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  const errors: string[] = [];
  const geminiModel = options.model || defaultModel();

  const steps = TEXT_LLM_ORDER.filter((provider) => {
    if (provider === "grok") return Boolean(grokApiKey());
    if (provider === "gemini") return Boolean((Deno.env.get(ENV_API_KEY) || "").trim());
    return Boolean(opencodeApiKey());
  });

  if (steps.length === 0) {
    throw new ContentLlmError("llm_not_configured", "未設定 Grok、Gemini 或 OpenCode", {
      retryable: false,
    });
  }

  for (const provider of steps) {
    let tried = 0;
    while (tried < 2) {
      tried += 1;
      const remaining = budgetMs - (Date.now() - startedAt);
      if (remaining < 8_000) break;
      // 欠費的 Grok／OpenCode 盡快失敗，把剩餘時間留給下一個模型。
      const timeoutMs = provider === "gemini"
        ? Math.min(45_000, remaining)
        : Math.min(8_000, remaining);
      try {
        const result = provider === "grok"
          ? await callGrokJson(prompt, timeoutMs)
          : provider === "gemini"
          ? await callGeminiJson<Record<string, unknown>>({
            prompt,
            model: geminiModel,
            timeoutMs,
            temperature: 0.65,
          })
          : await callOpencodeJson(prompt, timeoutMs);
        const generated = parseGeneratedArticle(result.data, options.parseOptions);
        if (!isValidGeneratedArticle(generated)) {
          throw new ContentLlmError("bad_json", `${provider} 內容不足`, { retryable: true });
        }
        return {
          generated,
          usage: result.usage,
          latencyMs: Date.now() - startedAt,
          attempts: tried,
        };
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        const badJson = error instanceof ContentLlmError && error.code === "bad_json";
        if (!badJson) break;
      }
    }
  }

  throw new ContentLlmError(
    "upstream_error",
    errors.join("；").slice(0, 400) || "文章生成失敗",
    { retryable: true },
  );
}
