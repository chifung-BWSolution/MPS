import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ADVISOR_TOOL_DEFINITIONS } from "./tools.ts";
import { executeAdvisorTool, type AdvisorDateContext } from "./warehouse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_GROK_MODEL = "grok-4.5";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const MAX_MESSAGES = 12;
const MAX_TOOL_ROUNDS = 6;

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type AdsAdvisorSnapshot = {
  platform?: unknown;
  accountId?: unknown;
  campaignId?: unknown;
  campaignName?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  [key: string]: unknown;
};

type AdvisorProvider = "grok" | "gemini";

type ToolUsed = {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
};

type GrokMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: GrokToolCall[];
  tool_call_id?: string;
};

type GrokToolCall = {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function extractJwt(req: Request): string {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateSnapshot(snapshot: unknown): snapshot is AdsAdvisorSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  const s = snapshot as AdsAdvisorSnapshot;
  return (
    isNonEmptyString(s.platform) &&
    isNonEmptyString(s.accountId) &&
    isNonEmptyString(s.campaignId) &&
    isNonEmptyString(s.campaignName) &&
    isNonEmptyString(s.dateFrom) &&
    isNonEmptyString(s.dateTo)
  );
}

function normalizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      continue;
    }
    messages.push({ role, content });
  }
  return messages.slice(-MAX_MESSAGES);
}

function snapshotContext(snapshot: AdsAdvisorSnapshot): AdvisorDateContext {
  return {
    dateFrom: String(snapshot.dateFrom),
    dateTo: String(snapshot.dateTo),
  };
}

