import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CANONICAL_SITE_URL } from "../../../src/lib/siteUrl.ts";
import {
  dbError,
  failJson,
  guardMethod,
  okJson,
  readBody,
  requireActor,
  requireAction,
  serviceClient,
  type ContentActor,
} from "../_shared/contentAuth.ts";
import {
  getResendApiKey,
  isResendApiKeyConfigured,
  sendResendEmail,
} from "../_shared/resend.ts";
import {
  addDaysToDateString,
  digestIdempotencyKey,
  domainFromUrl,
  HONG_KONG_TIME_ZONE,
  todayInZone,
  truncateText,
  zonedWallTimeToUtc,
} from "../../../src/lib/contentFormat.ts";
import {
  buildDigestEmail,
  buildDigestStats,
  buildDigestSubject,
  normalizeRecipients,
  type DigestArticleRef,
  type DigestSiteRef,
  type DigestSlotRef,
  type DigestUsageRef,
} from "../../../src/lib/contentDigest.ts";
import type {
  ContentAction,
  ContentArticle,
  ContentArticleStatus,
  ContentDigestEmail,
  ContentDigestPending,
  ContentDigestStats,
  ContentEmailDigest,
  ContentSettings,
  ContentSite,
  ContentSiteProfile,
  ContentSlot,
} from "../../../src/lib/contentTypes.ts";

/**
 * content-digest · 每日內容日報（PRD §9.2.4、M2-12）
 *
 * actions（POST JSON body；回應 { ok, data } / { ok:false, code, error }）：
 *   preview  view            回 ContentDigestEmail（組 HTML／text，不寄、不落庫）
 *   send     manage_settings 寄送 → upsert content_email_digests（status='sent'）
 *   resend   manage_settings 同日重寄（body.resend=true 亦可）
 *
 * 同時允許 service_role 呼叫：requireActor 會把 service 視為 management，
 * 因此 cron／worker 可直接重用同一段邏輯（本檔是 content-worker send_digest 的獨立複本）。
 *
 * 寄送失敗 → 保留 HTML、status='failed'，UI 可重寄；
 * 未設定 Resend → status='draft' 並回 200（不算失敗，PRD §9.2.4）。
 */

type Db = ReturnType<typeof serviceClient>;

const HKT = HONG_KONG_TIME_ZONE;
const ACTION_PERMISSIONS: Record<string, ContentAction> = {
  preview: "view",
  send: "manage_settings",
  resend: "manage_settings",
};
const DIGEST_PENDING_ARTICLE_STATUSES: ContentArticleStatus[] = [
  "draft",
  "pending_review",
  "changes_requested",
  "held",
  "approved",
  "scheduled",
  "publishing",
  "publish_failed",
  "verify_failed",
];

// ============================================================
// 小工具
// ============================================================

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "未知錯誤");
}

function nowIso(): string {
  return new Date().toISOString();
}

function appOrigin(): string {
  return (Deno.env.get("APP_PUBLIC_URL") || CANONICAL_SITE_URL).replace(/\/+$/, "");
}

function resolveDigestDate(body: Record<string, unknown>): string {
  const raw = text(body.date);
  if (!raw) return todayInZone(HKT);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new InvalidPayloadError(`date 必須是 YYYY-MM-DD（收到：${raw}）`);
  }
  return raw;
}

class InvalidPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPayloadError";
  }
}

// ============================================================
// DB 讀取（與 content-worker 的 loadDigestStats 刻意重複：
// 兩支函式必須能獨立部署，且只准動這三個交付檔）
// ============================================================

