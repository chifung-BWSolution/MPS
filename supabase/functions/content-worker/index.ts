import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import { CANONICAL_SITE_URL } from "../../../src/lib/siteUrl.ts";
import {
  dbError,
  failJson,
  guardMethod,
  okJson,
  readBody,
  requireServiceRole,
  serviceClient,
} from "../_shared/contentAuth.ts";
import { generateArticleWithLlm, llmConfigured } from "../_shared/contentLlm.ts";
import {
  AdapterError,
  getContentAdapter,
  type AdapterArticleInput,
  type AdapterImage,
  type AdapterSite,
  type AdapterVerifyResult,
  type ContentAdapter,
} from "../_shared/contentAdapters/index.ts";
import { ContentVaultError, unsealCredential } from "../_shared/contentVault.ts";
import {
  getResendApiKey,
  isResendApiKeyConfigured,
  sendResendEmail,
} from "../_shared/resend.ts";
import {
  addDaysToDateString,
  addMinutes,
  canonicalUrl,
  contentIdempotencyKey,
  DEFAULT_BRAND_VOICE,
  DEFAULT_SEO_DEFAULTS,
  digestIdempotencyKey,
  domainFromUrl,
  ensureUniqueSlug,
  getZonedParts,
  HONG_KONG_TIME_ZONE,
  hashString,
  todayInZone,
  truncateText,
  zonedWallTimeToUtc,
} from "../../../src/lib/contentFormat.ts";
import {
  buildArticleJsonLd,
  buildBrief,
  renderMarkdownToHtml,
  selectKeywordCandidate,
} from "../../../src/lib/contentGenerate.ts";
import {
  buildSvgCard,
  buildAssetTags,
  packageImagePath,
  pickAssetsByTags,
} from "../../../src/lib/contentMedia.ts";
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
import {
  buildPackageMeta,
  buildPackagePlan,
  type PackagePlanInput,
} from "../../../src/lib/contentPackage.ts";
import { planSlots, validateCadence } from "../../../src/lib/contentPlanner.ts";
import { evaluateSeoQa } from "../../../src/lib/contentSeoQa.ts";
import { assertTransition, canTransition, isApprovedForPublish } from "../../../src/lib/contentState.ts";
import { ContentLlmError } from "../_shared/contentLlm.ts";
import type {
  ContentArticle,
  ContentArticleStatus,
  ContentAsset,
  ContentDigestEmail,
  ContentDigestPending,
  ContentDigestStats,
  ContentEmailDigest,
  ContentGeneratedArticle,
  ContentJob,
  ContentJobPayloads,
  ContentKeyword,
  ContentLlmUsageInfo,
  ContentQaCheck,
  ContentQaReport,
  ContentSettings,
  ContentSite,
  ContentSitePage,
  ContentSiteProfile,
  ContentSiteSection,
  ContentSlot,
  ContentSlotStatus,
  ContentVerifyReport,
} from "../../../src/lib/contentTypes.ts";
import type { ContentDigestStatus, ContentSeoDefaults } from "../../../src/lib/contentTypes.ts";

/**
 * content-worker · 社媒自動化營運的 job 執行器（PRD §7.2、§9.2、§9.3）
 *
 * 呼叫方式（只允許 service_role，見 _shared/contentAuth.requireServiceRole）：
 *   POST /functions/v1/content-worker                       → 認領並執行 job（100 秒預算）
 *   POST /functions/v1/content-worker?enqueue=plan_slots    → 為 active 站點排入 plan job
 *   POST /functions/v1/content-worker?enqueue=send_digest   → digest_time 對時後排入日報
 *   POST /functions/v1/content-worker?enqueue=site_health   → 排入站點健康與 sitemap 刷新
 *
 * 對應 job 與 PRD 節號：
 *   plan_slots          §9.2.2   cadence → 30 天 slots（冪等 upsert）
 *   generate_article    §9.2.3   七步生成（守門 → 挑詞 → brief → LLM → QA → 配圖 → 寫入）
 *   publish_article     §9.3.4   v1 manual：內容包 zip 上 Storage ＋ 通知
 *   verify_publish      §9.3.4   抓 live URL 驗收（200／title／meta／canonical／JSON-LD／noindex／封面）
 *   refresh_site_pages  §9.1.2   sitemap.xml → content_site_pages（內鏈候選）
 *   site_health         §9.1.2   設定完整度 + HEAD 網域 → content_site_checks
 *   send_digest         §9.2.4   buildDigestStats／buildDigestEmail → Resend → content_email_digests
 */

type Db = ReturnType<typeof serviceClient>;

const HKT = HONG_KONG_TIME_ZONE;
const STORAGE_BUCKET = "content-assets";
const MAX_ERROR_LENGTH = 1_000;
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;
/** 整支函式的自我預算；剩餘 < RESERVE_MS 就不再認領下一個 job（M2-07） */
const BUDGET_MS = 100_000;
const RESERVE_MS = 15_000;
/** 各 job 至少需要的剩餘預算，不足就讓位（退回 queued，不消耗 attempts） */
const JOB_MIN_BUDGET_MS: Record<string, number> = {
  generate_article: 45_000,
  publish_article: 25_000,
  verify_publish: 20_000,
  send_digest: 15_000,
  plan_slots: 10_000,
  refresh_site_pages: 10_000,
  site_health: 10_000,
};
const RETRY_DELAY_MINUTES = [1, 5, 15];
/** UNIQUE(site_id, keyword_id) 撞到時最多再試幾個候選詞（PRD §12 slug／關鍵字衝突） */
const MAX_KEYWORD_ROUNDS = 5;
const CLUSTER_COOLDOWN_DAYS = 14;
const SITEMAP_MAX_PAGES = 500;
const VERIFY_RETRY_LIMIT = 3;

const ARTICLE_FILLED_SLOT_STATUSES: ContentSlotStatus[] = [
  "in_review",
  "approved",
  "scheduled",
  "publishing",
  "published",
];
const REGENERATE_HELD_REASONS = ["生成失敗", "額度不足"];
const REVIEW_PENDING_ARTICLE_STATUSES: ContentArticleStatus[] = [
  "draft",
  "pending_review",
  "changes_requested",
];
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
  if (error instanceof Error) return error.message;
  return String(error ?? "未知錯誤");
}

function truncate(value: string, max = MAX_ERROR_LENGTH): string {
  const clean = (value || "").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function appOrigin(): string {
  return (Deno.env.get("APP_PUBLIC_URL") || CANONICAL_SITE_URL).replace(/\/+$/, "");
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSeoDefaults(site: ContentSite): ContentSeoDefaults {
  return { ...DEFAULT_SEO_DEFAULTS, ...(site.seo_defaults || {}) };
}

function siteNorthStar(site: ContentSite, profile: ContentSiteProfile | null): { profile: ContentSiteProfile } {
  return {
    profile:
      profile ??
      {
        id: site.website_profile_id,
        website_name: site.website_profile_id,
        domain_url: null,
        platform: null,
        brand: null,
        status: null,
        level: null,
      },
  };
}

/**
 * JSON-LD 保底：src/lib/contentGenerate.buildArticleJsonLd 目前尚未解構 params
 * （呼叫時會 ReferenceError，已回報 Lead 由 lib owner 修）。這裡先試共用函式，
 * 失敗再用等效的最小實作，確保生成／產包不會因為一個欄位而整批失敗。
 */
function safeArticleJsonLd(params: Parameters<typeof buildArticleJsonLd>[0]): Record<string, unknown> {
  try {
    return buildArticleJsonLd(params);
  } catch {
    const seoDefaults = params.seoDefaults;
    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": seoDefaults.jsonLdType || "BlogPosting",
      headline: truncateText(params.article.title, 110),
      description: truncateText(params.article.excerpt || "", 200),
      inLanguage: seoDefaults.locale,
      mainEntityOfPage: { "@type": "WebPage", "@id": params.liveUrl || params.canonical },
      url: params.liveUrl || params.canonical,
    };
    if (params.article.updated_at) jsonLd.dateModified = params.article.updated_at;
    if (params.coverUrl) jsonLd.image = [params.coverUrl];
    if (seoDefaults.author) jsonLd.author = { "@type": "Person", name: seoDefaults.author };
    if (seoDefaults.publisher) {
      jsonLd.publisher = { "@type": "Organization", name: seoDefaults.publisher };
    }
    if (params.section?.name) jsonLd.articleSection = params.section.name;
    if (params.wordCount) jsonLd.wordCount = params.wordCount;
    return jsonLd;
  }
}

function extensionForMime(mime: string | null | undefined): "svg" | "png" | "jpg" | "webp" {
  const value = (mime || "").toLowerCase();
  if (value.includes("svg")) return "svg";
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("webp")) return "webp";
  return "png";
}

/** webandsystem_list.domain_url → 可用 origin（保留 www；站點可能只在 www 回應） */
function toBaseUrl(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return null;
  }
}

/** job 內部可辨識的失敗（可重試／不可重試、錯誤碼寫進 last_error） */
class JobFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = true) {
    super(message);
    this.name = "JobFailure";
    this.code = code;
    this.retryable = retryable;
  }
}

type HandlerResult =
  | { outcome: "done"; detail?: Record<string, unknown> }
  | { outcome: "deferred"; detail?: Record<string, unknown> };

function done(detail?: Record<string, unknown>): HandlerResult {
  return { outcome: "done", detail };
}

interface JobContext {
  supabase: Db;
  job: ContentJob;
  startedAt: number;
}

// ============================================================
// DB 讀取
// ============================================================

async function loadSite(supabase: Db, siteId: string): Promise<ContentSite | null> {
  const { data, error } = await supabase
    .from("content_sites")
    .select("*")
    .eq("website_profile_id", siteId)
    .maybeSingle();
  if (error) throw new JobFailure("site_load_failed", dbError(error), true);
  return (data as ContentSite | null) ?? null;
}

async function loadActiveSites(supabase: Db): Promise<ContentSite[]> {
  const { data, error } = await supabase
    .from("content_sites")
    .select("*")
    .eq("status", "active")
    .order("website_profile_id", { ascending: true });
  if (error) throw new JobFailure("site_load_failed", dbError(error), true);
  return (data ?? []) as ContentSite[];
}

async function loadProfile(supabase: Db, siteId: string): Promise<ContentSiteProfile | null> {
  const { data, error } = await supabase
    .from("webandsystem_list")
    .select("id, website_name, domain_url, platform, brand, status, level")
    .eq("id", siteId)
    .maybeSingle();
  if (error) {
    // 主檔缺漏不應讓生成中斷（content_sites 有 FK，正常情況不會發生）
    return null;
  }
  return (data as ContentSiteProfile | null) ?? null;
}