function buildSystemPrompt(snapshot: AdsAdvisorSnapshot): string {
  return `你是香港數碼廣告代理的資深 media buyer 顧問。請用繁體中文（香港用詞）回覆。

職責：
1. 先根據目前活動 snapshot 診斷表現（狀態、期間、KPI、標籤、網站、目標）。
2. 然後給出 3–5 項按優先排序的行動建議，涵蓋：預算、出價、定向／關鍵字、創意、著陸頁。
3. 若用戶目標不清楚，只問一個釐清問題。

硬性規則：
- 只可引用 snapshot 或工具結果內已有的數字。沒有的數字不要估算、不要發明 spend／CPA／轉換。
- 用戶提到其他 campaign 時，必須先 search_campaigns（或 get_campaigns_by_tag），再用回傳的 accountId／campaignId 呼叫 get_campaign_metrics 或 compare_campaigns。不可自行捏造 id。
- 搜尋結果有多個候選時，請列出 A/B/C 請用戶確認，不要猜。
- 關鍵字／搜尋字詞／廣告／版位要用 get_campaign_breakdowns。若工具回報區間過長（最多 92 日），改用倉庫 KPI 並說明限制。
- 不可建議或執行任何寫回 Google Ads／Meta 的操作（不可改預算、出價、狀態、素材）。
- 語氣務實、可執行，避免空泛口號。引用數字時附上日期區間。

目前活動 snapshot（JSON）：
${JSON.stringify(snapshot, null, 2)}`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

async function runTools(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  ctx: AdvisorDateContext,
  toolsUsed: ToolUsed[],
): Promise<Array<{ name: string; result: unknown }>> {
  const out: Array<{ name: string; result: unknown }> = [];
  for (const call of calls) {
    const executed = await executeAdvisorTool(call.name, call.args, ctx);
    toolsUsed.push({ name: call.name, args: call.args, ok: executed.ok });
    out.push({ name: call.name, result: executed });
  }
  return out;
}

async function callGrok(
  system: string,
  messages: ChatMessage[],
  ctx: AdvisorDateContext,
  toolsUsed: ToolUsed[],
): Promise<string> {
  const apiKey = Deno.env.get("XAI_API_KEY") || Deno.env.get("GROK_API_KEY");
  if (!apiKey) throw new Error("XAI_API_KEY 未設定");
  const model = Deno.env.get("GROK_MODEL") || DEFAULT_GROK_MODEL;

  const grokMessages: GrokMessage[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const allowTools = round < MAX_TOOL_ROUNDS - 1;
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: grokMessages,
        ...(allowTools ? { tools: ADVISOR_TOOL_DEFINITIONS, tool_choice: "auto" } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Grok (${model}) error: ${err}`);
    }
    const data = await res.json();
    const message = data?.choices?.[0]?.message ?? {};
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls as GrokToolCall[] : [];
    const text = String(message.content ?? "").trim();

    if (!toolCalls.length) {
      if (!text) throw new Error(`Grok (${model}) 回傳空白`);
      return text;
    }

    grokMessages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls,
    });

    const executed = await runTools(
      toolCalls.map((call) => ({
        name: call.function?.name || "",
        args: parseToolArgs(call.function?.arguments),
      })),
      ctx,
      toolsUsed,
    );

    for (let i = 0; i < toolCalls.length; i++) {
      grokMessages.push({
        role: "tool",
        tool_call_id: toolCalls[i].id,
        content: JSON.stringify(executed[i]?.result ?? {}),
      });
    }
  }

  throw new Error("Grok 工具迴圈已達上限仍無最終回覆");
}

function geminiToolPrompt(system: string, messages: ChatMessage[], extra = ""): string {
  const history = messages
    .map((m) => `${m.role === "user" ? "用戶" : "顧問"}：${m.content}`)
    .join("\n\n");
  return `${system}

工具協定：
- 若需要資料，只回傳 JSON：{"tool_call":{"name":"search_campaigns|get_campaign_metrics|compare_campaigns|get_campaigns_by_tag|get_campaign_breakdowns","arguments":{...}}}
- 若可以回答，只回傳 JSON：{"reply":"..."}
- 不要 markdown。

---
對話：
${history || "（用戶尚未提問，請先診斷 snapshot 並給出 3–5 項建議。）"}
${extra}`;
}

async function callGeminiOnce(prompt: string, model: string, apiKey: string): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini (${model}) error: ${err}`);
  }
  const data = await res.json();
  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
  if (!text) throw new Error(`Gemini (${model}) 回傳空白`);
  return text;
}

async function callGemini(
  system: string,
  messages: ChatMessage[],
  ctx: AdvisorDateContext,
  toolsUsed: ToolUsed[],
): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY 未設定");
  const model = Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;

  let extra = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const prompt = geminiToolPrompt(
      system,
      messages,
      extra + (round === MAX_TOOL_ROUNDS - 1 ? "\n已達工具上限，必須回傳 {\"reply\":\"...\"}。" : ""),
    );
    const text = await callGeminiOnce(prompt, model, apiKey);
    const parsed = parseJsonObject(text);
    const reply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
    const toolCall = parsed?.tool_call && typeof parsed.tool_call === "object"
      ? parsed.tool_call as Record<string, unknown>
      : null;

    if (toolCall && asNonEmpty(toolCall.name) && round < MAX_TOOL_ROUNDS - 1) {
      const name = String(toolCall.name);
      const args = parseToolArgs(toolCall.arguments);
      const executed = await runTools([{ name, args }], ctx, toolsUsed);
      extra += `\n\n工具結果 ${name}：\n${JSON.stringify(executed[0]?.result ?? {})}`;
      continue;
    }
    if (reply) return reply;
    if (text && !parsed) return text;
  }
  throw new Error("Gemini 工具迴圈已達上限仍無最終回覆");
}

function asNonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    const jwt = extractJwt(req);
    if (!jwt) {
      return jsonResponse({ error: "未登入" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "";
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ error: "Supabase 環境變數未設定" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "未登入" }, 401);
    }

    const body = await req.json();
    const snapshot = body?.snapshot;
    if (!validateSnapshot(snapshot)) {
      return jsonResponse({
        error: "snapshot 需包含 platform, accountId, campaignId, campaignName, dateFrom, dateTo",
      }, 400);
    }

    const messages = normalizeMessages(body?.messages);
    const system = buildSystemPrompt(snapshot);
    const ctx = snapshotContext(snapshot);
    const toolsUsed: ToolUsed[] = [];

    let reply = "";
    let provider: AdvisorProvider = "grok";
    let lastError = "";

    try {
      reply = await callGrok(system, messages, ctx, toolsUsed);
      provider = "grok";
    } catch (grokErr) {
      lastError = String(grokErr);
      try {
        reply = await callGemini(system, messages, ctx, toolsUsed);
        provider = "gemini";
        lastError = "";
      } catch (geminiErr) {
        lastError = `${lastError}; ${String(geminiErr)}`;
        return jsonResponse({
          reply: "",
          toolsUsed,
          provider: "gemini",
          error: lastError,
        }, 200);
      }
    }

    return jsonResponse({
      reply,
      toolsUsed,
      provider,
    }, 200);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
