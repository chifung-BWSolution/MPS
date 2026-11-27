export type ReaddyLlmProvider = "gemini" | "grok";
export type ReaddyLlmUseCase = "github_interpret" | "parse_ir" | "parse_roles";
export type ReaddyLlmStatus = "ok" | "rejected" | "truncated";

export interface ReaddyLlmUsageInput {
  provider: ReaddyLlmProvider;
  model: string;
  useCase: ReaddyLlmUseCase;
  status: ReaddyLlmStatus;
  tokensIn: number;
  tokensOut: number;
  jobId?: string | null;
  projectName?: string | null;
  pagePath?: string | null;
}

export interface ReaddyUsageDbClient {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error?: { message?: string } | null }>;
  };
}

export const MODEL_PRICING_PER_1M: Readonly<Record<string, { input: number; output: number }>> = {
  "gemini-4-hydrogen": { input: 1.5, output: 7.5 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-4-hydrogen": { input: 0.3, output: 2.5 },
  "grok-3-mini": { input: 0.3, output: 0.5 },
  "grok-4.20-0309-non-reasoning": { input: 0.2, output: 0.5 },
  "grok-4.3": { input: 3, output: 15 },
  "grok-4.5": { input: 3, output: 15 },
  "grok-4.7": { input: 3, output: 15 },
  "grok-4.20-0309-reasoning": { input: 3, output: 15 },
  "grok-4.20-multi-agent-0309": { input: 3, output: 15 },
};

function toNonNegInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** Extract prompt and output (candidates + thoughts) token counts from a Gemini response payload. */
export function extractGeminiUsage(payload: unknown): { tokensIn: number; tokensOut: number } {
  const meta = (payload as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata;
  const tokensIn = toNonNegInt(meta?.promptTokenCount);
  const tokensOut = toNonNegInt(meta?.candidatesTokenCount) + toNonNegInt(meta?.thoughtsTokenCount);
  return { tokensIn, tokensOut };
}

/** Extract prompt and completion (+ separate reasoning if excluded from completion_tokens) token counts from a Grok response payload. */
export function extractGrokUsage(payload: unknown): { tokensIn: number; tokensOut: number } {
  const usage = (payload as { usage?: Record<string, unknown> } | null)?.usage;
  const tokensIn = toNonNegInt(usage?.prompt_tokens);
  const completion = toNonNegInt(usage?.completion_tokens);
  const total = toNonNegInt(usage?.total_tokens);
  const tokensOut = total >= tokensIn + completion && total > 0 ? total - tokensIn : completion;
  return { tokensIn, tokensOut };
}

/** Estimate USD cost from public per-1M-token list rates, rounded to 6 decimal places. */
export function estimateReaddyLlmCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const key = String(model || "").trim();
  const pricing =
    MODEL_PRICING_PER_1M[key] ??
    (key.startsWith("grok-3-mini")
      ? { input: 0.3, output: 0.5 }
      : key.startsWith("grok-")
      ? { input: 3, output: 15 }
      : { input: 0.3, output: 2.5 });
  const inCount = toNonNegInt(tokensIn);
  const outCount = toNonNegInt(tokensOut);
  const usd = (inCount / 1_000_000) * pricing.input + (outCount / 1_000_000) * pricing.output;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Append one Readdy LLM call usage row; swallows DB errors so logging never breaks conversion. */
export async function recordReaddyLlmUsage(
  admin: ReaddyUsageDbClient,
  entry: ReaddyLlmUsageInput,
): Promise<void> {
  const tokensIn = toNonNegInt(entry.tokensIn);
  const tokensOut = toNonNegInt(entry.tokensOut);
  if (tokensIn <= 0 && tokensOut <= 0) return;

  try {
    const costUsd = estimateReaddyLlmCostUsd(entry.model, tokensIn, tokensOut);
    const { error } = await admin.from("readdy_llm_usage").insert({
      job_id: entry.jobId ?? null,
      project_name: String(entry.projectName || ""),
      page_path: String(entry.pagePath || ""),
      provider: entry.provider,
      model: String(entry.model || ""),
      use_case: entry.useCase,
      status: entry.status,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
    });
    if (error) {
      console.error("[readdy-llm-usage] insert failed:", error.message || "unknown");
    }
  } catch (err) {
    console.error("[readdy-llm-usage] insert exception:", err instanceof Error ? err.message : String(err));
  }
}