async function loadProfiles(supabase: Db, siteIds: string[]): Promise<Map<string, ContentSiteProfile>> {
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

async function loadSettings(supabase: Db): Promise<ContentSettings> {
  const { data, error } = await supabase
    .from("content_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new JobFailure("settings_load_failed", dbError(error), true);
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

async function loadSlot(supabase: Db, slotId: string): Promise<ContentSlot | null> {
  const { data, error } = await supabase
    .from("content_slots")
    .select("*")
    .eq("id", slotId)
    .maybeSingle();
  if (error) throw new JobFailure("slot_load_failed", dbError(error), true);
  return (data as ContentSlot | null) ?? null;
}

async function loadArticle(supabase: Db, articleId: string): Promise<ContentArticle | null> {
  const { data, error } = await supabase
    .from("content_articles")
    .select("*")
    .eq("id", articleId)
    .maybeSingle();
  if (error) throw new JobFailure("article_load_failed", dbError(error), true);
  return (data as ContentArticle | null) ?? null;
}

async function loadSitePages(supabase: Db, siteId: string): Promise<ContentSitePage[]> {
  const { data, error } = await supabase
    .from("content_site_pages")
    .select("*")
    .eq("site_id", siteId)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) return [];
  return (data ?? []) as ContentSitePage[];
}

async function loadExistingSlugs(supabase: Db, siteId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("content_articles")
    .select("slug")
    .eq("site_id", siteId)
    .limit(2_000);
  if (error) return [];
  return (data ?? []).map((row) => text((row as { slug?: unknown }).slug)).filter(Boolean);
}

async function loadExistingTitles(supabase: Db, siteId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("content_articles")
    .select("title")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return (data ?? []).map((row) => text((row as { title?: unknown }).title)).filter(Boolean);
}

/** planner 只挑 pipeline_status='backlog'；slot 已人工指派的詞優先（PRD §9.2.2 規則 5） */
async function loadBacklogKeywords(
  supabase: Db,
  siteId: string,
  preferredKeywordId: string | null,
): Promise<ContentKeyword[]> {
  const { data, error } = await supabase
    .from("seo_keywords")
    .select("*")
    .eq("website_profile_id", siteId)
    .eq("pipeline_status", "backlog")
    .order("priority", { ascending: false, nullsFirst: false })
    .order("keyword", { ascending: true })
    .limit(200);
  if (error) throw new JobFailure("keyword_load_failed", dbError(error), true);
  const keywords = (data ?? []) as ContentKeyword[];
  if (!preferredKeywordId) return keywords;
  const preferredIndex = keywords.findIndex((keyword) => keyword.id === preferredKeywordId);
  if (preferredIndex <= 0) return keywords;
  const reordered = [...keywords];
  const [preferred] = reordered.splice(preferredIndex, 1);
  reordered.unshift(preferred);
  return reordered;
}

/** 同 cluster 14 天冷卻：從既有關鍵字的 last_used_at 聚合 */
async function loadRecentClusterUsage(
  supabase: Db,
  siteId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("seo_keywords")
    .select("cluster, last_used_at")
    .eq("website_profile_id", siteId)
    .not("cluster", "is", null)
    .not("last_used_at", "is", null)
    .order("last_used_at", { ascending: false })
    .limit(500);
  if (error) return {};
  const recent: Record<string, string> = {};
  for (const row of (data ?? []) as { cluster: string | null; last_used_at: string | null }[]) {
    const cluster = text(row.cluster);
    const lastUsed = text(row.last_used_at);
    if (!cluster || !lastUsed) continue;
    if (!recent[cluster] || recent[cluster] < lastUsed) recent[cluster] = lastUsed;
  }
  return recent;
}

async function hasArticleForKeyword(
  supabase: Db,
  siteId: string,
  keywordId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("content_articles")
    .select("id")
    .eq("site_id", siteId)
    .eq("keyword_id", keywordId)
    .limit(1);
  if (error) throw new JobFailure("article_lookup_failed", dbError(error), true);
  return (data ?? []).length > 0;
}

// ============================================================
// 狀態寫入（都先過 contentState 的轉換表）
// ============================================================

function transitionFailure(error: unknown): JobFailure {
  return new JobFailure("invalid_transition", errorMessage(error), false);
}

async function setSlotStatus(
  supabase: Db,
  slot: Pick<ContentSlot, "id" | "status">,
  to: ContentSlotStatus,
  articleId?: string | null,
): Promise<void> {
  const from = slot.status as ContentSlotStatus;
  if (from !== to) {
    try {
      assertTransition("slot", from, to);
    } catch (error) {
      throw transitionFailure(error);
    }
  }
  const patch: Record<string, unknown> = { status: to };
  if (articleId !== undefined) patch.article_id = articleId;
  if (to !== "held") patch.reason = null;
  const { error } = await supabase.from("content_slots").update(patch).eq("id", slot.id);
  if (error) throw new JobFailure("slot_update_failed", dbError(error), true);
  slot.status = to;
}

async function setKeywordStatus(
  supabase: Db,
  keyword: Pick<ContentKeyword, "id" | "pipeline_status">,
  to: ContentKeyword["pipeline_status"],
): Promise<void> {
  const from = keyword.pipeline_status;
  if (from !== to) {
    try {
      if (!from) throw new Error(`keyword ${keyword.id} 沒有 pipeline_status`);
      assertTransition("keyword", from, to as string);
    } catch (error) {
      throw transitionFailure(error);
    }
  }
  const patch: Record<string, unknown> = { pipeline_status: to };
  const { error } = await supabase.from("seo_keywords").update(patch).eq("id", keyword.id);
  if (error) throw new JobFailure("keyword_update_failed", dbError(error), true);
  keyword.pipeline_status = to;
}

async function finishKeyword(supabase: Db, keyword: Pick<ContentKeyword, "id">): Promise<void> {
  const { error } = await supabase
    .from("seo_keywords")
    .update({ pipeline_status: "in_review", last_used_at: nowIso() })
    .eq("id", keyword.id);
  if (error) throw new JobFailure("keyword_update_failed", dbError(error), true);
}

async function holdSlot(supabase: Db, slot: Pick<ContentSlot, "id" | "status">, reason: string): Promise<void> {
  const from = slot.status as ContentSlotStatus;
  if (from !== "held") {
    try {
      assertTransition("slot", from, "held");
    } catch (error) {
      throw transitionFailure(error);
    }
  }
  const { error } = await supabase
    .from("content_slots")
    .update({ status: "held", reason: truncate(reason, 500) })
    .eq("id", slot.id);
  if (error) throw new JobFailure("slot_update_failed", dbError(error), true);
  slot.status = "held";
}

async function setArticleStatus(
  supabase: Db,
  article: ContentArticle,
  to: ContentArticleStatus,
  patch: Record<string, unknown> = {},
): Promise<ContentArticle> {
  const from = article.status;
  if (from !== to) {
    try {
      assertTransition("article", from, to);
    } catch (error) {
      throw transitionFailure(error);
    }
  }
  const { data, error } = await supabase
    .from("content_articles")
    .update({ status: to, ...patch })
    .eq("id", article.id)
    .select("*")
    .single();
  if (error) throw new JobFailure("article_update_failed", dbError(error), true);
  // 與 setSlotStatus／setKeywordStatus 一致：同步本地物件，避免同一 job 內
  // 後續再用舊 status 做狀態機檢查（scheduled → published 會被擋）。
  article.status = to;
  return data as ContentArticle;
}

// ============================================================
// Job 佇列工具
// ============================================================

function defaultMaxAttempts(type: string): number {
  // PRD §7.2：生成 2 次、發布 3 次；其餘沿用預設 3
  return type === "generate_article" ? 2 : 3;
}

/**
 * 建立 job；content_jobs_dedupe_idx 已存在（queued/running）時視為成功（M2-07）。
 * 回傳 1 = 新建、0 = 已存在。
 */
async function enqueueJob(
  supabase: Db,
  type: ContentJob["type"],
  payload: Record<string, unknown>,
  options: { runAt?: string; maxAttempts?: number } = {},
): Promise<number> {
  const { error } = await supabase.from("content_jobs").insert({
    type,
    payload,
    status: "queued",
    run_at: options.runAt || nowIso(),
    max_attempts: options.maxAttempts ?? defaultMaxAttempts(type),
  });
  if (!error) return 1;
  const code = (error as { code?: string }).code ?? "";
  if (code === "23505") return 0;
  throw new JobFailure("enqueue_failed", dbError(error), true);
}

/** 崩潰恢復：running 且鎖過期 → queued（PRD §7.2） */
async function recoverStalledJobs(supabase: Db): Promise<number> {
  const now = nowIso();
  const { data, error } = await supabase
    .from("content_jobs")
    .update({ status: "queued", locked_by: null, locked_until: null, run_at: now })
    .eq("status", "running")
    .lt("locked_until", now)
    .select("id");
  if (error) return 0;
  return (data ?? []).length;
}

/** worker 讓位時把未執行的 job 放回佇列，並退回 claim 時加上的 attempts */
async function releaseClaimedJobs(supabase: Db, jobs: ContentJob[]): Promise<number> {
  if (!jobs.length) return 0;
  let released = 0;
  for (const job of jobs) {
    const { error } = await supabase
      .from("content_jobs")
      .update({
        status: "queued",
        attempts: Math.max(0, Number(job.attempts || 1) - 1),
        locked_by: null,
        locked_until: null,
        run_at: nowIso(),
      })
      .eq("id", job.id);
    if (!error) released += 1;
  }
  return released;
}

/**
 * 到點生成：tick 時補上 generate_article job（PRD §9.2.2 規則 6）。
 * 只在 daily_article_limit > 0 時補（出廠 0 = 不自動跑，PRD §6.6 規則 7）。
 */
async function enqueueDueGenerationJobs(supabase: Db): Promise<number> {
  const settings = await loadSettings(supabase);
  if (settings.daily_article_limit <= 0) return 0;

  const { data, error } = await supabase
    .from("content_slots")
    .select("id, site_id, generate_at")
    .eq("status", "planned")
    .is("article_id", null)
    .lte("generate_at", nowIso())
    .order("generate_at", { ascending: true })
    .limit(10);
  if (error || !(data ?? []).length) return 0;

  let enqueued = 0;
  for (const row of (data ?? []) as Pick<ContentSlot, "id" | "site_id" | "generate_at">[]) {
    const { data: existing } = await supabase
      .from("content_jobs")
      .select("id, status")
      .eq("type", "generate_article")
      .eq("payload->>slot_id", row.id)
      .in("status", ["queued", "running", "done"])
      .limit(1);
    if ((existing ?? []).length > 0) continue;
    enqueued += await enqueueJob(supabase, "generate_article", {
      slot_id: row.id,
      dedupe_key: `generate:${row.id}`,
    });
  }
  return enqueued;
}

/** M3-13：審核逾期 → article／slot 轉 held，永不自動發布（PRD §9.3.3、§12） */
async function holdOverdueReviews(supabase: Db): Promise<number> {
  const sites = await loadActiveSites(supabase);
  if (!sites.length) return 0;
  const siteById = new Map(sites.map((site) => [site.website_profile_id, site]));
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("content_slots")
    .select("*")
    .in("status", ["in_review", "draft_ready"])
    .lte("publish_at", horizon)
    .order("publish_at", { ascending: true })
    .limit(100);
  if (error || !(data ?? []).length) return 0;

  let held = 0;
  for (const slot of (data ?? []) as ContentSlot[]) {
    const site = siteById.get(slot.site_id);
    if (!site) continue;
    const cutoffHours = Number(site.cadence?.review_cutoff_hours ?? 4);
    const deadline = new Date(new Date(slot.publish_at).getTime() - cutoffHours * 3_600_000);
    if (now.getTime() < deadline.getTime()) continue;

    const article = slot.article_id ? await loadArticle(supabase, slot.article_id) : null;
    if (article) {
      if (!REVIEW_PENDING_ARTICLE_STATUSES.includes(article.status)) continue;
      await setArticleStatus(supabase, article, "held", {
        reason: truncate("審核逾期：已過審核截止仍未批准，永不自動發布", 500),
      });
    }
    await holdSlot(supabase, slot, "審核逾期：已過審核截止仍未批准");
    held += 1;
  }
  return held;
}

// ============================================================
// 主迴圈
// ============================================================

async function runJob(ctx: JobContext): Promise<HandlerResult> {
  switch (ctx.job.type) {
    case "plan_slots":
      return runPlanSlotsJob(ctx);
    case "generate_article":
      return runGenerateArticleJob(ctx);
    case "publish_article":
      return runPublishArticleJob(ctx);
    case "verify_publish":
      return runVerifyPublishJob(ctx);
    case "refresh_site_pages":
      return runRefreshSitePagesJob(ctx);
    case "site_health":
      return runSiteHealthJob(ctx);
    case "send_digest":
      return runSendDigestJob(ctx);
    case "delete_article":
      return runDeleteArticleJob(ctx);
    default:
      throw new JobFailure("unknown_job_type", `未知的 job 類型：${ctx.job.type}`, false);
  }
}

async function finishJob(supabase: Db, job: ContentJob): Promise<void> {
  const { error } = await supabase
    .from("content_jobs")
    .update({
      status: "done",
      finished_at: nowIso(),
      last_error: null,
      locked_by: null,
      locked_until: null,
    })
    .eq("id", job.id);
  if (error) {
    // 寫不回 done 也別讓整輪爆掉：鎖過期後由崩潰恢復重新排隊
    console.error("content-worker: finishJob failed", dbError(error));
  }
}

async function failJob(
  supabase: Db,
  job: ContentJob,
  error: unknown,
): Promise<{ status: "queued" | "dead"; code: string }> {
  const failure = error instanceof JobFailure ? error : null;
  const code = failure?.code ?? "unexpected_error";
  const retryable = failure?.retryable ?? true;
  const message = truncate(`${code}: ${errorMessage(error)}`);
  const attempts = Number(job.attempts || 1);
  const maxAttempts = Math.max(1, Number(job.max_attempts || 3));

  if (retryable && attempts < maxAttempts) {
    const delayMinutes =
      RETRY_DELAY_MINUTES[Math.min(Math.max(attempts, 1), RETRY_DELAY_MINUTES.length) - 1];
    const { error: updateError } = await supabase
      .from("content_jobs")
      .update({
        status: "queued",
        run_at: addMinutes(new Date(), delayMinutes).toISOString(),
        last_error: message,
        locked_by: null,
        locked_until: null,
      })
      .eq("id", job.id);
    if (updateError) console.error("content-worker: failJob requeue failed", dbError(updateError));
    return { status: "queued", code };
  }

  const { error: deadError } = await supabase
    .from("content_jobs")
    .update({
      status: "dead",
      finished_at: nowIso(),
      last_error: message,
      locked_by: null,
      locked_until: null,
    })
    .eq("id", job.id);
  if (deadError) console.error("content-worker: failJob dead failed", dbError(deadError));
  return { status: "dead", code };
}

async function runWorker(
  supabase: Db,
  body: Record<string, unknown>,
): Promise<Response> {
  const startedAt = Date.now();
  const worker = text(body.worker) || `worker-${crypto.randomUUID().slice(0, 8)}`;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT));

  const crashed = await recoverStalledJobs(supabase);
  // 附加流程失敗不應擋住佇列派工（例如剛部署、content_settings 尚未建立）
  let enqueued = 0;
  try {
    enqueued = await enqueueDueGenerationJobs(supabase);
  } catch (error) {
    console.warn("content-worker: enqueue due generation failed", errorMessage(error));
  }
  let overdueHeld = 0;
  try {
    overdueHeld = await holdOverdueReviews(supabase);
  } catch (error) {
    console.warn("content-worker: overdue review scan failed", errorMessage(error));
  }

  const { data, error } = await supabase.rpc("content_claim_jobs", {
    p_worker: worker,
    p_limit: limit,
  });
  if (error) return failJson(500, "claim_failed", `認領 job 失敗：${dbError(error)}`);

  const claimed = (data ?? []) as ContentJob[];
  let processed = 0;
  let failed = 0;
  let dead = 0;
  let deferred = 0;
  let released = 0;

  for (let index = 0; index < claimed.length; index += 1) {
    const job = claimed[index];
    const remaining = BUDGET_MS - (Date.now() - startedAt);
    const minBudget = JOB_MIN_BUDGET_MS[job.type] ?? 8_000;
    if (remaining < Math.max(minBudget, RESERVE_MS)) {
      // 讓位：還沒跑的 job 退回 queued，下一輪 tick 再處理
      released = await releaseClaimedJobs(supabase, claimed.slice(index));
      break;
    }

    try {
      const result = await runJob({ supabase, job, startedAt });
      if (result.outcome === "deferred") {
        deferred += 1;
        continue;
      }
      await finishJob(supabase, job);
      processed += 1;
    } catch (jobError) {
      const outcome = await failJob(supabase, job, jobError);
      if (outcome.status === "dead") dead += 1;
      else failed += 1;
    }
  }

  return okJson({
    worker,
    claimed: claimed.length,
    processed,
    failed,
    dead,
    deferred,
    released,
    crashed_requeued: crashed,
    generate_enqueued: enqueued,
    overdue_held: overdueHeld,
    duration_ms: Date.now() - startedAt,
  });
}

