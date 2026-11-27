import { extractGeminiUsage, extractGrokUsage, MODEL_PRICING_PER_1M } from "./readdy-llm-usage.ts";

interface AiCall {
  feature: string;
  operation: string;
  provider: "gemini" | "grok" | "deepseek";
  model: string;
}

type Status = "ok" | "http_error" | "network_error" | "invalid_response";

async function storeUsage(
  call: AiCall,
  createdAt: string,
  status: Status,
  response?: Response,
): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.warn("[ai-usage] Supabase service credentials missing");
    return;
  }

  const payload = await response?.clone().json().catch(() => null);
  if (status === "ok" && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
    status = "invalid_response";
  }

  const usage = call.provider === "gemini" ? payload?.usageMetadata : payload?.usage;
  const { tokensIn, tokensOut } = call.provider === "gemini"
    ? extractGeminiUsage(payload)
    : extractGrokUsage(payload);
  const model = typeof payload?.modelVersion === "string" && payload.modelVersion
    ? payload.modelVersion
    : typeof payload?.model === "string" && payload.model ? payload.model : call.model;
  const rates = MODEL_PRICING_PER_1M[model] ?? MODEL_PRICING_PER_1M[call.model] ??
    (call.provider === "deepseek" && call.model === "deepseek-v4.1-flash"
      ? { input: 0.15, output: 0.6 }
      : undefined);
  const reportedCost = call.provider === "deepseek" ? usage?.opencode?.list_cost : undefined;
  const hasTokenUsage = tokensIn > 0 || tokensOut > 0 ||
    (call.provider === "gemini" ? usage?.totalTokenCount === 0 : usage?.total_tokens === 0);
  const cost = typeof reportedCost === "number" && Number.isFinite(reportedCost) && reportedCost >= 0
    ? reportedCost
    : hasTokenUsage && rates ? (tokensIn * rates.input + tokensOut * rates.output) / 1_000_000 : null;

  const result = await fetch(`${url.replace(/\/$/, "")}/rest/v1/ai_call_usage`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      feature: call.feature,
      operation: call.operation,
      provider: call.provider,
      model,
      status,
      http_status: response?.status ?? null,
      tokens_in: hasTokenUsage ? tokensIn : null,
      tokens_out: hasTokenUsage ? tokensOut : null,
      estimated_cost_usd: cost,
      created_at: createdAt,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!result.ok) {
    await result.body?.cancel();
    console.warn("[ai-usage] insert rejected", result.status);
  }
}

async function persistInBackground(task: Promise<void>): Promise<void> {
  const safeTask = task.catch(() => console.warn("[ai-usage] insert failed"));
  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil: (promise: Promise<void>) => void };
  }).EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") {
    runtime.waitUntil(safeTask);
  } else {
    await safeTask;
  }
}

/** One row per outbound model request. The caller retains the original response and error handling. */
export async function fetchWithAiUsage(url: string, init: RequestInit, call: AiCall): Promise<Response> {
  const createdAt = new Date().toISOString();
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    await persistInBackground(storeUsage(call, createdAt, "network_error"));
    throw error;
  }

  await persistInBackground(storeUsage(call, createdAt, response.ok ? "ok" : "http_error", response));
  return response;
}
