import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { fetchWithAiUsage } from "./ai-usage.ts";

/**
 * OpenCode Go（Zen）OpenAI-compatible chat completions
 *
 * 端點：https://opencode.ai/zen/go/v1
 * 模型：deepseek-v4.1-flash（畫面標示 DeepSeek V4.1 Flash 1017）
 *
 * Secrets：
 *   OPENCODE_GO_API_KEY   必填（沒有 key 時呼叫端會跳過此 provider）
 *   OPENCODE_GO_MODEL     選用，預設 deepseek-v4.1-flash
 *   OPENCODE_GO_BASE_URL  選用，預設 https://opencode.ai/zen/go/v1
 *
 * 注意：OpenCode Go 需要 x-opencode-session header 才能路由，
 * 缺少會回 400 MissingSessionID；每次呼叫帶一個新的 UUID 即可。
 */

export const DEFAULT_OPENCODE_BASE_URL = "https://opencode.ai/zen/go/v1";
export const DEFAULT_OPENCODE_MODEL = "deepseek-v4.1-flash";

export type OpencodeErrorKind = "rate_limited" | "timeout" | "upstream_error";

export class OpencodeError extends Error {
  readonly kind: OpencodeErrorKind;
  readonly status: number;

  constructor(kind: OpencodeErrorKind, message: string, status: number) {
    super(message);
    this.name = "OpencodeError";
    this.kind = kind;
    this.status = status;
  }
}

export function opencodeApiKey(): string {
  return (
    (Deno.env.get("OPENCODE_GO_API_KEY") || Deno.env.get("OPENCODE_API_KEY") || "").trim()
  );
}

export function opencodeModel(): string {
  return (
    (Deno.env.get("OPENCODE_GO_MODEL") || Deno.env.get("OPENCODE_MODEL") || "").trim() ||
    DEFAULT_OPENCODE_MODEL
  );
}

export function opencodeBaseUrl(): string {
  const configured = (
    Deno.env.get("OPENCODE_GO_BASE_URL") ||
    Deno.env.get("OPENCODE_BASE_URL") ||
    ""
  ).trim();
  return (configured || DEFAULT_OPENCODE_BASE_URL).replace(/\/+$/, "");
}

function sessionId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `crosspost-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface OpencodeChatOptions {
  system: string;
  prompt: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  maxTokens?: number;
  temperature?: number;
  /** 有帶才寫入既有的 ai_call_usage，不改表結構。 */
  usage?: { feature: string; operation: string };
}

export async function callOpencodeChat(options: OpencodeChatOptions): Promise<string> {
  const {
    system,
    prompt,
    model,
    apiKey,
    timeoutMs,
    maxTokens = 8_192,
    temperature = 0.7,
    usage,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const request: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "x-opencode-session": sessionId(),
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        reasoning_effort: "low",
        stream: false,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    };
    const url = `${opencodeBaseUrl()}/chat/completions`;
    const response = usage
      ? await fetchWithAiUsage(url, request, {
        feature: usage.feature,
        operation: usage.operation,
        provider: "deepseek",
        model,
      })
      : await fetch(url, request);

    const rawText = await response.text().catch(() => "");

    if (response.status === 429 || response.status === 402) {
      throw new OpencodeError(
        "rate_limited",
        `DeepSeek（OpenCode Go）額度或速率上限（${response.status}）`,
        response.status,
      );
    }
    if (!response.ok) {
      throw new OpencodeError(
        "upstream_error",
        `DeepSeek（OpenCode Go）回應 ${response.status}：${rawText.slice(0, 200)}`,
        502,
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw new OpencodeError(
        "upstream_error",
        "DeepSeek（OpenCode Go）回傳的不是 JSON",
        502,
      );
    }

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = (choices[0] ?? {}) as { message?: { content?: unknown } };
    const content = typeof first.message?.content === "string" ? first.message.content.trim() : "";
    if (!content) {
      throw new OpencodeError("upstream_error", "DeepSeek（OpenCode Go）回傳空白內容", 502);
    }
    return content;
  } catch (error) {
    if (error instanceof OpencodeError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpencodeError(
        "timeout",
        `DeepSeek（OpenCode Go）逾時（${Math.round(timeoutMs / 1000)} 秒）`,
        504,
      );
    }
    throw new OpencodeError(
      "upstream_error",
      `DeepSeek（OpenCode Go）連線失敗：${
        error instanceof Error ? error.message : String(error)
      }`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}