// ============================================================
// plan_slots（PRD §9.2.2）
// ============================================================

async function runPlanSlotsJob(ctx: JobContext): Promise<HandlerResult> {
  const { supabase, job } = ctx;
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const siteId = text(payload.site_id);
  const horizonDays = Math.min(120, Math.max(1, Number(payload.horizon_days) || 30));

  const sites = siteId
    ? [await loadSite(supabase, siteId)].filter((site): site is ContentSite => Boolean(site))
    : await loadActiveSites(supabase);

  let attempted = 0;
  const warnings: string[] = [];
  for (const site of sites) {
    if (site.status !== "active") continue;
    const result = planSlots({
      siteId: site.website_profile_id,
      cadence: site.cadence,
      timezone: site.timezone || HKT,
      horizonDays,
    });
    warnings.push(...result.warnings.map((warning) => `${site.website_profile_id}: ${warning}`));
    if (!result.slots.length) continue;

    const rows = result.slots.map((slot) => ({
      site_id: slot.site_id,
      publish_at: slot.publish_at,
      generate_at: slot.generate_at,
      status: "planned",
    }));
    // unique(site_id, publish_at) 冪等；ignoreDuplicates 讓「已有文章／已發布」的 slot 完全不被覆蓋
    const { error } = await supabase.from("content_slots").upsert(rows, {
      onConflict: "site_id,publish_at",
      ignoreDuplicates: true,
    });
    if (error) throw new JobFailure("plan_slots_failed", dbError(error), true);
    attempted += rows.length;
  }

  return done({ sites: sites.length, attempted, warnings: warnings.slice(0, 20) });
}

// ============================================================
// generate_article（PRD §9.2.3 七步、M2-08 / M2-09 / M2-10）
// ============================================================

/** M2-09：額度守門（以 content_llm_usage 與 content_articles 當日計數為準） */
async function checkDailyQuota(
  supabase: Db,
  settings: ContentSettings,
): Promise<{ exceeded: boolean; disabled: boolean; reason: string | null }> {
  const date = todayInZone(HKT);
  const dayStart = zonedWallTimeToUtc(date, "00:00", HKT).toISOString();
  const dayEnd = zonedWallTimeToUtc(addDaysToDateString(date, 1), "00:00", HKT).toISOString();

  const articleLimit = Number(settings.daily_article_limit ?? 0);
  if (!Number.isFinite(articleLimit) || articleLimit <= 0) {
    // 出廠 0 = 新功能預設關閉（PRD §6.6 規則 7）；不是「額度用盡」，不排隔日重試
    return { exceeded: true, disabled: true, reason: "每日生成上限為 0（尚未啟用自動生成）" };
  }
  const callLimit = Number(settings.daily_llm_call_limit ?? 30);

  const [calls, articles] = await Promise.all([
    supabase
      .from("content_llm_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd),
    supabase
      .from("content_articles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayStart),
  ]);
  if (calls.error) throw new JobFailure("quota_check_failed", dbError(calls.error), true);
  if (articles.error) throw new JobFailure("quota_check_failed", dbError(articles.error), true);

  const callCount = Number(calls.count ?? 0);
  const articleCount = Number(articles.count ?? 0);
  if (Number.isFinite(callLimit) && callLimit > 0 && callCount >= callLimit) {
    return { exceeded: true, disabled: false, reason: `今日 LLM 呼叫 ${callCount}/${callLimit} 已達上限` };
  }
  if (articleCount >= articleLimit) {
    return { exceeded: true, disabled: false, reason: `今日已生成 ${articleCount}/${articleLimit} 篇` };
  }
  return { exceeded: false, disabled: false, reason: null };
}

/** 超限時把 job 順延到次日 00:05（HKT），並把 attempts 歸零避免連續多天被判定 dead */
async function deferJobToNextDay(supabase: Db, job: ContentJob, reason: string): Promise<void> {
  const date = todayInZone(HKT);
  const runAt = zonedWallTimeToUtc(addDaysToDateString(date, 1), "00:05", HKT).toISOString();
  const { error } = await supabase
    .from("content_jobs")
    .update({
      status: "queued",
      attempts: 0,
      run_at: runAt,
      last_error: truncate(`額度不足：順延至 ${runAt}（${reason}）`),
      locked_by: null,
      locked_until: null,
    })
    .eq("id", job.id);
  if (error) throw new JobFailure("job_defer_failed", dbError(error), true);
}

/** Gemini 呼叫 timeout 依剩餘預算收斂，避免單一 job 吃掉整支函式（M2-07 100 秒預算） */
function llmTimeoutForBudget(remainingMs: number): number {
  const perAttempt = Math.floor((remainingMs - 15_000) / 2);
  return Math.max(20_000, Math.min(45_000, perAttempt));
}

function llmErrorCode(error: unknown): string {
  return error instanceof ContentLlmError ? error.code : "upstream_error";
}

function llmRetryable(error: unknown): boolean {
  if (error instanceof ContentLlmError) return error.retryable;
  return true;
}

interface CoverResult {
  coverAssetId: string | null;
  /** 自動產生的圖卡才需要 rollback 清理；素材庫的既有 asset 不動 */
  generated: boolean;
  storagePath: string | null;
  warnings: string[];
}

/**
 * PRD §9.2.3 步驟 6：素材庫標籤匹配 → 否則 SVG 圖卡 → 上傳 storage → 寫 content_assets。
 * 這一步失敗只記 warning，不讓生成 job 失敗。
 */
async function ensureCoverAsset(params: {
  supabase: Db;
  siteId: string;
  articleId: string;
  title: string;
  keyword: string;
  cluster: string | null;
  sectionName: string | null;
  brand: string | null;
}): Promise<CoverResult> {
  const { supabase, siteId, articleId, title, keyword, cluster, brand } = params;
  const warnings: string[] = [];
  const tags = buildAssetTags({ keyword, cluster, sectionName: params.sectionName });

  try {
    const { data, error } = await supabase
      .from("content_assets")
      .select("*")
      .or(`site_id.eq.${siteId},site_id.is.null`)
      .like("mime_type", "image/%")
      .limit(60);
    if (error) throw error;
    const assets = (data ?? []) as ContentAsset[];
    const wanted = new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
    const matched = assets.filter((asset) =>
      (asset.tags || []).some((tag) => wanted.has((tag || "").trim().toLowerCase())),
    );
    const picked = pickAssetsByTags(matched, tags, 1);
    if (picked.length > 0) {
      return { coverAssetId: picked[0].id, generated: false, storagePath: null, warnings };
    }
  } catch (error) {
    warnings.push(`素材庫查詢失敗：${errorMessage(error)}`);
  }

  try {
    const svg = buildSvgCard({
      title,
      subtitle: keyword,
      brand,
      variant: "cover",
    });
    const bytes = new TextEncoder().encode(svg);
    const storagePath = `sites/${siteId}/covers/${articleId}.svg`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, bytes, { contentType: "image/svg+xml", upsert: true });
    if (uploadError) throw uploadError;

    const { data: asset, error: assetError } = await supabase
      .from("content_assets")
      .insert({
        site_id: siteId,
        bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        filename: `${articleId}.svg`,
        mime_type: "image/svg+xml",
        bytes: bytes.byteLength,
        source: "vector",
        tags,
        alt: truncate(title, 200),
        license_info: "MPS 自動生成圖卡",
        width: 1200,
        height: 675,
      })
      .select("*")
      .single();
    if (assetError) throw assetError;
    return {
      coverAssetId: (asset as ContentAsset).id,
      generated: true,
      storagePath,
      warnings,
    };
  } catch (error) {
    warnings.push(`圖卡生成失敗：${errorMessage(error)}`);
    return { coverAssetId: null, generated: false, storagePath: null, warnings };
  }
}

async function cleanupGeneratedCover(supabase: Db, cover: CoverResult): Promise<void> {
  if (!cover.generated) return;
  try {
    if (cover.coverAssetId) {
      await supabase.from("content_assets").delete().eq("id", cover.coverAssetId);
    }
    if (cover.storagePath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([cover.storagePath]);
    }
  } catch (error) {
    console.warn("content-worker: cover cleanup failed", errorMessage(error));
  }
}

async function recordLlmUsage(params: {
  supabase: Db;
  siteId: string;
  articleId: string | null;
  jobId: string;
  usage: ContentLlmUsageInfo;
}): Promise<string | null> {
  const { error, data } = await params.supabase
    .from("content_llm_usage")
    .insert({
      site_id: params.siteId,
      article_id: params.articleId,
      job_id: params.jobId,
      model: params.usage.model,
      use_case: "generate_article",
      tokens_in: Math.round(Number(params.usage.tokens_in) || 0),
      tokens_out: Math.round(Number(params.usage.tokens_out) || 0),
      cost_usd: Number(params.usage.cost_usd) || 0,
    })
    .select("id")
    .single();
  if (error) {
    // 用量紀錄失敗不影響已發生的生成（記 log 供人工補）
    console.error("content-worker: recordLlmUsage failed", dbError(error));
    return null;
  }
  return text((data as { id?: unknown })?.id) || null;
}

type InsertArticleOutcome =
  | { kind: "created"; article: ContentArticle }
  | { kind: "keyword_conflict" }
  | { kind: "slug_conflict" }
  | { kind: "error"; error: JobFailure };

async function tryInsertArticle(
  supabase: Db,
  row: Record<string, unknown>,
): Promise<InsertArticleOutcome> {
  const { data, error } = await supabase
    .from("content_articles")
    .insert(row)
    .select("*")
    .single();
  if (!error) return { kind: "created", article: data as ContentArticle };

  const code = (error as { code?: string }).code ?? "";
  const message = errorMessage(error);
  if (code === "23505") {
    // UNIQUE(site_id, keyword_id) 或 UNIQUE(site_id, slug)
    return /keyword/i.test(message) ? { kind: "keyword_conflict" } : { kind: "slug_conflict" };
  }
  return { kind: "error", error: new JobFailure("article_insert_failed", dbError(error), true) };
}

async function runGenerateArticleJob(ctx: JobContext): Promise<HandlerResult> {
  const { supabase, job, startedAt } = ctx;
  const payload = (job.payload ?? {}) as ContentJobPayloads["generate_article"];
  const slotId = text((payload as Record<string, unknown>).slot_id);
  if (!slotId) throw new JobFailure("invalid_payload", "generate_article 缺少 slot_id", false);

  // ---- 步驟 1：取 slot／site，確認可生成 ----
  const slot = await loadSlot(supabase, slotId);
  if (!slot) throw new JobFailure("slot_not_found", `找不到排程格 ${slotId}`, false);
  if (slot.status === "published" || slot.status === "skipped") {
    return done({ skipped: "slot_closed" });
  }
  if (slot.article_id && ARTICLE_FILLED_SLOT_STATUSES.includes(slot.status)) {
    return done({ skipped: "slot_already_filled", article_id: slot.article_id });
  }
  if (
    slot.status === "held" &&
    !REGENERATE_HELD_REASONS.some((prefix) => (slot.reason || "").startsWith(prefix))
  ) {
    return done({ skipped: "slot_held_manually" });
  }
  if (!["planned", "generating", "held"].includes(slot.status)) {
    return done({ skipped: `slot_status_${slot.status}` });
  }

  const site = await loadSite(supabase, slot.site_id);
  if (!site) throw new JobFailure("site_not_found", `站點 ${slot.site_id} 不存在`, false);
  if (site.status !== "active") {
    await holdSlot(supabase, slot, `站點狀態為 ${site.status}，暫不生成`);
    return done({ held: "site_inactive" });
  }
  if (site.health === "down") {
    await holdSlot(supabase, slot, "站點健康異常（down），暫不生成");
    return done({ held: "site_down" });
  }

  // ---- 步驟 2（M2-09）：額度守門 ----
  const settings = await loadSettings(supabase);
  const quota = await checkDailyQuota(supabase, settings);
  if (quota.exceeded) {
    if (quota.disabled) {
      // 功能未啟用：slot 保持 planned，job 直接完成；啟用後下一輪 tick 會補上生成
      return done({ skipped: "generation_disabled", reason: quota.reason });
    }
    await holdSlot(supabase, slot, `額度不足：${quota.reason ?? ""}`);
    await deferJobToNextDay(supabase, job, quota.reason ?? "額度不足");
    return {
      outcome: "deferred",
      detail: { reason: "quota", hold_reason: quota.reason },
    };
  }
  if (!llmConfigured()) {
    throw new JobFailure("llm_not_configured", "缺少 GEMINI_API_KEY，無法生成內容", false);
  }

  // ---- 步驟 3：slot → generating、挑 backlog 關鍵字 ----
  await setSlotStatus(supabase, slot, "generating");
  const profile = await loadProfile(supabase, slot.site_id);
  const { profile: siteProfile } = siteNorthStar(site, profile);
  const keywords = await loadBacklogKeywords(supabase, slot.site_id, slot.keyword_id);
  const recentByCluster = await loadRecentClusterUsage(supabase, slot.site_id);
  const sitePages = await loadSitePages(supabase, slot.site_id);
  const existingSlugs = await loadExistingSlugs(supabase, slot.site_id);
  const existingTitles = await loadExistingTitles(supabase, slot.site_id);

  let pool = keywords;
  let keyConflict = false;
  for (let round = 0; round < MAX_KEYWORD_ROUNDS; round += 1) {
    const candidate = selectKeywordCandidate(pool, {
      clusterCooldownDays: CLUSTER_COOLDOWN_DAYS,
      recentByCluster,
      now: new Date(),
    });
    if (!candidate) break;
    const keyword = candidate.keyword;
    pool = pool.filter((item) => item.id !== keyword.id);

    // UNIQUE(site_id, keyword_id)：已有文章就換下一個候選
    if (await hasArticleForKeyword(supabase, slot.site_id, keyword.id)) {
      keyConflict = true;
      continue;
    }

    try {
      const article = await generateArticleForKeyword({
        supabase,
        job,
        startedAt,
        slot,
        site,
        profile: siteProfile,
        settings,
        keyword,
        sitePages,
        existingSlugs,
        existingTitles,
      });
      return done({ article_id: article.id, keyword_id: keyword.id, round: round + 1 });
    } catch (error) {
      if (error instanceof KeywordConflictError) {
        keyConflict = true;
        continue;
      }
      throw error;
    }
  }

  await holdSlot(supabase, slot, keyConflict ? "關鍵字已使用" : "缺關鍵字");
  return done({ held: keyConflict ? "keyword_already_used" : "missing_keyword" });
}

/** 內部訊號：UNIQUE(site_id, keyword_id) 撞到，換下一個候選詞 */
class KeywordConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeywordConflictError";
  }
}

