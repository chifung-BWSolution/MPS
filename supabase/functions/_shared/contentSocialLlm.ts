import { fetchWithAiUsage } from "./ai-usage.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { ComposedLongform } from "../../../src/lib/contentSocialGenerate.ts";

/**
 * 社媒文案 · Grok（xAI）生成封裝
 *
 * 為什麼用 Grok：MPS 專案已有 XAI_API_KEY（廣告顧問在用），不必再申請新 key；
 * 端點與廣告顧問一致（https://api.x.ai/v1/chat/completions）。
 *
 * 設計原則：
 *   - 一次呼叫同時產「長文 + 各平台導流」，避免 N 次費用
 *   - 嚴格要求 JSON，解析失敗視為失敗（呼叫端會退回模板）
 *   - 任何錯誤都不拋給使用者：由 content-social 決定 fallback
 */

const ENDPOINT = "https://api.x.ai/v1/chat/completions";
/**
 * 預設用 grok-4.3：
 *   - grok-4.5 是推理型，實測 30–60 秒仍可能超時
 *   - grok-4.20-non-reasoning 回傳格式不穩（不是合法 JSON）
 *   - grok-4.3 在 60 秒內穩定回傳可用 JSON
 * 可用 CONTENT_SOCIAL_MODEL 覆寫，不影響廣告顧問使用的 GROK_MODEL。
 */
const DEFAULT_MODEL = "grok-4.3";
const DEFAULT_TIMEOUT_MS = 60_000;

export class SocialLlmError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SocialLlmError";
    this.code = code;
  }
}

export function grokConfigured(): boolean {
  return Boolean((Deno.env.get("XAI_API_KEY") || Deno.env.get("GROK_API_KEY") || "").trim());
}

export function grokModel(): string {
  return (
    (Deno.env.get("CONTENT_SOCIAL_MODEL") || Deno.env.get("GROK_MODEL") || "").trim() ||
    DEFAULT_MODEL
  );
}

function apiKey(): string {
  return (Deno.env.get("XAI_API_KEY") || Deno.env.get("GROK_API_KEY") || "").trim();
}

export interface SocialLlmInput {
  eventTitle: string;
  eventSummary?: string | null;
  eventUrl?: string | null;
  groupName?: string | null;
  platforms: string[];
  timeoutMs?: number;
  /** 覆寫模型。文案預設 grok-4.3，不跟其他接口的 grok-4.7。 */
  model?: string;
  /** 覆寫輸出上限（推理型模型太大會很慢） */
  maxTokens?: number;
}

export interface SocialLlmResult {
  longform: ComposedLongform;
  /** platform → 導流文案（同平台多帳號共用） */
  copies: Record<string, string>;
  usage: { model: string; tokens_in: number; tokens_out: number };
}

const PLATFORM_RULES: Record<string, string> = {
  instagram: "Instagram：香港女生語氣，開頭一句 hook，3–5 個重點 bullet，emoji 適量（✨👉），最後 5 個 hashtag",
  threads: "Threads：口語、短、像同朋友講嘢，1–2 句加一條問題，1–2 個 hashtag",
  facebook: "Facebook：較完整嘅兩段，說明文章講咩，可放連結，2–3 個 hashtag",
  xiaohongshu: "小紅書：內地女生語氣，🔥 開頭，用「姊妹們」、1️⃣2️⃣3️⃣ 列點，5–6 個 hashtag",
  youtube: "YouTube：描述欄文案，兩段，清楚講今集重點",
  other: "其他平台：簡短兩段 + 2 個 hashtag",
};

/**
 * 診斷用：列出 xAI 可用模型（順便驗證 key 與網路）。
 * 只回傳 id 與耗時，不洩漏任何憑證。
 */