async function loadSettings(supabase: Db): Promise<ContentSettings> {
  const { data, error } = await supabase
    .from("content_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(`讀取 content_settings 失敗：${dbError(error)}`);
  const row = (data ?? {}) as Partial<ContentSettings>;
  return {
    id: "default",
    model: row.model || "gemini-2.5-flash",
    daily_article_limit: Number(row.daily_article_limit ?? 0),
    daily_llm_call_limit: Number(row.daily_llm_call_limit ?? 30),
    digest_time: row.digest_time || "09:00",
    digest_enabled: Boolean(row.digest_enabled ?? false),
    digest_recipients: Array.isArray(row.digest_recipients) ? row.digest_recipients : [],
    breaker_mode: row.breaker_mode || "full",
    feature_flags: row.feature_flags || {},
    created_at: row.created_at || nowIso(),
    updated_at: row.updated_at || nowIso(),
  };
}

async function loadProfiles(
  supabase: Db,
  siteIds: string[],
): Promise<Map<string, ContentSiteProfile>> {
  const map = new Map<string, ContentSiteProfile>();
  const unique = [...new Set(siteIds.filter(Boolean))];
  if (!unique.length) return map;
  const { data, error } = await supabase
    .from("webandsystem_list")
    .select("id, website_name, domain_url, platform, brand, status, level")
    .in("id", unique);
  if (error) return map;
  for (const row of (data ?? []) as ContentSiteProfile[]) map.set(row.id, row);
  return map;
}

/** 從 DB 組出 buildDigestStats 的輸入（統計口徑為香港時間「日」） */
async function loadDigestStats(
  supabase: Db,
  date: string,
): Promise<{ stats: ContentDigestStats; email: ContentDigestEmail }> {
  const now = new Date();
  const windowStart = zonedWallTimeToUtc(addDaysToDateString(date, -7), "00:00", HKT);
  const windowStartIso = windowStart.toISOString();
  const dayStartIso = zonedWallTimeToUtc(date, "00:00", HKT).toISOString();
  const dayEndIso = zonedWallTimeToUtc(addDaysToDateString(date, 1), "00:00", HKT).toISOString();

  const sitesRes = await supabase
    .from("content_sites")
    .select("*")
    .neq("status", "archived")
    .order("website_profile_id", { ascending: true });
  if (sitesRes.error) throw new Error(`讀取站點失敗：${dbError(sitesRes.error)}`);
  const siteRows = (sitesRes.data ?? []) as ContentSite[];
  const profiles = await loadProfiles(
    supabase,
    siteRows.map((site) => site.website_profile_id),
  );
  const sites: DigestSiteRef[] = siteRows.map((site) => {
    const profile = profiles.get(site.website_profile_id);
    return {
      id: site.website_profile_id,
      name: profile?.website_name || site.website_profile_id,
      domain: domainFromUrl(profile?.domain_url ?? null),
      timezone: site.timezone || HKT,
    };
  });
  const siteById = new Map(siteRows.map((site) => [site.website_profile_id, site]));
  const siteIds = sites.map((site) => site.id);

  const articles: DigestArticleRef[] = [];
  const slots: DigestSlotRef[] = [];
  const usage: DigestUsageRef[] = [];
  const extraPending: ContentDigestPending[] = [];

  if (siteIds.length) {
    const [slotRes, recentRes, pendingRes, publishedRes, usageRes, deadJobRes] = await Promise.all([
      supabase
        .from("content_slots")
        .select("*")
        .in("site_id", siteIds)
        .gte("publish_at", windowStartIso)
        .order("publish_at", { ascending: true })
        .limit(1_000),
      supabase
        .from("content_articles")
        .select("*")
        .in("site_id", siteIds)
        .gte("created_at", windowStartIso)
        .limit(1_000),
      supabase
        .from("content_articles")
        .select("*")
        .in("site_id", siteIds)
        .in("status", DIGEST_PENDING_ARTICLE_STATUSES)
        .limit(1_000),
      supabase
        .from("content_articles")
        .select("*")
        .in("site_id", siteIds)
        .gte("published_at", windowStartIso)
        .limit(500),
      supabase
        .from("content_llm_usage")
        .select("tokens_in, tokens_out, cost_usd")
        .gte("created_at", dayStartIso)
        .lt("created_at", dayEndIso)
        .limit(2_000),
      supabase
        .from("content_jobs")
        .select("type, last_error, updated_at")
        .eq("status", "dead")
        .gte("updated_at", dayStartIso)
        .limit(10),
    ]);
    if (slotRes.error) throw new Error(`讀取排程失敗：${dbError(slotRes.error)}`);
    if (recentRes.error) throw new Error(`讀取文章失敗：${dbError(recentRes.error)}`);
    if (pendingRes.error) throw new Error(`讀取待審文章失敗：${dbError(pendingRes.error)}`);
    if (usageRes.error) throw new Error(`讀取用量失敗：${dbError(usageRes.error)}`);

    for (const row of (slotRes.data ?? []) as ContentSlot[]) {
      slots.push({
        site_id: row.site_id,
        publish_at: row.publish_at,
        status: row.status,
        keyword_id: row.keyword_id,
        article_id: row.article_id,
      });
    }

    const articleMap = new Map<string, DigestArticleRef>();
    const articleRows = [
      ...((recentRes.data ?? []) as ContentArticle[]),
      ...((pendingRes.data ?? []) as ContentArticle[]),
      ...((publishedRes.data ?? []) as ContentArticle[]),
    ];
    for (const row of articleRows) {
      const site = siteById.get(row.site_id);
      articleMap.set(row.id, {
        site_id: row.site_id,
        status: row.status,
        title: row.title,
        created_at: row.created_at,
        scheduled_publish_at: row.scheduled_publish_at,
        published_at: row.published_at,
        updated_at: row.updated_at,
        publish_mode: site?.publish_mode ?? "manual",
      });
    }
    articles.push(...articleMap.values());

    for (const row of (usageRes.data ?? []) as {
      tokens_in: number;
      tokens_out: number;
      cost_usd: number;
    }[]) {
      usage.push({
        tokens_in: Number(row.tokens_in) || 0,
        tokens_out: Number(row.tokens_out) || 0,
        cost_usd: Number(row.cost_usd) || 0,
      });
    }

    for (const row of (deadJobRes.data ?? []) as { type: string; last_error: string | null }[]) {
      extraPending.push({
        siteName: "系統",
        label: `Job 已放棄：${row.type}`,
        detail: truncateText(row.last_error || "沒有錯誤訊息", 160),
      });
    }
    for (const site of siteRows) {
      if (site.health !== "down") continue;
      extraPending.push({
        siteName: profiles.get(site.website_profile_id)?.website_name || site.website_profile_id,
        label: "站點異常",
        detail: "健康檢查為 down，相關排程會轉為保留",
      });
    }
  }

  const stats = buildDigestStats({
    date,
    sites,
    slots,
    articles,
    usage,
    extraPending,
    now,
  });
  const email = buildDigestEmail({ stats, siteOrigin: appOrigin() });
  return { stats, email };
}

async function loadDigestRecord(
  supabase: Db,
  date: string,
): Promise<ContentEmailDigest | null> {
  const { data, error } = await supabase
    .from("content_email_digests")
    .select("*")
    .eq("digest_date", date)
    .maybeSingle();
  if (error) throw new Error(`讀取日報紀錄失敗：${dbError(error)}`);
  return (data as ContentEmailDigest | null) ?? null;
}

async function upsertDigestRecord(
  supabase: Db,
  date: string,
  patch: {
    recipients: string[];
    subject: string;
    html: string;
    summary: ContentDigestStats;
    status: ContentEmailDigest["status"];
    sentAt: string | null;
    error: string | null;
  },
): Promise<ContentEmailDigest> {
  const { data, error } = await supabase
    .from("content_email_digests")
    .upsert(
      {
        digest_date: date,
        recipients: patch.recipients,
        subject: patch.subject,
        html: patch.html,
        summary: patch.summary,
        status: patch.status,
        sent_at: patch.sentAt,
        error: patch.error,
      },
      { onConflict: "digest_date" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`寫入日報紀錄失敗：${dbError(error)}`);
  return data as ContentEmailDigest;
}

// ============================================================
// actions
// ============================================================

/** preview：只組信，不寄、不寫庫（M2-13 預覽） */
async function previewDigest(
  supabase: Db,
  body: Record<string, unknown>,
): Promise<Response> {
  const date = resolveDigestDate(body);
  const { email } = await loadDigestStats(supabase, date);
  return okJson(email);
}

/** send／resend：真正寄送並寫 content_email_digests（M2-12） */
async function sendDigest(
  supabase: Db,
  action: "send" | "resend",
  body: Record<string, unknown>,
): Promise<Response> {
  const date = resolveDigestDate(body);
  const allowResend = action === "resend" || body.resend === true;

  const settings = await loadSettings(supabase);
  const recipients = normalizeRecipients(settings.digest_recipients);
  if (!recipients.length) {
    return failJson(400, "no_recipients", "未設定日報收件人（content_settings.digest_recipients 為空）");
  }

  const { stats, email } = await loadDigestStats(supabase, date);
  const existing = await loadDigestRecord(supabase, date);
  if (existing?.status === "sent" && !allowResend) {
    // 同日已寄出：send 直接回既有紀錄（冪等）；resend=true 才重寄
    return okJson(existing);
  }

  const subject = email.subject || buildDigestSubject(stats);
  const base = {
    recipients,
    subject,
    html: email.html,
    summary: stats,
  };

  // 未設定 Resend：回 200 + status='draft'，HTML 仍落庫（PRD §9.2.4）
  if (!isResendApiKeyConfigured(getResendApiKey())) {
    const record = await upsertDigestRecord(supabase, date, {
      ...base,
      status: "draft",
      sentAt: null,
      error: "未設定 Resend（RESEND_API_KEY），日報 HTML 已保存但未寄出",
    });
    return okJson(record);
  }

  try {
    await sendResendEmail({
      to: recipients,
      subject,
      html: email.html,
      text: email.text,
      idempotencyKey: digestIdempotencyKey(date),
    });
  } catch (error) {
    // 寄送失敗：保留 HTML、status='failed'（PRD §12），並以 502 讓 UI 顯示錯誤可重寄
    const message = truncateText(errorMessage(error), 1_000);
    await upsertDigestRecord(supabase, date, {
      ...base,
      status: "failed",
      sentAt: null,
      error: message,
    });
    return failJson(502, "email_failed", `日報寄送失敗：${message}`);
  }

  const record = await upsertDigestRecord(supabase, date, {
    ...base,
    status: "sent",
    sentAt: nowIso(),
    error: null,
  });
  return okJson(record);
}

// ============================================================
// 入口
// ============================================================

Deno.serve(async (req: Request) => {
  const guard = guardMethod(req);
  if (guard) return guard;

  let actor: ContentActor | undefined;
  try {
    const auth = await requireActor(req);
    if (auth.response) return auth.response;
    actor = auth.actor;
  } catch (error) {
    return failJson(401, "invalid_session", errorMessage(error));
  }
  if (!actor) return failJson(401, "invalid_session", "無法識別呼叫者");

  const body = await readBody<Record<string, unknown>>(req);
  const action = text(body.action);
  const permission = ACTION_PERMISSIONS[action];
  if (!permission) {
    return failJson(400, "unknown_action", `不支援的 action：${action || "(空)"}（可用 preview／send／resend）`);
  }
  const denied = requireAction(actor, permission);
  if (denied) return denied;

  let supabase: Db;
  try {
    supabase = serviceClient();
  } catch (error) {
    return failJson(500, "config_missing", errorMessage(error));
  }

  try {
    if (action === "preview") return await previewDigest(supabase, body);
    return await sendDigest(supabase, action as "send" | "resend", body);
  } catch (error) {
    if (error instanceof InvalidPayloadError) {
      return failJson(400, "invalid_payload", error.message);
    }
    console.error("content-digest: unexpected error", errorMessage(error));
    return failJson(500, "digest_failed", errorMessage(error));
  }
});