/**
 * 單一候選詞的完整生成流程：brief → LLM → QA → 配圖 → 寫入文章／slot／keyword／usage。
 * LLM 失敗時會 hold slot 並把 keyword 退回 backlog，然後丟可重試的 JobFailure。
 */
/**
 * 為生成文章挑選站內欄目（PRD §9.1.3 categoryMap）。
 *
 * 規則：
 *   1. `seo_defaults.categoryMap` 命中（key 出現在 keyword.cluster／keyword）→ 用對應欄目
 *   2. 否則第一個 content_type='article'，再退回 'post'，最後任一欄目
 *   3. 站點沒有欄目 → null（不阻擋生成；Confirm 會顯示「未指定欄目」）
 */
async function resolveSectionForGeneration(
  supabase: Db,
  siteId: string,
  keyword: Pick<ContentKeyword, "keyword" | "cluster">,
  seoDefaults: ContentSeoDefaults,
): Promise<ContentSiteSection | null> {
  const { data, error } = await supabase
    .from("content_site_sections")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("content-worker: load sections failed", dbError(error));
    return null;
  }
  const sections = (data ?? []) as ContentSiteSection[];
  if (sections.length === 0) return null;

  const categoryMap = (seoDefaults.categoryMap ?? {}) as Record<string, string>;
  const haystack = `${keyword.cluster ?? ""} ${keyword.keyword ?? ""}`.toLowerCase();
  for (const [category, target] of Object.entries(categoryMap)) {
    const categoryKey = String(category ?? "").trim().toLowerCase();
    const targetKey = String(target ?? "").trim().toLowerCase();
    if (!categoryKey || !targetKey) continue;
    if (!haystack.includes(categoryKey)) continue;
    const match = sections.find((section) =>
      [section.id, section.slug, section.name]
        .map((value) => String(value ?? "").trim().toLowerCase())
        .includes(targetKey),
    );
    if (match) return match;
  }

  return (
    sections.find((section) => section.content_type === "article") ??
    sections.find((section) => section.content_type === "post") ??
    sections[0] ??
    null
  );
}

async function generateArticleForKeyword(params: {
  supabase: Db;
  job: ContentJob;
  startedAt: number;
  slot: ContentSlot;
  site: ContentSite;
  profile: ContentSiteProfile;
  settings: ContentSettings;
  keyword: ContentKeyword;
  sitePages: ContentSitePage[];
  existingSlugs: string[];
  existingTitles: string[];
}): Promise<ContentArticle> {
  const {
    supabase,
    job,
    startedAt,
    slot,
    site,
    profile,
    settings,
    keyword,
    sitePages,
    existingSlugs,
    existingTitles,
  } = params;

  await setKeywordStatus(supabase, keyword, "generating");

  const seoDefaults = normalizeSeoDefaults(site);
  const brandVoice = site.brand_voice || DEFAULT_BRAND_VOICE;
  const section = await resolveSectionForGeneration(supabase, slot.site_id, keyword, seoDefaults);

  // ---- 步驟 3–4：brief → Gemini（JSON、重試、usage 都在 _shared/contentLlm） ----
  const brief = buildBrief({
    site: { ...profile, timezone: site.timezone, locale: site.locale },
    keyword: keyword.keyword,
    keywordIntent: keyword.intent,
    cluster: keyword.cluster,
    brandVoice,
    seoDefaults,
    section,
    sitePages,
    existingTitles,
    publishAt: slot.publish_at,
  });

  let generated: ContentGeneratedArticle;
  let usage: ContentLlmUsageInfo;
  let llmAttempts = 0;
  let llmLatencyMs = 0;
  try {
    const remainingMs = BUDGET_MS - (Date.now() - startedAt);
    const llmResult = await generateArticleWithLlm({
      brief,
      model: settings.model,
      parseOptions: { brief, existingSlugs },
      timeoutMs: llmTimeoutForBudget(remainingMs),
      attempts: 2,
    });
    generated = llmResult.generated;
    usage = llmResult.usage;
    llmAttempts = llmResult.attempts;
    llmLatencyMs = llmResult.latencyMs;
  } catch (error) {
    const code = llmErrorCode(error);
    await setKeywordStatus(supabase, keyword, "backlog");
    await holdSlot(supabase, slot, `生成失敗（${code}）`);
    throw new JobFailure(`llm_${code}`, errorMessage(error), llmRetryable(error));
  }

  const usageRowId = await recordLlmUsage({
    supabase,
    siteId: slot.site_id,
    articleId: null,
    jobId: job.id,
    usage,
  });

  const generatedAt = nowIso();
  const articleId = crypto.randomUUID();
  const slug = ensureUniqueSlug(generated.slug || generated.title, existingSlugs);
  const canonical = canonicalUrl(seoDefaults.canonicalBase || profile.domain_url || "", slug);
  const bodyHtml = renderMarkdownToHtml(generated.body_md);
  const metaTitle = generated.meta_title || truncateText(generated.title, 60);
  const metaDescription = generated.meta_description || truncateText(generated.excerpt, 155);

  // ---- 步驟 5：SEO QA（未過仍存 draft，checks 標記；PRD §9.2.3） ----
  const qaReport: ContentQaReport = evaluateSeoQa({
    article: {
      title: generated.title,
      slug,
      excerpt: generated.excerpt,
      body_md: generated.body_md,
      body_html: bodyHtml,
      meta_title: metaTitle,
      meta_description: metaDescription,
      canonical,
      keyword: keyword.keyword,
    },
    seoDefaults,
    brandVoice,
    section,
    existingSlugs,
    sitePages,
    internalLinks: generated.internal_links,
    isDraft: true,
  });

  // ---- 步驟 6：配圖（素材庫 → SVG 圖卡；失敗只記 warning） ----
  const cover = await ensureCoverAsset({
    supabase,
    siteId: slot.site_id,
    articleId,
    title: generated.title,
    keyword: keyword.keyword,
    cluster: keyword.cluster,
    sectionName: section?.name ?? null,
    brand: profile.website_name,
  });

  // ---- 步驟 7：寫入 content_articles／slot／keyword／usage ----
  const articleStatus: ContentArticleStatus = qaReport.hardPassed ? "pending_review" : "draft";
  const og = {
    title: metaTitle,
    description: metaDescription,
    type: "article",
    url: canonical,
    site_name: profile.website_name,
    locale: site.locale || seoDefaults.locale,
  };
  const jsonLd = safeArticleJsonLd({
    article: {
      title: generated.title,
      excerpt: generated.excerpt,
      body_md: generated.body_md,
      body_html: bodyHtml,
      published_at: null,
      updated_at: generatedAt,
      cover_asset_id: cover.coverAssetId,
    },
    seoDefaults,
    canonical,
    liveUrl: null,
    coverUrl: null,
    section,
    wordCount: qaReport.wordCount,
  });

  const insertRow: Record<string, unknown> = {
    id: articleId,
    site_id: slot.site_id,
    section_id: section?.id ?? null,
    keyword_id: keyword.id,
    slot_id: slot.id,
    title: generated.title,
    slug,
    excerpt: generated.excerpt,
    body_md: generated.body_md,
    body_html: bodyHtml,
    cover_asset_id: cover.coverAssetId,
    image_asset_ids: cover.coverAssetId && !cover.generated ? [cover.coverAssetId] : [],
    meta_title: metaTitle,
    meta_description: metaDescription,
    canonical,
    og,
    json_ld: jsonLd,
    language: site.locale || seoDefaults.locale || "zh-HK",
    status: articleStatus,
    version: 1,
    author_id: null,
    checks: {
      report: qaReport,
      generatedAt,
      warnings: cover.warnings,
      llm: {
        model: usage.model,
        attempts: llmAttempts,
        latency_ms: llmLatencyMs,
        tokens_in: usage.tokens_in,
        tokens_out: usage.tokens_out,
      },
    },
    reason: qaReport.hardPassed ? null : "SEO 硬檢查未過：已存為草稿，等待人工處理",
  };

  let inserted = await tryInsertArticle(supabase, insertRow);
  if (inserted.kind === "keyword_conflict") {
    await setKeywordStatus(supabase, keyword, "backlog");
    await cleanupGeneratedCover(supabase, cover);
    throw new KeywordConflictError(`關鍵字 ${keyword.keyword} 已有文章`);
  }
  if (inserted.kind === "slug_conflict") {
    // 不覆蓋既有文章（PRD §12）：補可預測後綴再試一次
    const fallbackSlug = ensureUniqueSlug(
      `${slug}-${hashString(articleId).toString(36).slice(0, 4)}`,
      existingSlugs,
    );
    const fallbackCanonical = canonicalUrl(
      seoDefaults.canonicalBase || profile.domain_url || "",
      fallbackSlug,
    );
    inserted = await tryInsertArticle(supabase, {
      ...insertRow,
      slug: fallbackSlug,
      canonical: fallbackCanonical,
      og: { ...og, url: fallbackCanonical },
    });
    if (inserted.kind === "keyword_conflict") {
      await setKeywordStatus(supabase, keyword, "backlog");
      await cleanupGeneratedCover(supabase, cover);
      throw new KeywordConflictError(`關鍵字 ${keyword.keyword} 已有文章`);
    }
  }
  if (inserted.kind === "error") {
    await setKeywordStatus(supabase, keyword, "backlog");
    await cleanupGeneratedCover(supabase, cover);
    throw inserted.error;
  }
  if (inserted.kind !== "created") {
    // 補後綴後仍撞 slug：不再重試，交回 job 重試（PRD §12 不覆蓋既有文章）
    await setKeywordStatus(supabase, keyword, "backlog");
    await cleanupGeneratedCover(supabase, cover);
    throw new JobFailure("slug_conflict", `slug ${slug} 與同站既有文章衝突`, false);
  }

  const article = inserted.article;
  if (usageRowId) {
    const { error: usageLinkError } = await supabase
      .from("content_llm_usage")
      .update({ article_id: article.id })
      .eq("id", usageRowId);
    if (usageLinkError) console.warn("content-worker: link usage failed", dbError(usageLinkError));
  }

  // slot → in_review / draft_ready；keyword → in_review + last_used_at
  await setSlotStatus(
    supabase,
    slot,
    qaReport.hardPassed ? "in_review" : "draft_ready",
    article.id,
  );
  await finishKeyword(supabase, keyword);
  return article;
}

// ============================================================
// publish_article（PRD §9.3.4；v1 走 manual 內容包，M3-09）
// ============================================================

interface ArticlePackageContext {
  article: ContentArticle;
  site: ContentSite;
  profile: ContentSiteProfile;
  section: ContentSiteSection | null;
  keyword: ContentKeyword | null;
  plan: ReturnType<typeof buildPackagePlan>;
}

async function downloadStorageBytes(
  supabase: Db,
  storagePath: string,
): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * 內容包檔案組合（worker 與 content-publish 各有一份小複本：
 * 兩支函式必須能獨立部署，且不得改 _shared 之外的共用檔，因此刻意重複）。
 * PRD §9.3.5：article.html／article.md／meta.json／images／README.txt
 */