export async function listGrokModels(
  timeoutMs = 20_000,
): Promise<{ status: number; elapsed_ms: number; models: string[]; error?: string }> {
  const key = apiKey();
  const startedAt = Date.now();
  if (!key) {
    return { status: 0, elapsed_ms: 0, models: [], error: "缺少 XAI_API_KEY" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.x.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    const text = await response.text();
    let models: string[] = [];
    try {
      const payload = JSON.parse(text) as { data?: { id?: string }[] };
      models = (payload.data ?? [])
        .map((item) => String(item.id ?? ""))
        .filter(Boolean)
        .sort();
    } catch {
      // 讓呼叫端看到原始錯誤
    }
    return {
      status: response.status,
      elapsed_ms: Date.now() - startedAt,
      models,
      ...(response.ok ? {} : { error: text.slice(0, 300) }),
    };
  } catch (error) {
    return {
      status: 0,
      elapsed_ms: Date.now() - startedAt,
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(input: SocialLlmInput): string {
  const platforms = [...new Set(input.platforms.filter(Boolean))];
  const copySpec = platforms
    .map((platform) => `  "${platform}": "${PLATFORM_RULES[platform] || PLATFORM_RULES.other}"`)
    .join(",\n");

  return [
    "你是一位香港美妝生活媒體的資深內容編輯，請為以下熱點寫一篇文章，並為每個平台寫一段導流文案。",
    "",
    "## 熱點",
    `標題：${input.eventTitle}`,
    input.eventSummary ? `摘要：${input.eventSummary}` : "（沒有摘要，請按標題自行判斷重點）",
    input.groupName ? `品牌組：${input.groupName}` : "",
    input.eventUrl ? `原文連結：${input.eventUrl}` : "",
    "",
    "## 文章要求",
    "- 繁體中文（香港用語），語氣專業但易讀，不要內地簡體用語",
    "- 只有一個 H1（不要在 body_md 內），正文用 Markdown，**剛好 5 個 H2 小節**",
    "- 每節 2–4 段，總字數 700–1000 字",
    "- 具體、可執行；不要編造醫療療效、不要用「最」「保證」「第一」等絕對化宣稱",
    "- 不要輸出 JSON 以外的任何文字",
    "",
    "## 每個平台導流文案的要求",
    copySpec,
    "每個平台 80–180 字，必須自然、可直接貼上；同平台多個帳號會共用同一份，所以不要提到具體帳號名。",
    "",
    "## 輸出 JSON（嚴格照這個 schema，不要 markdown 圍欄）",
    JSON.stringify(
      {
        title: "文章標題，10–40 字，含關鍵字",
        excerpt: "摘要 80–140 字",
        body_md: "## 小節一\\n\\n內容…（共 5 個 H2）",
        hashtags: ["3–6 個 hashtag，不含 #"],
        copies: Object.fromEntries(platforms.map((platform) => [platform, "該平台文案"])),
      },
      null,
      2,
    ),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function extractJson(raw: string): unknown {
  const trimmed = (raw || "").trim();
  if (!trimmed) throw new SocialLlmError("empty", "Grok 沒有回傳內容");
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new SocialLlmError("bad_json", "Grok 輸出不是合法 JSON");
  }
}

/**
 * 判斷兩則新聞的關係（AIHOT 式聚簇的「模型判斷」步驟）。
 *
 * 為什麼不是 Yes/No：實測（AIHOT）二元問法在「同一件事」上拒絕掉近一半真配對；
 * 改成四種關係 + 信心度後，才分得清「同一次發生／直接進展／不同事／綜合稿」。
 *
 * 關係定義與判斷方法移植自 AIHOT `industry/prompts/group-definitions.md`／`group-method.md`。
 */
export const EVENT_RELATIONS = [
  'SAME_OCCURRENCE',
  'SAME_STORY',
  'UNRELATED',
  'ROUNDUP',
] as const;
export type EventRelation = (typeof EVENT_RELATIONS)[number];

/** 只有這兩種關係算「同一件事」；ROUNDUP／UNRELATED 都不合併 */
export const SAME_EVENT_RELATIONS: readonly EventRelation[] = ['SAME_OCCURRENCE', 'SAME_STORY'];
/** 合併需要的信心度（AIHOT 的 TIE_MIN_CONFIDENCE） */
export const SAME_EVENT_MIN_CONFIDENCE = 0.75;

const RELATION_DEFINITIONS = [
  'SAME_OCCURRENCE（同一次發生）：同一個主體在同一時間對同一個具體對象做的同一件事。跨語言轉述、不同媒體的側重、細節多寡，不改變身份。同一場發布、同一判決、同一報告、同一場訪談、同一促銷／同一截止日期的重複宣傳，都算；但同一公司同一天的不同獨立發布要分開判斷。',
  'SAME_STORY（同一事件的不同進展）：不是同一次發生，但圍繞同一個具體發生有直接先後關係：預告與正式發布；發布與之後的上架、評測、實測、榜單、回應、後續披露。兩個各自獨立的新功能或新成績，不能只因為同一產品、同一週期就歸到同一事件。',
  'UNRELATED（不同的事）：不同產品或不同版本的兩次不同發布；同一公司同一天兩件不同事；同一話題的不同研究、不同觀點、不同事故；只是提到同一品牌或產品。教程、用法分享、個人觀點、營銷帖，除非明確針對候選那一次具體發生，否則都是 UNRELATED。',
  'ROUNDUP（綜合稿）：其中一方匯集多個獨立發生，把對方的事件當成多個條目之一（多話題盤點、日報、週報、大會回顧）。綜合稿與其中某個單事件報導不能合併。',
].join('\n');

const RELATION_METHOD = [
  '判斷方法：先看每篇是否實質報導了多個獨立發生，是綜合稿就先判 ROUNDUP；再各自用一句話說清楚「誰、對什麼、做了什麼、何時」，逐對比較。',
  '拿不准 SAME_OCCURRENCE 與 SAME_STORY 時問自己：如果兩篇都是真的，世界上是發生了一件事，還是先後發生了兩件有直接關係的事？',
].join('\n');

export interface EventRelationVerdict {
  relation: EventRelation;
  confidence: number;
  reason: string;
  usage: { model: string; tokens_in: number; tokens_out: number };
}

/**
 * 判斷兩則資料的關係。
 *
 * `pass = 'review'` 是 AIHOT 的「寫入前再讓模型覆核一遍」：用同一個模型、
 * 換一個更嚴格的視角，只決定「是否同一次發生／直接進展」。召回分數不夠高時才呼叫。
 */
export async function judgeEventRelation(input: {
  titleA: string;
  summaryA?: string | null;
  titleB: string;
  summaryB?: string | null;
  pass?: 'first' | 'review';
  model?: string;
  timeoutMs?: number;
}): Promise<EventRelationVerdict | null> {
  const key = apiKey();
  if (!key) return null;

  const model = input.model || grokModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 20_000);
  const review = input.pass === 'review';
  const prompt = [
    review
      ? '你是新聞事件的覆核編輯。主編認為以下兩則可能是同一件事，請獨立重讀後再判斷一次。'
      : '你是新聞事件編輯。判斷以下兩則報導的關係：',
    '',
    RELATION_DEFINITIONS,
    '',
    RELATION_METHOD,
    review
      ? '覆核視角：把兩篇各自讀成「一次具體發生」。只有主體、對象、動作都對得上，或後一篇是前一篇的直接進展，才合併；只是同一品牌、同一話題、同一品類，一律 UNRELATED。'
      : '',
    '',
    `A：${input.titleA}`,
    input.summaryA ? `A 摘要：${String(input.summaryA).slice(0, 300)}` : '',
    `B：${input.titleB}`,
    input.summaryB ? `B 摘要：${String(input.summaryB).slice(0, 300)}` : '',
    '',
    '只輸出 JSON：{"relation":"SAME_OCCURRENCE|SAME_STORY|UNRELATED|ROUNDUP","confidence":0到1,"reason":"30 字內理由"}',
  ]
    .filter((line) => line !== '')
    .join('\n');

  try {
    const response = await fetchWithAiUsage(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你只輸出合法 JSON，不要加任何解釋或 markdown 圍欄。' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    }, { feature: "content-automation", operation: review ? "social_dedupe_review" : "social_dedupe", provider: "grok", model });
    const text = await response.text();
    if (!response.ok) return null;
    const payload = JSON.parse(text) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const parsed = extractJson(payload.choices?.[0]?.message?.content ?? '') as {
      relation?: unknown;
      confidence?: unknown;
      reason?: unknown;
    };
    const relation = String(parsed.relation ?? '').trim().toUpperCase();
    if (!(EVENT_RELATIONS as readonly string[]).includes(relation)) return null;
    const confidence = Number(parsed.confidence);
    return {
      relation: relation as EventRelation,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
      reason: String(parsed.reason ?? '').slice(0, 120),
      usage: {
        model,
        tokens_in: Number(payload.usage?.prompt_tokens) || 0,
        tokens_out: Number(payload.usage?.completion_tokens) || 0,
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 向後相容：舊呼叫端只要 Yes/No，這裡把四種關係收斂成同一個答案 */
export async function judgeSameEvent(input: {
  titleA: string;
  summaryA?: string | null;
  titleB: string;
  summaryB?: string | null;
  model?: string;
  timeoutMs?: number;
}): Promise<{
  same: boolean;
  reason: string;
  usage: { model: string; tokens_in: number; tokens_out: number };
} | null> {
  const verdict = await judgeEventRelation(input);
  if (!verdict) return null;
  return {
    same:
      SAME_EVENT_RELATIONS.includes(verdict.relation) &&
      verdict.confidence >= SAME_EVENT_MIN_CONFIDENCE,
    reason: verdict.reason,
    usage: verdict.usage,
  };
}

/**
 * 用 Grok 產生一批內容。失敗一律拋 SocialLlmError，由呼叫端 fallback 模板。
 */
export async function composeWithGrok(input: SocialLlmInput): Promise<SocialLlmResult> {
  const key = apiKey();
  if (!key) throw new SocialLlmError("not_configured", "缺少 XAI_API_KEY");

  const model = input.model || grokModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchWithAiUsage(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: input.maxTokens ?? 2_400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你只輸出合法 JSON，不要加任何解釋或 markdown 圍欄。" },
          { role: "user", content: buildPrompt(input) },
        ],
      }),
      signal: controller.signal,
    }, { feature: "content-automation", operation: "social", provider: "grok", model });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SocialLlmError("timeout", `Grok 逾時（${input.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms）`);
    }
    throw new SocialLlmError(
      "network",
      `Grok 連線失敗：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const textBody = await response.text();
  if (!response.ok) {
    throw new SocialLlmError(
      `http_${response.status}`,
      `Grok 回應 ${response.status}：${textBody.slice(0, 300)}`,
    );
  }

  let payload: {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    payload = JSON.parse(textBody);
  } catch {
    throw new SocialLlmError("bad_response", "Grok 回應無法解析");
  }

  const content = payload.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content) as Record<string, unknown>;

  const title = String(parsed.title ?? "").trim();
  const excerpt = String(parsed.excerpt ?? "").trim();
  const body = String(parsed.body_md ?? parsed.body ?? "").trim();
  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.map((tag) => String(tag).replace(/^#/, "").trim()).filter(Boolean)
    : [];
  const rawCopies = (parsed.copies ?? {}) as Record<string, unknown>;
  const copies: Record<string, string> = {};
  for (const platform of input.platforms) {
    const value = String(rawCopies[platform] ?? "").trim();
    if (value) copies[platform] = value;
  }

  if (!title || !body || (body.match(/^## /gm) || []).length < 3) {
    throw new SocialLlmError("invalid_content", "Grok 回傳的內容不完整（缺標題或小節不足）");
  }
  if (Object.keys(copies).length === 0) {
    throw new SocialLlmError("invalid_copies", "Grok 沒有回傳任何平台文案");
  }

  return {
    longform: {
      title,
      excerpt: excerpt || body.replace(/[#*_]/g, "").slice(0, 120),
      body_md: body,
      hashtags,
    },
    copies,
    usage: {
      model,
      tokens_in: Number(payload.usage?.prompt_tokens) || 0,
      tokens_out: Number(payload.usage?.completion_tokens) || 0,
    },
  };
}