async function buildArticlePackage(
  supabase: Db,
  article: ContentArticle,
): Promise<ArticlePackageContext> {
  const site = await loadSite(supabase, article.site_id);
  if (!site) throw new JobFailure("site_not_found", `站點 ${article.site_id} 不存在`, false);
  const profile = (await loadProfile(supabase, article.site_id)) ?? {
    id: article.site_id,
    website_name: article.site_id,
    domain_url: null,
    platform: null,
    brand: null,
    status: null,
    level: null,
  };
  const section = article.section_id
    ? (((
        await supabase
          .from("content_site_sections")
          .select("*")
          .eq("id", article.section_id)
          .maybeSingle()
      ).data ?? null) as ContentSiteSection | null)
    : null;
  const keyword = article.keyword_id
    ? (((
        await supabase
          .from("seo_keywords")
          .select("*")
          .eq("id", article.keyword_id)
          .maybeSingle()
      ).data ?? null) as ContentKeyword | null)
    : null;

  const seoDefaults = normalizeSeoDefaults(site);
  const meta = buildPackageMeta({
    article,
    site: profile,
    section,
    keyword: keyword?.keyword ?? null,
    publishAt: article.scheduled_publish_at,
    mode: site.publish_mode,
  });

  // 封面素材（private bucket → 以 service_role 下載後打包）
  let coverAssetContent: PackagePlanInput["coverAssetContent"] = null;
  const figureAssets: NonNullable<PackagePlanInput["figureAssets"]> = [];
  if (article.cover_asset_id) {
    const { data: coverAsset } = await supabase
      .from("content_assets")
      .select("*")
      .eq("id", article.cover_asset_id)
      .maybeSingle();
    const asset = (coverAsset ?? null) as ContentAsset | null;
    if (asset?.storage_path) {
      const bytes = await downloadStorageBytes(supabase, asset.storage_path);
      if (bytes) {
        coverAssetContent = {
          path: packageImagePath("cover", undefined, extensionForMime(asset.mime_type)),
          content: bytes,
          contentType: asset.mime_type || "image/svg+xml",
        };
      }
    }
  }
  const figureIds = Array.isArray(article.image_asset_ids)
    ? article.image_asset_ids.filter((id) => id && id !== article.cover_asset_id).slice(0, 2)
    : [];
  for (let index = 0; index < figureIds.length; index += 1) {
    const { data: figureRow } = await supabase
      .from("content_assets")
      .select("*")
      .eq("id", figureIds[index])
      .maybeSingle();
    const figure = (figureRow ?? null) as ContentAsset | null;
    if (!figure?.storage_path) continue;
    const bytes = await downloadStorageBytes(supabase, figure.storage_path);
    if (!bytes) continue;
    figureAssets.push({
      path: packageImagePath("figure", index + 1, extensionForMime(figure.mime_type)),
      alt: figure.alt || article.title,
      content: bytes,
      contentType: figure.mime_type || "image/svg+xml",
    });
  }

  const bodyHtml =
    article.body_html || renderMarkdownToHtml(article.body_md || article.body_html || "");
  const hasJsonLd =
    article.json_ld && typeof article.json_ld === "object" && Object.keys(article.json_ld).length > 0;
  const jsonLd = (hasJsonLd
    ? article.json_ld
    : safeArticleJsonLd({
        article,
        seoDefaults,
        canonical: article.canonical || meta.canonical,
        liveUrl: article.live_url,
        coverUrl: null,
        section,
      })) as Record<string, unknown>;

  const plan = buildPackagePlan({
    article,
    site: profile,
    section,
    seoDefaults,
    meta,
    bodyHtml,
    jsonLd,
    coverPath: coverAssetContent?.path ?? null,
    figurePaths: figureAssets.map((figure) => ({ path: figure.path, alt: figure.alt })),
    mode: site.publish_mode,
    generatedAt: nowIso(),
    coverAssetContent,
    figureAssets,
  });

  return { article, site, profile, section, keyword, plan };
}

async function zipPackage(plan: ReturnType<typeof buildPackagePlan>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const file of plan.files) zip.file(file.path, file.content);
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

async function insertPublishLog(params: {
  supabase: Db;
  siteId: string | null;
  articleId: string | null;
  action: "package" | "verify" | "manual_done" | "publish" | "retry" | "approve" | "reject" | "confirm" | "schedule" | "restore" | "delete";
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  externalId?: string | null;
  url?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  idempotencyKey?: string | null;
  actorId?: string | null;
}): Promise<void> {
  const { error } = await params.supabase.from("content_publish_logs").insert({
    site_id: params.siteId,
    article_id: params.articleId,
    action: params.action,
    request: params.request ?? {},
    response: params.response ?? {},
    external_id: params.externalId ?? null,
    url: params.url ?? null,
    http_status: params.httpStatus ?? null,
    duration_ms: params.durationMs ?? null,
    idempotency_key: params.idempotencyKey ?? null,
    actor_id: params.actorId ?? null,
  });
  if (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "23505") return; // 冪等鍵已存在（重複執行）視為成功
    console.warn("content-worker: publish log failed", dbError(error));
  }
}

/** 內容包好了以後的通知信（可選；失敗不影響 job） */
async function notifyPackageReady(params: {
  supabase: Db;
  article: ContentArticle;
  packagePath: string;
  filename: string;
}): Promise<void> {
  if (!isResendApiKeyConfigured(getResendApiKey())) return;
  try {
    const settings = await loadSettings(params.supabase);
    const recipients = normalizeRecipients(settings.digest_recipients);
    if (!recipients.length) return;

    const { data: signed } = await params.supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(params.packagePath, 3600);
    const downloadUrl = signed?.signedUrl
      ? `<p><a href="${signed.signedUrl}">下載內容包（1 小時內有效）</a></p>`
      : "";
    await sendResendEmail({
      to: recipients,
      subject: `[MPS] 內容包已就緒：${truncateText(params.article.title, 60)}`,
      html: `<p>《${params.article.title}》的內容包已產生，請人工貼上後回到 MPS 回填 live URL。</p>
<p>檔名：${params.filename}</p>${downloadUrl}`,
      idempotencyKey: contentIdempotencyKey("package-notify", params.article.id, params.article.version),
    });
  } catch (error) {
    console.warn("content-worker: package notify failed", errorMessage(error));
  }
}

/** 產包失敗的最終態：scheduled 需經 publishing 才能進 publish_failed（PRD §6.3 狀態機） */
async function markArticlePublishFailed(
  supabase: Db,
  article: ContentArticle,
  reason: string,
): Promise<void> {
  let from = article.status;
  try {
    if (from !== "publish_failed") {
      if (from === "scheduled") {
        assertTransition("article", from, "publishing");
        from = "publishing";
      }
      assertTransition("article", from, "publish_failed");
    }
  } catch (error) {
    throw transitionFailure(error);
  }
  const { error } = await supabase
    .from("content_articles")
    .update({ status: "publish_failed", reason: truncate(reason, 500) })
    .eq("id", article.id);
  if (error) throw new JobFailure("article_update_failed", dbError(error), true);
}

// ============================================================
// 自動發佈（direct／draft adapter，M5-03）
//
// 只補「發佈能力」：job 仍只會在文章已 scheduled（經人工審核＋Confirm）後才被排入，
// 這裡不改任何審核／排期閘門；manual 路徑保持原樣。
// ============================================================

/** adapter → 可接受的站點憑證 kind（第一筆找到的為準） */
const ADAPTER_CREDENTIAL_KINDS: Record<string, string[]> = {
  next_custom: ["http_bearer", "http_hmac"],
  beauty100: ["beauty100_admin"],
  wordpress: ["wp_app_password"],
  shopify: ["shopify_admin"],
  webflow: ["webflow_token"],
};

interface AdapterSecretRow {
  kind: string;
  ciphertext: string;
}

/** 解密 adapter 所需憑證；沒有憑證屬「不可重試」的人為缺漏 */
async function loadAdapterSecret(
  supabase: Db,
  siteId: string,
  adapterName: string,
): Promise<string> {
  const kinds = ADAPTER_CREDENTIAL_KINDS[adapterName] ?? [];
  if (kinds.length === 0) {
    throw new JobFailure(
      "missing_credential",
      `adapter「${adapterName}」沒有對應的憑證類型，請先到站點詳情儲存憑證`,
      false,
    );
  }
  const { data, error } = await supabase
    .from("content_site_credentials")
    .select("kind, ciphertext")
    .eq("site_id", siteId)
    .in("kind", kinds);
  if (error) throw new JobFailure("credential_load_failed", dbError(error), true);

  const row = ((data ?? []) as AdapterSecretRow[]).find((item) => kinds.includes(item.kind));
  if (!row) {
    throw new JobFailure(
      "missing_credential",
      `站點尚未設定 ${kinds.join("／")} 憑證，無法自動發佈`,
      false,
    );
  }
  try {
    return await unsealCredential(row.ciphertext);
  } catch (error) {
    if (error instanceof ContentVaultError) {
      throw new JobFailure("credential_decrypt_failed", error.message, false);
    }
    throw error;
  }
}

/** 讀封面圖給 adapter（沒有封面就回 null，不阻擋發佈） */
async function loadCoverImage(
  supabase: Db,
  article: ContentArticle,
): Promise<AdapterImage | null> {
  if (!article.cover_asset_id) return null;
  const { data, error } = await supabase
    .from("content_assets")
    .select("bucket, storage_path, mime_type, filename")
    .eq("id", article.cover_asset_id)
    .maybeSingle();
  if (error || !data) return null;

  const asset = data as {
    bucket: string | null;
    storage_path: string;
    mime_type: string | null;
    filename: string | null;
  };
  const { data: blob, error: downloadError } = await supabase.storage
    .from(asset.bucket || STORAGE_BUCKET)
    .download(asset.storage_path);
  if (downloadError || !blob) return null;

  return {
    filename: asset.filename || asset.storage_path.split("/").pop() || "cover",
    contentType: asset.mime_type || "application/octet-stream",
    bytes: new Uint8Array(await blob.arrayBuffer()),
    alt: article.title,
  };
}

async function loadSlotByArticle(
  supabase: Db,
  articleId: string,
): Promise<Pick<ContentSlot, "id" | "status"> | null> {
  const { data } = await supabase
    .from("content_slots")
    .select("id, status")
    .eq("article_id", articleId)
    .maybeSingle();
  return (data as Pick<ContentSlot, "id" | "status"> | null) ?? null;
}

/** 排程格交付完成：scheduled → publishing → published（照狀態機走，不硬跳） */
async function markSlotDelivered(supabase: Db, articleId: string): Promise<void> {
  const slot = await loadSlotByArticle(supabase, articleId);
  if (!slot || slot.status === "published") return;
  try {
    if (slot.status === "scheduled") {
      await setSlotStatus(supabase, slot, "publishing", articleId);
      await setSlotStatus(supabase, { id: slot.id, status: "publishing" }, "published", articleId);
      return;
    }
    if (slot.status === "publishing") {
      await setSlotStatus(supabase, slot, "published", articleId);
      return;
    }
    console.warn(`content-worker: slot ${slot.id} 狀態 ${slot.status} 不適合標記已發佈，略過`);
  } catch (error) {
    console.warn("content-worker: mark slot delivered failed", errorMessage(error));
  }
}

/**
 * 自動發佈：呼叫 adapter 把文章送到站點 API。
 * 成功 → published（有 live URL）或 draft_published（平台只給草稿／沒有 URL）；
 * 失敗 → publish_failed + 拋 JobFailure（由既有重試機制處理，不改狀態機）。
 */
async function runAutoPublishJob(
  ctx: JobContext,
  article: ContentArticle,
  site: ContentSite,
  adapter: ContentAdapter,
): Promise<HandlerResult> {
  const { supabase } = ctx;
  const startedAt = Date.now();
  const previousStatus = article.status;

  // 審核閘門（PRD §6.3 不變量 1）：只有真的留下 reviewer_id／approved_at 的文章才可以
  // 自動送到站點。不能只靠 UI；即使有人直接改 DB 狀態，也要在這裡擋下。
  if (!isApprovedForPublish(article)) {
    const message = "未經管理員批准：文章缺少 reviewer_id／approved_at，拒絕自動發佈";
    await markArticlePublishFailed(supabase, article, message);
    throw new JobFailure("not_approved", message, false);
  }

  // 有 adapter 宣告 requiresCover（Beauty100）就必須先有封面；不要等到站點才失敗。
  if (adapter.requiresCover && !article.cover_asset_id) {
    const message = "Beauty100 發佈必須有封面圖；請先在審核工作室產生或上傳封面";
    await markArticlePublishFailed(supabase, article, message);
    throw new JobFailure("cover_required", message, false);
  }

  let current = article;
  if (previousStatus === "scheduled") {
    current = await setArticleStatus(supabase, article, "publishing");
  } else if (previousStatus !== "publishing") {
    throw new JobFailure(
      "invalid_article_status",
      `文章狀態為 ${previousStatus}，不允許自動發佈`,
      false,
    );
  }

  try {
    const profile = await loadProfile(supabase, article.site_id);
    const secret = await loadAdapterSecret(supabase, article.site_id, adapter.name);
    const cover = await loadCoverImage(supabase, article);

    const sectionResult = article.section_id
      ? await supabase
          .from("content_site_sections")
          .select("*")
          .eq("id", article.section_id)
          .maybeSingle()
      : null;
    const section = (sectionResult?.data ?? null) as ContentSiteSection | null;

    const keywordResult = article.keyword_id
      ? await supabase
          .from("seo_keywords")
          .select("keyword")
          .eq("id", article.keyword_id)
          .maybeSingle()
      : null;
    const keyword = (keywordResult?.data ?? null) as { keyword?: string | null } | null;
    const tags = [keyword?.keyword, section?.name]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(0, 5);

    const adapterSite: AdapterSite = {
      id: article.site_id,
      name: profile?.website_name ?? article.site_id,
      domain: profile?.domain_url || site.seo_defaults?.canonicalBase || null,
      publishMode: site.publish_mode,
      timezone: site.timezone,
      sectionExternalId: section?.external_id ?? null,
    };
    const adapterArticle: AdapterArticleInput = {
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt || truncateText(article.body_md ?? "", 150),
      bodyHtml: article.body_html || renderMarkdownToHtml(article.body_md ?? ""),
      bodyMd: article.body_md ?? "",
      canonical:
        article.canonical ||
        canonicalUrl(
          site.seo_defaults?.canonicalBase || profile?.domain_url || "",
          article.slug,
        ),
      metaDescription:
        article.meta_description ||
        article.excerpt ||
        truncateText(article.body_md ?? "", 155),
      metaTitle: article.meta_title,
      coverImage: cover,
      author: site.seo_defaults?.author || null,
      tags,
      keyword: keyword?.keyword ?? null,
      section: section
        ? {
            id: section.id,
            name: section.name,
            slug: section.slug,
            externalId: section.external_id,
            contentType: section.content_type,
            mapping: section.mapping,
          }
        : null,
    };

    const result = await adapter.createArticle({
      site: adapterSite,
      credentials: { secret },
      article: adapterArticle,
    });
    const durationMs = Date.now() - startedAt;
    if (!result.ok) {
      throw new JobFailure("adapter_rejected", `adapter「${adapter.name}」回報發佈未成功`, true);
    }

    const externalId = result.externalId || null;
    const publicUrl = result.liveUrl || null;
    const draftUrl = result.draftUrl || null;
    const canonical = result.canonicalUrl || adapterArticle.canonical || null;
    const wantDraft = site.publish_mode === "draft";

    let finalUrl: string | null = publicUrl;
    if (!wantDraft && externalId && publicUrl) {
      await setArticleStatus(supabase, current, "published", {
        external_id: externalId,
        live_url: publicUrl,
        canonical,
        published_at: nowIso(),
        reason: null,
      });
    } else {
      // draft 模式，或平台（如 Webflow）只建立內容但沒有公開 URL：誠實落「已建草稿」
      finalUrl = draftUrl || publicUrl;
      await setArticleStatus(supabase, current, "draft_published", {
        external_id: externalId,
        live_url: finalUrl,
        canonical,
        reason: wantDraft
          ? "已建立草稿，待站方確認後公開"
          : "平台已建立內容，但未回傳公開 URL；請在平台發佈後回填",
      });
    }

    await markSlotDelivered(supabase, article.id);

    await insertPublishLog({
      supabase,
      siteId: article.site_id,
      articleId: article.id,
      action: "publish",
      request: {
        mode: site.publish_mode,
        adapter: adapter.name,
        version: article.version,
      },
      response: {
        ok: true,
        external_id: externalId,
        url: finalUrl,
        http_status: result.httpStatus,
        raw: result.raw ?? null,
      },
      externalId,
      url: finalUrl,
      httpStatus: result.httpStatus,
      durationMs,
      idempotencyKey: contentIdempotencyKey("publish", article.id, article.version),
    });

    // 真的公開了才排「上線驗證」；草稿狀態沒有 live URL 可驗
    if (!wantDraft && publicUrl) {
      try {
        await enqueueJob(supabase, "verify_publish", {
          article_id: article.id,
          dedupe_key: `verify:${article.id}:v${article.version}`,
        });
      } catch (error) {
        // 文章已經發佈成功，不要因為驗證 job 排不進去而把文章標成失敗。
        console.warn("content-worker: enqueue verify failed", errorMessage(error));
      }
    }

    return done({
      article_id: article.id,
      adapter: adapter.name,
      mode: site.publish_mode,
      external_id: externalId,
      url: finalUrl,
    });
  } catch (error) {
    const message = errorMessage(error);
    try {
      const current = await loadArticle(supabase, article.id);
      if (
        current &&
        !["published", "draft_published", "cancelled", "manual_done"].includes(current.status)
      ) {
        await markArticlePublishFailed(supabase, current, `自動發佈失敗：${message}`);
      }
    } catch (statusError) {
      console.warn("content-worker: mark publish_failed failed", errorMessage(statusError));
    }

    const httpStatus = error instanceof AdapterError ? error.httpStatus : null;
    // 自動發佈失敗也要留一筆回執，UI 才看得到原因（不只 article.reason）。
    await insertPublishLog({
      supabase,
      siteId: article.site_id,
      articleId: article.id,
      action: "publish",
      request: {
        mode: site.publish_mode,
        adapter: adapter.name,
        version: article.version,
        failed: true,
      },
      response: {
        ok: false,
        error: message,
      },
      httpStatus,
      durationMs: Date.now() - startedAt,
      idempotencyKey: contentIdempotencyKey("publish-failed", article.id, article.version),
    });
    if (error instanceof JobFailure) throw error;
    // 沒有 HTTP status 的 adapter 錯誤要按 code 判斷：缺封面／缺網域／slug 衝突
    // 重試幾次也不會好，其餘（network_error／timeout）才值得重試。
    const nonRetryableCodes = new Set([
      "missing_cover",
      "missing_domain",
      "invalid_article",
      "invalid_category",
      "invalid_credential",
      "slug_conflict",
      "cover_upload_forbidden",
      "cover_not_public",
    ]);
    const retryable =
      error instanceof AdapterError
        ? httpStatus == null
          ? !nonRetryableCodes.has(error.code)
          : httpStatus >= 500 || httpStatus === 429
        : true;
    throw new JobFailure("adapter_publish_failed", message, retryable);
  }
}

// ============================================================
// delete_article：真正刪除站點上的文章（不是只刪 MPS 記錄）
//
// 只在文章已由 adapter 實際發佈（有 external_id）且 adapter 支援 deleteArticle 時執行；
// 成功後文章進終態 cancelled、清空 live_url、寫入 deleted_at 與 publish log(action=delete)。
// 審核／排期邏輯不變；此 job 由 content-publish 的 delete_published（approve 權限）排入。
// ============================================================

const DELETABLE_ARTICLE_STATUSES: ContentArticleStatus[] = [
  "published",
  "updating",
  "verify_failed",
  "draft_published",
];

/**
 * 從最近一次 publish 回執找 adapter 上傳的封面位置，刪文時 best-effort 清掉。
 * 舊資料沒有這個欄位就回 null；不影響刪文。
 */
async function loadPublishedCover(
  supabase: Db,
  articleId: string,
): Promise<{ bucket: string; path: string } | null> {
  const { data, error } = await supabase
    .from("content_publish_logs")
    .select("response")
    .eq("article_id", articleId)
    .eq("action", "publish")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error || !Array.isArray(data)) return null;
  // 最新一筆可能是「adopt 既有文章」的回執（沒有 cover_bucket/path），
  // 往前找第一次真正上傳封面的 publish 回執。
  for (const row of data as { response?: unknown }[]) {
    const response = row.response;
    if (!response || typeof response !== "object" || Array.isArray(response)) continue;
    const raw = (response as { raw?: unknown }).raw;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const bucket = typeof (raw as { cover_bucket?: unknown }).cover_bucket === "string"
      ? String((raw as { cover_bucket: string }).cover_bucket).trim()
      : "";
    const path = typeof (raw as { cover_path?: unknown }).cover_path === "string"
      ? String((raw as { cover_path: string }).cover_path).trim()
      : "";
    if (bucket && path) return { bucket, path };
  }
  return null;
}

async function runDeleteArticleJob(ctx: JobContext): Promise<HandlerResult> {
  const { supabase } = ctx;
  const payload = (ctx.job.payload ?? {}) as ContentJobPayloads["delete_article"];
  const articleId = text(payload.article_id);
  if (!articleId) throw new JobFailure("invalid_payload", "delete_article 缺少 article_id", false);

  const article = await loadArticle(supabase, articleId);
  if (!article) throw new JobFailure("article_not_found", `找不到文章 ${articleId}`, false);
  if (article.deleted_at) {
    return done({ skipped: "already_deleted", article_id: article.id });
  }
  if (!DELETABLE_ARTICLE_STATUSES.includes(article.status)) {
    throw new JobFailure(
      "invalid_article_status",
      `文章狀態為 ${article.status}，不可遠端刪除`,
      false,
    );
  }
  if (!article.external_id) {
    throw new JobFailure(
      "no_remote_id",
      "這篇文章沒有站點 external_id（手動內容包或尚未用 adapter 發佈），請到站點後台手動刪除",
      false,
    );
  }

  const site = await loadSite(supabase, article.site_id);
  if (!site) throw new JobFailure("site_not_found", `站點 ${article.site_id} 不存在`, false);

  const adapter = getContentAdapter(site.adapter);
  if (!adapter.deleteArticle) {
    throw new JobFailure(
      "delete_unsupported",
      `站點 adapter「${site.adapter}」不支援遠端刪除，請到站點後台手動刪除`,
      false,
    );
  }

  const startedAt = Date.now();
  const profile = await loadProfile(supabase, article.site_id);
  let secret: string;
  try {
    secret = await loadAdapterSecret(supabase, article.site_id, adapter.name);
  } catch (error) {
    await insertPublishLog({
      supabase,
      siteId: article.site_id,
      articleId: article.id,
      action: "delete",
      request: {
        article_id: article.id,
        adapter: adapter.name,
        external_id: article.external_id,
      },
      response: {
        ok: false,
        error: errorMessage(error),
      },
      externalId: article.external_id,
      durationMs: Date.now() - startedAt,
      idempotencyKey: contentIdempotencyKey("delete-failed", article.id, article.version),
    });
    throw error;
  }
  const adapterSite: AdapterSite = {
    id: article.site_id,
    name: profile?.website_name ?? article.site_id,
    domain: profile?.domain_url || site.seo_defaults?.canonicalBase || null,
    publishMode: site.publish_mode,
    timezone: site.timezone,
  };
  const cover = await loadPublishedCover(supabase, article.id);

  let result;
  try {
    result = await adapter.deleteArticle({
      site: adapterSite,
      credentials: { secret },
      externalId: article.external_id,
      slug: article.slug,
      cover,
    });
  } catch (error) {
    const httpStatus = error instanceof AdapterError ? error.httpStatus : null;
    const retryable = !httpStatus || httpStatus >= 500 || httpStatus === 429;
    // 刪除失敗要留回執，否則 UI 只看得到文章仍是 published，不知道為什麼。
    await insertPublishLog({
      supabase,
      siteId: article.site_id,
      articleId: article.id,
      action: "delete",
      request: {
        article_id: article.id,
        adapter: adapter.name,
        external_id: article.external_id,
        cover,
      },
      response: {
        ok: false,
        error: errorMessage(error),
      },
      externalId: article.external_id,
      durationMs: Date.now() - startedAt,
      idempotencyKey: contentIdempotencyKey("delete-failed", article.id, article.version),
    });
    throw new JobFailure("delete_failed", errorMessage(error), retryable);
  }
  if (!result.ok) {
    throw new JobFailure("delete_failed", `adapter「${adapter.name}」回報刪除未成功`, true);
  }

  const now = nowIso();
  const current = await loadArticle(supabase, article.id);
  if (!current || current.deleted_at) {
    return done({ skipped: "already_deleted", article_id: article.id });
  }
  const deletedReason =
    text(payload.reason) ||
    (result.alreadyGone ? "站點文章已不存在（冪等視為刪除成功）" : "已從站點刪除");

  await setArticleStatus(supabase, current, "cancelled", {
    live_url: null,
    deleted_at: now,
    deleted_reason: truncate(deletedReason, 500),
    reason: null,
  });

  await insertPublishLog({
    supabase,
    siteId: article.site_id,
    articleId: article.id,
    action: "delete",
    request: {
      article_id: article.id,
      adapter: adapter.name,
      external_id: article.external_id,
      status_before: article.status,
      version: article.version,
    },
    response: {
      ok: true,
      already_gone: result.alreadyGone,
      http_status: result.httpStatus,
      raw: result.raw ?? null,
    },
    externalId: article.external_id,
    url: null,
    httpStatus: result.httpStatus,
    durationMs: Date.now() - startedAt,
    idempotencyKey: contentIdempotencyKey("delete", article.id, article.version),
  });

  return done({
    article_id: article.id,
    adapter: adapter.name,
    external_id: article.external_id,
    already_gone: result.alreadyGone,
  });
}

async function runPublishArticleJob(ctx: JobContext): Promise<HandlerResult> {
  const { supabase, job } = ctx;
  const payload = (job.payload ?? {}) as ContentJobPayloads["publish_article"];
  const articleId = text((payload as Record<string, unknown>).article_id);
  if (!articleId) throw new JobFailure("invalid_payload", "publish_article 缺少 article_id", false);

  const article = await loadArticle(supabase, articleId);
  if (!article) throw new JobFailure("article_not_found", `找不到文章 ${articleId}`, false);
  if (["manual_done", "published", "cancelled", "draft_published"].includes(article.status)) {
    return done({ skipped: `article_${article.status}` });
  }

  const site = await loadSite(supabase, article.site_id);
  if (!site) throw new JobFailure("site_not_found", `站點 ${article.site_id} 不存在`, false);

  // 自動發佈（draft／direct）：只補發佈能力，審核與排期閘門不變
  const adapter = getContentAdapter(site.adapter);
  const autoPublish =
    site.publish_mode !== "manual" &&
    adapter.name !== "manual" &&
    adapter.supports(site.publish_mode);
  if (autoPublish) {
    return runAutoPublishJob(ctx, article, site, adapter);
  }

  // 其餘維持 v1 manual：內容包 + 通知 + 人工回填（PRD §9.3.4）
  if (site.publish_mode !== "manual") {
    await markArticlePublishFailed(
      supabase,
      article,
      `站點 adapter「${site.adapter}」不支援 ${site.publish_mode} 自動發佈，請改用手動內容包`,
    );
    throw new JobFailure(
      "publish_mode_unsupported",
      `adapter=${site.adapter} publish_mode=${site.publish_mode} 尚未支援自動發佈`,
      false,
    );
  }

  try {
    // scheduled → publishing（再重試時維持 publishing，可續包）
    if (article.status === "scheduled") {
      await setArticleStatus(supabase, article, "publishing");
    } else if (article.status !== "publishing") {
      throw new JobFailure(
        "invalid_article_status",
        `文章狀態為 ${article.status}，不允許產內容包`,
        false,
      );
    }

    const context = await buildArticlePackage(supabase, { ...article, status: "publishing" });
    const zipBytes = await zipPackage(context.plan);
    const storagePath = `packages/${article.site_id}/${article.id}/${context.plan.filename}`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, zipBytes, { contentType: "application/zip", upsert: true });
    if (uploadError) {
      throw new JobFailure("package_upload_failed", dbError(uploadError), true);
    }

    const { error: updateError } = await supabase
      .from("content_articles")
      .update({ package_path: storagePath })
      .eq("id", article.id);
    if (updateError) throw new JobFailure("article_update_failed", dbError(updateError), true);

    await insertPublishLog({
      supabase,
      siteId: article.site_id,
      articleId: article.id,
      action: "package",
      request: { article_id: article.id, version: article.version },
      response: {
        package_path: storagePath,
        filename: context.plan.filename,
        bytes: zipBytes.byteLength,
        mode: site.publish_mode,
        files: context.plan.files.map((file) => file.path),
      },
      idempotencyKey: contentIdempotencyKey("package", article.id, article.version),
      durationMs: null,
    });

    await notifyPackageReady({
      supabase,
      article: { ...article, package_path: storagePath },
      packagePath: storagePath,
      filename: context.plan.filename,
    });

    return done({
      article_id: article.id,
      package_path: storagePath,
      filename: context.plan.filename,
      bytes: zipBytes.byteLength,
    });
  } catch (error) {
    // 重試耗盡時把文章標成 publish_failed，讓回執畫面能重試（PRD §12）
    const failure = error instanceof JobFailure ? error : null;
    const attempts = Number(job.attempts || 1);
    const maxAttempts = Math.max(1, Number(job.max_attempts || 3));
    if (failure && failure.retryable && attempts >= maxAttempts) {
      const current = await loadArticle(supabase, article.id);
      if (current && current.status === "publishing") {
        try {
          await markArticlePublishFailed(supabase, current, `產包失敗：${failure.message}`);
        } catch (statusError) {
          console.warn("content-worker: mark publish_failed failed", errorMessage(statusError));
        }
      }
    }
    throw error;
  }
}

// ============================================================
// verify_publish（PRD §9.3.4、M3-10）
// ============================================================

interface FetchResult {
  status: number | null;
  headers: Headers | null;
  body: string;
  error: string | null;
}

async function fetchWithTimeout(url: string, method: "GET" | "HEAD", timeoutMs = 15_000): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "MPS-Content-Verifier/1.0" },
    });
    const raw = method === "GET" ? await response.text() : "";
    return {
      status: response.status,
      headers: response.headers,
      body: raw.slice(0, 500_000),
      error: null,
    };
  } catch (error) {
    return { status: null, headers: null, body: "", error: errorMessage(error) };
  } finally {
    clearTimeout(timer);
  }
}

function metaContent(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`, "i"),
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function linkHref(html: string, rel: string): string {
  const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<link[^>]+rel=["']${escaped}["'][^>]+href=["']([^"']+)["']`,
    "i",
  );
  const reversed = new RegExp(
    `<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${escaped}["']`,
    "i",
  );
  const match = pattern.exec(html) ?? reversed.exec(html);
  return match?.[1]?.trim() ?? "";
}

function pageTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function jsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    if (match[1]) blocks.push(match[1].trim());
  }
  return blocks;
}

function checkItem(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
): ContentQaCheck {
  return { id, label, severity: "hard", passed, detail };
}

/**
 * adapter 專屬上線驗證的收尾：寫 checks／狀態／回執，失敗才丟 JobFailure。
 * 與 HTML 驗證共用 resolveVerifyStatus，狀態機不變。
 */
async function finishAdapterVerify(
  ctx: JobContext,
  article: ContentArticle,
  liveUrl: string,
  result: AdapterVerifyResult,
  startedAt: number,
): Promise<HandlerResult> {
  const { supabase, job } = ctx;
  const checks: ContentQaCheck[] = result.checks.map((check) => ({
    id: `adapter_${check.id}`,
    label: check.label,
    severity: "hard",
    passed: check.ok,
    detail: check.detail,
  }));
  const report: ContentVerifyReport = {
    ok: result.ok && checks.every((check) => check.passed),
    httpStatus: result.httpStatus,
    checkedAt: nowIso(),
    items: checks,
  };

  const checksPatch = {
    ...(article.checks || {}),
    verify: report,
    verifiedAt: report.checkedAt,
  };
  const nextStatus = resolveVerifyStatus(article, report);
  const { error } = await supabase
    .from("content_articles")
    .update({ checks: checksPatch, ...(nextStatus ? { status: nextStatus } : {}) })
    .eq("id", article.id);
  if (error) throw new JobFailure("article_update_failed", dbError(error), true);

  await insertPublishLog({
    supabase,
    siteId: article.site_id,
    articleId: article.id,
    action: "verify",
    request: { article_id: article.id, url: liveUrl, mode: "adapter" },
    response: {
      ok: report.ok,
      failed: checks.filter((item) => !item.passed).map((item) => item.id),
      items: checks,
      raw: result.raw ?? null,
    },
    url: liveUrl,
    httpStatus: report.httpStatus,
    durationMs: Date.now() - startedAt,
  });

  if (!report.ok) {
    throw new JobFailure(
      "verify_failed",
      `上線驗證未通過：${checks
        .filter((item) => !item.passed)
        .map((item) => item.id)
        .join(", ")}`,
      Number(job.attempts || 1) < VERIFY_RETRY_LIMIT,
    );
  }
  return done({ article_id: article.id, url: liveUrl, ok: true, mode: "adapter" });
}

async function runAdapterVerifyJob(
  ctx: JobContext,
  article: ContentArticle,
  site: ContentSite,
  adapter: ContentAdapter,
  liveUrl: string,
): Promise<HandlerResult> {
  const { supabase } = ctx;
  const startedAt = Date.now();
  const externalId = article.external_id;
  if (!externalId) {
    return finishAdapterVerify(
      ctx,
      article,
      liveUrl,
      {
        ok: false,
        httpStatus: null,
        checks: [
          {
            id: "external_id",
            label: "站點文章 id",
            ok: false,
            detail: "文章沒有 external_id，無法用站點 API 驗證",
          },
        ],
      },
      startedAt,
    );
  }

  let secret: string;
  try {
    secret = await loadAdapterSecret(supabase, article.site_id, adapter.name);
  } catch (error) {
    return finishAdapterVerify(
      ctx,
      article,
      liveUrl,
      {
        ok: false,
        httpStatus: null,
        checks: [
          {
            id: "credential",
            label: "站點憑證",
            ok: false,
            detail: errorMessage(error),
          },
        ],
      },
      startedAt,
    );
  }

  const profile = await loadProfile(supabase, article.site_id);
  const sectionResult = article.section_id
    ? await supabase
        .from("content_site_sections")
        .select("*")
        .eq("id", article.section_id)
        .maybeSingle()
    : null;
  const section = (sectionResult?.data ?? null) as ContentSiteSection | null;
  const adapterSite: AdapterSite = {
    id: article.site_id,
    name: profile?.website_name ?? article.site_id,
    domain: profile?.domain_url || site.seo_defaults?.canonicalBase || null,
    publishMode: site.publish_mode,
    timezone: site.timezone,
    sectionExternalId: section?.external_id ?? null,
  };

  let result: AdapterVerifyResult;
  try {
    result = await adapter.verifyArticle!({
      site: adapterSite,
      credentials: { secret },
      article: {
        externalId,
        liveUrl,
        slug: article.slug,
        title: article.title,
        metaTitle: article.meta_title,
        metaDescription: article.meta_description,
        sectionExternalId: section?.external_id ?? null,
      },
    });
  } catch (error) {
    result = {
      ok: false,
      httpStatus: null,
      checks: [
        {
          id: "request",
          label: "站點 API 驗證",
          ok: false,
          detail: errorMessage(error),
        },
      ],
    };
  }

  return finishAdapterVerify(ctx, article, liveUrl, result, startedAt);
}

async function runVerifyPublishJob(ctx: JobContext): Promise<HandlerResult> {
  const { supabase, job } = ctx;
  const payload = (job.payload ?? {}) as ContentJobPayloads["verify_publish"];
  const articleId = text((payload as Record<string, unknown>).article_id);
  if (!articleId) throw new JobFailure("invalid_payload", "verify_publish 缺少 article_id", false);

  const article = await loadArticle(supabase, articleId);
  if (!article) throw new JobFailure("article_not_found", `找不到文章 ${articleId}`, false);
  const liveUrl = article.live_url || article.manual_url;
  if (!liveUrl) throw new JobFailure("missing_live_url", "文章沒有 live_url／manual_url，無法驗證", false);

  // 站點有 adapter 專屬驗證（Beauty100）就不要再抓 HTML meta：
  // 站方文章頁是 client render，metadata 目前是分類預設值，HTML 檢查會誤判。
  const site = await loadSite(supabase, article.site_id);
  if (site) {
    const adapter = getContentAdapter(site.adapter);
    if (adapter.verifyArticle && article.external_id) {
      return runAdapterVerifyJob(ctx, article, site, adapter, liveUrl);
    }
  }

  const startedAt = Date.now();
  const page = await fetchWithTimeout(liveUrl, "GET");
  const html = page.body;
  const checks: ContentQaCheck[] = [];

  // 1) HTTP 200
  checks.push(
    checkItem(
      "http_status",
      "HTTP 200",
      page.status === 200,
      page.status == null ? `無法連線：${page.error ?? "未知錯誤"}` : `回應 ${page.status}`,
    ),
  );

  // 2) title
  const expectedTitle = (article.meta_title || article.title || "").trim();
  const actualTitle = pageTitle(html);
  const titleHit =
    actualTitle.length > 0 &&
    (actualTitle === expectedTitle ||
      (expectedTitle.length > 0 && actualTitle.includes(expectedTitle.slice(0, 20))));
  checks.push(
    checkItem(
      "title",
      "頁面 title／H1 與文章一致",
      titleHit,
      actualTitle ? `實際：${truncateText(actualTitle, 80)}` : "頁面沒有 <title>",
    ),
  );

  // 3) meta description
  const description = metaContent(html, "description");
  checks.push(
    checkItem(
      "meta_description",
      "meta description 已設定",
      description.length >= 20,
      description ? `長度 ${description.length}` : "缺少 meta description",
    ),
  );

  // 4) canonical
  const canonical = linkHref(html, "canonical");
  const expectedCanonical = (article.canonical || "").trim();
  const canonicalHit =
    canonical.length > 0 &&
    (expectedCanonical.length === 0 ||
      canonical.replace(/\/+$/, "") === expectedCanonical.replace(/\/+$/, ""));
  checks.push(
    checkItem(
      "canonical",
      "canonical 正確",
      canonicalHit,
      canonical ? `實際：${truncateText(canonical, 100)}` : "缺少 canonical",
    ),
  );

  // 5) JSON-LD 可解析
  const blocks = jsonLdBlocks(html);
  let jsonLdOk = blocks.length > 0;
  let jsonLdDetail = blocks.length ? `找到 ${blocks.length} 段 JSON-LD` : "找不到 JSON-LD";
  for (const block of blocks) {
    try {
      JSON.parse(block);
    } catch {
      jsonLdOk = false;
      jsonLdDetail = "JSON-LD 無法解析";
      break;
    }
  }
  checks.push(checkItem("json_ld", "JSON-LD 可解析", jsonLdOk, jsonLdDetail));

  // 6) 不得 noindex
  const robotsMeta = metaContent(html, "robots");
  const robotsHeader = page.headers?.get("x-robots-tag") ?? "";
  const noindex = /noindex/i.test(robotsMeta) || /noindex/i.test(robotsHeader);
  checks.push(
    checkItem("robots", "頁面允許索引（無 noindex）", !noindex, noindex ? "偵測到 noindex" : "未被 noindex"),
  );

  // 7) 封面圖可讀（優先 og:image；沒有就視為缺圖）
  const coverUrl = metaContent(html, "og:image");
  if (!coverUrl) {
    checks.push(checkItem("cover_image", "封面圖可讀", false, "頁面缺少 og:image"));
  } else {
    let imageProbe = await fetchWithTimeout(coverUrl, "HEAD", 10_000);
    if (imageProbe.status == null || imageProbe.status === 405 || imageProbe.status === 501) {
      imageProbe = await fetchWithTimeout(coverUrl, "GET", 10_000);
    }
    const imageStatus = imageProbe.status;
    checks.push(
      checkItem(
        "cover_image",
        "封面圖可讀",
        imageStatus != null && imageStatus < 400,
        imageStatus == null ? "封面圖無法連線" : `圖片回應 ${imageStatus}`,
      ),
    );
  }

  const report: ContentVerifyReport = {
    ok: checks.every((item) => item.passed),
    httpStatus: page.status,
    checkedAt: nowIso(),
    items: checks,
  };

  // 寫回 checks.verify（失敗時保留原 checks，不覆蓋 QA 報告）
  const checksPatch = {
    ...(article.checks || {}),
    verify: report,
    verifiedAt: report.checkedAt,
  };
  const nextStatus = resolveVerifyStatus(article, report);
  const { error: updateError } = await supabase
    .from("content_articles")
    .update({ checks: checksPatch, ...(nextStatus ? { status: nextStatus } : {}) })
    .eq("id", article.id);
  if (updateError) throw new JobFailure("article_update_failed", dbError(updateError), true);

  await insertPublishLog({
    supabase,
    siteId: article.site_id,
    articleId: article.id,
    action: "verify",
    request: { article_id: article.id, url: liveUrl },
    response: {
      ok: report.ok,
      failed: checks.filter((item) => !item.passed).map((item) => item.id),
      items: checks,
    },
    url: liveUrl,
    httpStatus: page.status,
    durationMs: Date.now() - startedAt,
  });

  if (!report.ok) {
    throw new JobFailure(
      "verify_failed",
      `上線驗證未通過：${checks
        .filter((item) => !item.passed)
        .map((item) => item.id)
        .join(", ")}`,
      Number(job.attempts || 1) < VERIFY_RETRY_LIMIT,
    );
  }
  return done({ article_id: article.id, url: liveUrl, ok: true });
}

/**
 * 驗證後的狀態：
 * - manual_done 是終態，不得改成 verify_failed（DB CHECK 要求 external_id + live_url）
 * - 其餘可合法轉換時才寫 verify_failed / published
 */
function resolveVerifyStatus(
  article: ContentArticle,
  report: ContentVerifyReport,
): ContentArticleStatus | null {
  if (report.ok) {
    if (article.status === "verify_failed" && canTransition("article", "verify_failed", "published")) {
      return "published";
    }
    return null;
  }
  if (!article.external_id || !article.live_url) return null;
  if (!canTransition("article", article.status, "verify_failed")) return null;
  return "verify_failed";
}

// ============================================================
// refresh_site_pages（PRD §9.1.2：sitemap → 內鏈候選）
// ============================================================

function parseSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  for (const match of xml.matchAll(pattern)) {
    const value = (match[1] || "").trim();
    if (/^https?:\/\//i.test(value)) locs.push(value);
    if (locs.length >= SITEMAP_MAX_PAGES) break;
  }
  return locs;
}

async function fetchSitemapLocs(baseUrl: string): Promise<{ locs: string[]; error: string | null }> {
  const sitemapUrl = `${baseUrl.replace(/\/+$/, "")}/sitemap.xml`;
  const result = await fetchWithTimeout(sitemapUrl, "GET", 15_000);
  if (result.status == null || result.status >= 400) {
    return { locs: [], error: result.error ?? `sitemap 回應 ${result.status}` };
  }
  const isIndex = /<sitemapindex[\s>]/i.test(result.body);
  if (!isIndex) return { locs: parseSitemapLocs(result.body), error: null };

  // sitemap index：抓前 5 個子 sitemap，容錯（失敗的子圖直接略過）
  const children = parseSitemapLocs(result.body).slice(0, 5);
  const childResults = await Promise.all(
    children.map((child) => fetchWithTimeout(child, "GET", 10_000)),
  );
  const locs: string[] = [];
  for (const child of childResults) {
    if (child.status == null || child.status >= 400) continue;
    locs.push(...parseSitemapLocs(child.body));
    if (locs.length >= SITEMAP_MAX_PAGES) break;
  }
  return { locs: locs.slice(0, SITEMAP_MAX_PAGES), error: null };
}

async function runRefreshSitePagesJob(ctx: JobContext): Promise<HandlerResult> {
  const { supabase, job } = ctx;
  const payload = (job.payload ?? {}) as ContentJobPayloads["refresh_site_pages"];
  const siteId = text((payload as Record<string, unknown>).site_id);
  if (!siteId) throw new JobFailure("invalid_payload", "refresh_site_pages 缺少 site_id", false);

  const profile = await loadProfile(supabase, siteId);
  const baseUrl = toBaseUrl(profile?.domain_url ?? null);
  if (!baseUrl) {
    // 缺網域只記警告，不讓 job 反覆重試（M1-05：sitemap 失敗只記 warning）
    return done({ skipped: "missing_domain" });
  }
  const domain = domainFromUrl(profile?.domain_url ?? null);

  const { locs, error } = await fetchSitemapLocs(baseUrl);
  if (error || !locs.length) {
    return done({ skipped: "sitemap_unavailable", domain, reason: error ?? "sitemap 沒有 <loc>" });
  }

  const seenAt = nowIso();
  const rows = locs.slice(0, SITEMAP_MAX_PAGES).map((url) => ({
    site_id: siteId,
    url,
    source: "sitemap",
    last_seen_at: seenAt,
  }));
  // on conflict (site_id,url) → 更新 last_seen_at（內鏈候選以最近掃到為準）
  const { error: upsertError } = await supabase
    .from("content_site_pages")
    .upsert(rows, { onConflict: "site_id,url" });
  if (upsertError) throw new JobFailure("site_pages_upsert_failed", dbError(upsertError), true);

  return done({ site_id: siteId, domain, pages: rows.length, seen_at: seenAt });
}

// ============================================================
// site_health（PRD §9.1.2／M3-13 日報用）
// ============================================================

async function runSiteHealthJob(ctx: JobContext): Promise<HandlerResult> {
  const { supabase, job } = ctx;
  const payload = (job.payload ?? {}) as ContentJobPayloads["site_health"];
  const siteId = text((payload as Record<string, unknown>).site_id);
  if (!siteId) throw new JobFailure("invalid_payload", "site_health 缺少 site_id", false);

  const site = await loadSite(supabase, siteId);
  if (!site) throw new JobFailure("site_not_found", `站點 ${siteId} 不存在`, false);
  const profile = await loadProfile(supabase, siteId);
  const domain = domainFromUrl(profile?.domain_url ?? null);
  const baseUrl = toBaseUrl(profile?.domain_url ?? null);
  const seoDefaults = normalizeSeoDefaults(site);

  // 設定完整度：cadence 合法、有網域、canonical 有依據
  const cadenceErrors = validateCadence(site.cadence);
  const settingsIssues = [...cadenceErrors];
  if (!domain) settingsIssues.push("站點主檔缺少 domain_url");
  if (!seoDefaults.canonicalBase && !domain) settingsIssues.push("缺少 canonicalBase");
  const settingsOk = settingsIssues.length === 0;

  const checkedAt = nowIso();
  const checkRows: Record<string, unknown>[] = [
    {
      site_id: siteId,
      checked_at: checkedAt,
      kind: "settings",
      ok: settingsOk,
      detail: { issues: settingsIssues, cadence: site.cadence, domain },
    },
  ];

  // 網域 HEAD（405/501 時退回 GET；3xx 視為可達）
  let domainOk = false;
  let domainDetail = "站點主檔缺少 domain_url";
  if (baseUrl) {
    const head = await fetchWithTimeout(baseUrl, "HEAD", 12_000);
    let status = head.status;
    if (status == null || status === 405 || status === 501) {
      const get = await fetchWithTimeout(baseUrl, "GET", 12_000);
      status = get.status ?? status;
    }
    domainOk = status != null && status < 400;
    domainDetail = status == null ? head.error ?? "無法連線" : `HTTP ${status}`;
  }
  checkRows.push({
    site_id: siteId,
    checked_at: checkedAt,
    kind: "domain",
    ok: domainOk,
    detail: { domain, detail: domainDetail },
  });

  const { error: checkError } = await supabase.from("content_site_checks").insert(checkRows);
  if (checkError) throw new JobFailure("site_check_insert_failed", dbError(checkError), true);

  const health = !domainOk ? "down" : settingsOk ? "ok" : "degraded";
  const { error: siteError } = await supabase
    .from("content_sites")
    .update({ health, last_verified_at: checkedAt })
    .eq("website_profile_id", siteId);
  if (siteError) throw new JobFailure("site_update_failed", dbError(siteError), true);

  return done({ site_id: siteId, health, settings_ok: settingsOk, domain_ok: domainOk, domain });
}

// ============================================================
// send_digest（PRD §9.2.4、M2-11 / M2-12）
// ============================================================

/** 從 DB 組出 buildDigestStats 的輸入（與 content-digest 的小複本同步） */
async function loadDigestStats(
  supabase: Db,
  date: string,
): Promise<{ stats: ContentDigestStats; email: ContentDigestEmail; siteCount: number }> {
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
  if (sitesRes.error) throw new JobFailure("digest_sites_failed", dbError(sitesRes.error), true);
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
    if (slotRes.error) throw new JobFailure("digest_slots_failed", dbError(slotRes.error), true);
    if (recentRes.error) throw new JobFailure("digest_articles_failed", dbError(recentRes.error), true);
    if (pendingRes.error) throw new JobFailure("digest_articles_failed", dbError(pendingRes.error), true);
    if (usageRes.error) throw new JobFailure("digest_usage_failed", dbError(usageRes.error), true);

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

    for (const row of (usageRes.data ?? []) as { tokens_in: number; tokens_out: number; cost_usd: number }[]) {
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
        detail: truncate(row.last_error || "沒有錯誤訊息", 160),
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
  return { stats, email, siteCount: sites.length };
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
  if (error) throw new JobFailure("digest_load_failed", dbError(error), true);
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
    status: ContentDigestStatus;
    sentAt: string | null;
    error: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("content_email_digests").upsert(
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
  );
  if (error) throw new JobFailure("digest_save_failed", dbError(error), true);
}

interface DigestDeliveryResult {
  status: ContentDigestStatus;
  error: string | null;
  retryable: boolean;
  skipped?: boolean;
  subject: string;
  recipients: string[];
}

/**
 * 日報寄送核心（M2-12）：組統計 → 組信 → Resend → content_email_digests。
 * 與 content-digest 的重複是刻意的：兩支函式要能獨立部署與呼叫。
 */
async function deliverDigest(supabase: Db, date: string): Promise<DigestDeliveryResult> {
  const settings = await loadSettings(supabase);
  const recipients = normalizeRecipients(settings.digest_recipients);
  const { stats, email } = await loadDigestStats(supabase, date);

  const existing = await loadDigestRecord(supabase, date);
  if (existing?.status === "sent") {
    return {
      status: "sent",
      error: null,
      retryable: false,
      skipped: true,
      subject: existing.subject || email.subject,
      recipients,
    };
  }

  const base = {
    recipients,
    subject: email.subject || buildDigestSubject(stats),
    html: email.html,
    summary: stats,
  };

  if (!recipients.length) {
    await upsertDigestRecord(supabase, date, {
      ...base,
      status: "draft",
      sentAt: null,
      error: "沒有收件人（content_settings.digest_recipients 為空）",
    });
    return { status: "draft", error: "no_recipients", retryable: false, subject: base.subject, recipients };
  }

  if (!isResendApiKeyConfigured(getResendApiKey())) {
    // 未設定 Resend → 不算 job 失敗；HTML 仍保存，UI 可看可重寄（PRD §9.2.4）
    await upsertDigestRecord(supabase, date, {
      ...base,
      status: "draft",
      sentAt: null,
      error: "未設定 Resend（RESEND_API_KEY），日報 HTML 已保存但未寄出",
    });
    return {
      status: "draft",
      error: "resend_not_configured",
      retryable: false,
      subject: base.subject,
      recipients,
    };
  }

  try {
    await sendResendEmail({
      to: recipients,
      subject: base.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: digestIdempotencyKey(date),
    });
  } catch (error) {
    const message = truncate(errorMessage(error));
    await upsertDigestRecord(supabase, date, {
      ...base,
      status: "failed",
      sentAt: null,
      error: message,
    });
    return {
      status: "failed",
      error: message,
      retryable: true,
      subject: base.subject,
      recipients,
    };
  }

  const sentAt = nowIso();
  await upsertDigestRecord(supabase, date, {
    ...base,
    status: "sent",
    sentAt,
    error: null,
  });
  return { status: "sent", error: null, retryable: false, subject: base.subject, recipients };
}

async function runSendDigestJob(ctx: JobContext): Promise<HandlerResult> {
  const payload = (ctx.job.payload ?? {}) as Record<string, unknown>;
  const payloadDate = payload.date;
  const date = isIsoDateString(payloadDate) ? payloadDate : todayInZone(HKT);
  const result = await deliverDigest(ctx.supabase, date);
  if (result.retryable) {
    throw new JobFailure("digest_send_failed", result.error ?? "日報寄送失敗", true);
  }
  return done({
    date,
    status: result.status,
    skipped: Boolean(result.skipped),
    error: result.error,
    subject: result.subject,
    recipients: result.recipients.length,
  });
}

// ============================================================
// ?enqueue=<type> 模式（內容與 cron 的觸發入口）
// ============================================================

async function handleEnqueue(
  supabase: Db,
  kind: string,
): Promise<Response> {
  const date = todayInZone(HKT);

  if (kind === "plan_slots") {
    // PRD §9.2.2：active 站各排一個 plan job（每日 00:10 HKT，由 pg_cron 觸發）
    const sites = await loadActiveSites(supabase);
    let enqueued = 0;
    for (const site of sites) {
      enqueued += await enqueueJob(supabase, "plan_slots", {
        site_id: site.website_profile_id,
        horizon_days: 30,
        dedupe_key: `plan:${site.website_profile_id}:${date}`,
      });
    }
    return okJson({ enqueued, type: kind, date, sites: sites.length });
  }

  if (kind === "send_digest") {
    // PRD §7.3：每小時 cron 只在「小時 == digest_time 的小時」命中一次
    const settings = await loadSettings(supabase);
    if (!settings.digest_enabled) return okJson({ enqueued: 0, type: kind, reason: "disabled" });

    const now = new Date();
    const hour = getZonedParts(now, HKT).hour;
    const targetHour = Number((settings.digest_time || "09:00").split(":")[0]);
    if (!Number.isFinite(targetHour) || hour !== targetHour) {
      return okJson({
        enqueued: 0,
        type: kind,
        reason: "not_due",
        hour,
        digest_time: settings.digest_time,
      });
    }

    const existing = await loadDigestRecord(supabase, date);
    if (existing?.status === "sent") {
      return okJson({ enqueued: 0, type: kind, reason: "already_sent", date });
    }
    const enqueued = await enqueueJob(supabase, "send_digest", {
      date,
      dedupe_key: `digest:${date}`,
    });
    return okJson({ enqueued, type: kind, date, digest_time: settings.digest_time });
  }

  if (kind === "site_health") {
    // PRD §7.3：每日 02:00 HKT 排入每站健康檢查 + sitemap 刷新
    const sites = await loadActiveSites(supabase);
    let enqueued = 0;
    for (const site of sites) {
      const siteId = site.website_profile_id;
      enqueued += await enqueueJob(supabase, "site_health", {
        site_id: siteId,
        dedupe_key: `health:${siteId}:${date}`,
      });
      enqueued += await enqueueJob(supabase, "refresh_site_pages", {
        site_id: siteId,
        dedupe_key: `pages:${siteId}:${date}`,
      });
    }
    return okJson({ enqueued, type: kind, date, sites: sites.length });
  }

  return failJson(400, "unknown_enqueue", `不支援的 enqueue 類型：${kind}`);
}

// ============================================================
// HTTP 入口
// ============================================================

Deno.serve(async (req: Request) => {
  const guard = guardMethod(req);
  if (guard) return guard;

  const forbidden = requireServiceRole(req);
  if (forbidden) return forbidden;

  let supabase: Db;
  try {
    supabase = serviceClient();
  } catch (error) {
    return failJson(500, "config_missing", errorMessage(error));
  }

  try {
    const enqueueKind = new URL(req.url).searchParams.get("enqueue");
    if (enqueueKind !== null) return await handleEnqueue(supabase, enqueueKind);

    const body = await readBody<Record<string, unknown>>(req);
    return await runWorker(supabase, body);
  } catch (error) {
    if (error instanceof JobFailure) {
      return failJson(error.retryable ? 502 : 400, error.code, error.message);
    }
    return failJson(500, "worker_failed", errorMessage(error));
  }
});
