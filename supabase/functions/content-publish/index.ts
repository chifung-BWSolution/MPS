import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import {
  actorUserId,
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
  contentIdempotencyKey,
  DEFAULT_BRAND_VOICE,
  DEFAULT_SEO_DEFAULTS,
  truncateText,
} from "../../../src/lib/contentFormat.ts";
import {
  blockingReasons,
  buildQaInput,
  evaluateSeoQa,
} from "../../../src/lib/contentSeoQa.ts";
import { buildArticleJsonLd, renderMarkdownToHtml } from "../../../src/lib/contentGenerate.ts";
import { getContentAdapter } from "../_shared/contentAdapters/index.ts";
import { packageImagePath } from "../../../src/lib/contentMedia.ts";
import {
  buildPackageMeta,
  buildPackagePlan,
  type PackagePlanInput,
} from "../../../src/lib/contentPackage.ts";
import {
  assertTransition,
  canTransition,
  ContentTransitionError,
  isApprovedForPublish,
} from "../../../src/lib/contentState.ts";
import type {
  ContentAction,
  ContentArticle,
  ContentArticleStatus,
  ContentAsset,
  ContentKeyword,
  ContentPackagePlan,
  ContentPublishLog,
  ContentSite,
  ContentSiteProfile,
  ContentSiteSection,
  ContentSlot,
} from "../../../src/lib/contentTypes.ts";

/**
 * content-publish · 審核與上線 API（PRD §9.3、M1-21／M1-22、M3-08～M3-13）
 *
 * actions（全部 POST JSON body；回應 { ok, data } / { ok:false, code, error }）：
 *   save_draft         write    樂觀鎖存稿 + content_article_revisions
 *   submit_for_review  write    draft／changes_requested → pending_review
 *   approve            approve  pending_review／changes_requested → approved（寫 reviewer_id／approved_at）
 *   reject             approve  → changes_requested（或 cancelled），reason 寫 publish_logs
 *   confirm            approve  approved → scheduled + enqueue publish_article（PRD §9.3.3）
 *   build_package      approve  產 zip 上 Storage，回 package_path／signed_url／filename
 *   manual_done        write    人工貼上後回填 live URL → manual_done（PRD §9.3.4）
 *   retry              approve  publish_failed／verify_failed → scheduled + 重新排入 publish_article
 *
 * 所有狀態轉換都先過 src/lib/contentState.assertTransition，非法一律 409。
 */

type Db = ReturnType<typeof serviceClient>;

const STORAGE_BUCKET = "content-assets";
const SIGNED_URL_TTL_SECONDS = 3_600;

const ACTION_PERMISSIONS: Record<string, ContentAction> = {
  save_draft: "write",
  submit_for_review: "write",
  approve: "approve",
  reject: "approve",
  confirm: "approve",
  build_package: "approve",
  manual_done: "write",
  retry: "approve",
  delete_published: "approve",
};

const DRAFT_PATCH_KEYS = [
  "title",
  "slug",
  "body_md",
  "excerpt",
  "meta_title",
  "meta_description",
  "canonical",
] as const;

const PACKAGE_BLOCKED_ARTICLE_STATUSES: ContentArticleStatus[] = [
  "cancelled",
  "manual_done",
  "draft_published",
];

/** API 層可辨識錯誤（status／code 直接對應回應） */
class ActionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ActionError";
    this.status = status;
    this.code = code;
  }
}

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

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function requireArticleId(body: Record<string, unknown>): string {
  const articleId = text(body.article_id);
  if (!articleId) throw new ActionError(400, "invalid_payload", "缺少 article_id");
  return articleId;
}

function optionalExpectedVersion(body: Record<string, unknown>): number | null {
  if (body.expected_version == null) return null;
  const version = Number(body.expected_version);
  if (!Number.isFinite(version) || version < 1) {
    throw new ActionError(400, "invalid_payload", "expected_version 必須是正整數");
  }
  return Math.round(version);
}

function assertVersion(article: ContentArticle, expected: number | null): void {
  if (expected == null) return;
  if (article.version !== expected) {
    throw new ActionError(
      409,
      "version_conflict",
      `版本衝突：資料庫為 v${article.version}，你編輯的是 v${expected}，請重新載入後再試`,
    );
  }
}

function transitionError(error: unknown): ActionError {
  if (error instanceof ContentTransitionError) {
    return new ActionError(409, "invalid_transition", error.message);
  }
  return new ActionError(409, "invalid_transition", errorMessage(error));
}

function normalizeSeoDefaults(site: ContentSite) {
  return { ...DEFAULT_SEO_DEFAULTS, ...(site.seo_defaults || {}) };
}

/**
 * JSON-LD 保底：src/lib/contentGenerate.buildArticleJsonLd 目前尚未解構 params
 * （呼叫時會 ReferenceError，已回報 Lead 由 lib owner 修）。先試共用函式，
 * 失敗再用等效最小實作，避免產包因為一個欄位而整批失敗。
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

// ============================================================
// DB 讀取
// ============================================================

async function loadArticle(supabase: Db, articleId: string): Promise<ContentArticle> {
  const { data, error } = await supabase
    .from("content_articles")
    .select("*")
    .eq("id", articleId)
    .maybeSingle();
  if (error) throw new ActionError(500, "article_load_failed", dbError(error));
  if (!data) throw new ActionError(404, "article_not_found", `找不到文章 ${articleId}`);
  return data as ContentArticle;
}

async function loadSite(supabase: Db, siteId: string): Promise<ContentSite | null> {
  const { data, error } = await supabase
    .from("content_sites")
    .select("*")
    .eq("website_profile_id", siteId)
    .maybeSingle();
  if (error) throw new ActionError(500, "site_load_failed", dbError(error));
  return (data as ContentSite | null) ?? null;
}

async function loadProfile(supabase: Db, siteId: string): Promise<ContentSiteProfile | null> {
  const { data, error } = await supabase
    .from("webandsystem_list")
    .select("id, website_name, domain_url, platform, brand, status, level")
    .eq("id", siteId)
    .maybeSingle();
  if (error) return null;
  return (data as ContentSiteProfile | null) ?? null;
}

async function loadSlotById(supabase: Db, slotId: string | null): Promise<ContentSlot | null> {
  if (!slotId) return null;
  const { data, error } = await supabase
    .from("content_slots")
    .select("*")
    .eq("id", slotId)
    .maybeSingle();
  if (error) return null;
  return (data as ContentSlot | null) ?? null;
}

async function loadSlotForArticle(
  supabase: Db,
  article: ContentArticle,
): Promise<ContentSlot | null> {
  if (article.slot_id) {
    const slot = await loadSlotById(supabase, article.slot_id);
    if (slot) return slot;
  }
  const { data, error } = await supabase
    .from("content_slots")
    .select("*")
    .eq("article_id", article.id)
    .maybeSingle();
  if (error) return null;
  return (data as ContentSlot | null) ?? null;
}

async function loadSection(
  supabase: Db,
  sectionId: string | null,
): Promise<ContentSiteSection | null> {
  if (!sectionId) return null;
  const { data, error } = await supabase
    .from("content_site_sections")
    .select("*")
    .eq("id", sectionId)
    .maybeSingle();
  if (error) return null;
  return (data as ContentSiteSection | null) ?? null;
}

async function loadKeyword(
  supabase: Db,
  keywordId: string | null,
): Promise<ContentKeyword | null> {
  if (!keywordId) return null;
  const { data, error } = await supabase
    .from("seo_keywords")
    .select("*")
    .eq("id", keywordId)
    .maybeSingle();
  if (error) return null;
  return (data as ContentKeyword | null) ?? null;
}

async function loadExistingSlugs(
  supabase: Db,
  siteId: string,
  excludeArticleId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("content_articles")
    .select("slug")
    .eq("site_id", siteId)
    .neq("id", excludeArticleId)
    .limit(500);
  if (error) {
    console.warn("content-publish: load slugs failed", dbError(error));
    return [];
  }
  return (data ?? [])
    .map((row) => String((row as { slug?: string | null }).slug ?? ""))
    .filter(Boolean);
}

/**
 * 伺服器端 SEO 硬閘門（PRD §9.3.3）。
 *
 * 工作室 UI 會即時計算並禁用 Confirm，但直接呼叫 API 也要擋下來：
 * approve／confirm 前重跑 evaluateSeoQa，硬檢查未過一律 409 qa_blocked。
 * 站點設定缺失時放行（狀態機與權限已驗），避免設定被歸檔後無法收尾。
 */
async function assertSeoHardChecksPass(supabase: Db, article: ContentArticle): Promise<void> {
  const site = await loadSite(supabase, article.site_id);
  if (!site) return;

  const [keyword, section, existingSlugs] = await Promise.all([
    loadKeyword(supabase, article.keyword_id),
    loadSection(supabase, article.section_id),
    loadExistingSlugs(supabase, article.site_id, article.id),
  ]);

  const seoDefaults = { ...DEFAULT_SEO_DEFAULTS, ...(site.seo_defaults ?? {}) };
  const brandVoice = { ...DEFAULT_BRAND_VOICE, ...(site.brand_voice ?? {}) };
  const report = evaluateSeoQa(
    buildQaInput({
      article,
      seoDefaults,
      brandVoice,
      section,
      keyword: keyword?.keyword ?? null,
      existingSlugs,
    }),
  );

  if (!report.hardPassed) {
    throw new ActionError(
      409,
      "qa_blocked",
      `SEO 硬檢查未過，不能批准：${blockingReasons(report).join("；")}`,
    );
  }
}

async function loadSettingsRecipients(supabase: Db): Promise<string[]> {
  const { data, error } = await supabase
    .from("content_settings")
    .select("digest_recipients")
    .eq("id", "default")
    .maybeSingle();
  if (error) return [];
  const recipients = (data as { digest_recipients?: unknown } | null)?.digest_recipients;
  if (!Array.isArray(recipients)) return [];
  return recipients.map((value) => String(value ?? "").trim()).filter(Boolean);
}

// ============================================================
// 狀態／稽核寫入
// ============================================================

async function updateArticle(
  supabase: Db,
  article: ContentArticle,
  to: ContentArticleStatus,
  patch: Record<string, unknown> = {},
): Promise<ContentArticle> {
  if (article.status !== to) {
    try {
      assertTransition("article", article.status, to);
    } catch (error) {
      throw transitionError(error);
    }
  }
  const { data, error } = await supabase
    .from("content_articles")
    .update({ status: to, version: article.version + 1, ...patch })
    .eq("id", article.id)
    .select("*")
    .single();
  if (error) throw new ActionError(500, "article_update_failed", dbError(error));
  return data as ContentArticle;
}

/** 只改欄位、不改狀態（給 approve/confirm 等會自己帶狀態的動作） */
async function patchArticle(
  supabase: Db,
  articleId: string,
  patch: Record<string, unknown>,
  expectedVersion?: number,
): Promise<ContentArticle> {
  let query = supabase.from("content_articles").update(patch).eq("id", articleId);
  if (expectedVersion != null) query = query.eq("version", expectedVersion);
  const { data, error } = await query.select("*");
  if (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "23505") {
      throw new ActionError(409, "slug_conflict", "這個 slug 已被同站其他文章使用");
    }
    throw new ActionError(500, "article_update_failed", dbError(error));
  }
  if (!data || !data.length) {
    throw new ActionError(409, "version_conflict", "文章已被其他人修改，請重新載入後再試");
  }
  return data[0] as ContentArticle;
}

async function syncSlotStatus(
  supabase: Db,
  slot: ContentSlot | null,
  to: ContentSlot["status"],
): Promise<void> {
  if (!slot || slot.status === to) return;
  // slot 狀態機是 UI 指引；文章狀態才是硬閘門，所以即使轉換表不允許也同步，
  // 但留警告方便抓資料異常（例如人工直接改過 slot 狀態）。
  if (!canTransition("slot", slot.status, to)) {
    console.warn(
      `content-publish: slot ${slot.id} ${slot.status} → ${to} 不是合法轉換，仍以文章狀態同步`,
    );
  }
  const patch: Record<string, unknown> = { status: to };
  if (to !== "held") patch.reason = null;
  const { error } = await supabase.from("content_slots").update(patch).eq("id", slot.id);
  if (error) console.warn("content-publish: sync slot failed", dbError(error));
}

async function writePublishLog(
  supabase: Db,
  params: {
    siteId: string | null;
    articleId: string | null;
    action: ContentPublishLog["action"];
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    url?: string | null;
    httpStatus?: number | null;
    idempotencyKey?: string | null;
    /** 遠端文章 id（delete 回執需要） */
    externalId?: string | null;
    actorId: string | null;
  },
): Promise<ContentPublishLog | null> {
  const { data, error } = await supabase
    .from("content_publish_logs")
    .insert({
      site_id: params.siteId,
      article_id: params.articleId,
      action: params.action,
      request: params.request ?? {},
      response: params.response ?? {},
      url: params.url ?? null,
      http_status: params.httpStatus ?? null,
      idempotency_key: params.idempotencyKey ?? null,
      external_id: params.externalId ?? null,
      actor_id: params.actorId,
    })
    .select("*")
    .single();
  if (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "23505") {
      // 冪等鍵已存在（重複 Confirm／重複產包）→ 回既有回執（PRD §12）
      if (params.idempotencyKey) {
        const { data: existing } = await supabase
          .from("content_publish_logs")
          .select("*")
          .eq("idempotency_key", params.idempotencyKey)
          .maybeSingle();
        return (existing as ContentPublishLog | null) ?? null;
      }
      return null;
    }
    console.warn("content-publish: publish log failed", dbError(error));
    return null;
  }
  return data as ContentPublishLog;
}

async function enqueueJob(
  supabase: Db,
  type: "publish_article" | "verify_publish" | "generate_article" | "plan_slots" | "site_health" | "refresh_site_pages" | "send_digest" | "delete_article",
  payload: Record<string, unknown>,
  runAt: string,
): Promise<number> {
  const { error } = await supabase.from("content_jobs").insert({
    type,
    payload,
    status: "queued",
    run_at: runAt,
    max_attempts: type === "generate_article" ? 2 : 3,
  });
  if (!error) return 1;
  const code = (error as { code?: string }).code ?? "";
  if (code === "23505") return 0; // dedupe：已排入（PRD §12 重複 Confirm 冪等）
  throw new ActionError(500, "enqueue_failed", dbError(error));
}

// ============================================================
// 內容包（與 content-worker publish_article 的小複本同步：
// 兩支函式必須能獨立部署，且不能改共用檔，因此刻意重複這段）
// ============================================================

function extensionForMime(mime: string | null | undefined): "svg" | "png" | "jpg" | "webp" {
  const value = (mime || "").toLowerCase();
  if (value.includes("svg")) return "svg";
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("webp")) return "webp";
  return "png";
}

async function downloadStorageBytes(supabase: Db, storagePath: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

async function buildPackageForArticle(
  supabase: Db,
  article: ContentArticle,
): Promise<{ plan: ContentPackagePlan; site: ContentSite }> {
  const site = await loadSite(supabase, article.site_id);
  if (!site) throw new ActionError(404, "site_not_found", `找不到站點 ${article.site_id}`);
  const profile = (await loadProfile(supabase, article.site_id)) ?? {
    id: article.site_id,
    website_name: article.site_id,
    domain_url: null,
    platform: null,
    brand: null,
    status: null,
    level: null,
  };
  const section = await loadSection(supabase, article.section_id);
  const keyword = await loadKeyword(supabase, article.keyword_id);
  const seoDefaults = normalizeSeoDefaults(site);

  const meta = buildPackageMeta({
    article,
    site: profile,
    section,
    keyword: keyword?.keyword ?? null,
    publishAt: article.scheduled_publish_at,
    mode: site.publish_mode,
  });

  let coverAssetContent: PackagePlanInput["coverAssetContent"] = null;
  const figureAssets: NonNullable<PackagePlanInput["figureAssets"]> = [];

  if (article.cover_asset_id) {
    const { data } = await supabase
      .from("content_assets")
      .select("*")
      .eq("id", article.cover_asset_id)
      .maybeSingle();
    const asset = (data ?? null) as ContentAsset | null;
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
    const { data } = await supabase
      .from("content_assets")
      .select("*")
      .eq("id", figureIds[index])
      .maybeSingle();
    const figure = (data ?? null) as ContentAsset | null;
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
  return { plan, site };
}

async function zipPackage(plan: ContentPackagePlan): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const file of plan.files) zip.file(file.path, file.content);
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/** 內容包好了可通知負責人（可選；失敗不影響主流程） */
async function notifyPackageReady(
  supabase: Db,
  article: ContentArticle,
  packagePath: string,
  filename: string,
): Promise<void> {
  if (!isResendApiKeyConfigured(getResendApiKey())) return;
  try {
    const recipients = await loadSettingsRecipients(supabase);
    if (!recipients.length) return;
    const { data: signed } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(packagePath, SIGNED_URL_TTL_SECONDS);
    const downloadUrl = signed?.signedUrl
      ? `<p><a href="${signed.signedUrl}">下載內容包（1 小時內有效）</a></p>`
      : "";
    await sendResendEmail({
      to: recipients,
      subject: `[MPS] 內容包已就緒：${truncateText(article.title, 60)}`,
      html: `<p>《${article.title}》的內容包已產生，請人工貼上後回到 MPS 回填 live URL。</p>
<p>檔名：${filename}</p>${downloadUrl}`,
      idempotencyKey: contentIdempotencyKey("package-notify", article.id, article.version),
    });
  } catch (error) {
    console.warn("content-publish: package notify failed", errorMessage(error));
  }
}

// ============================================================
// actions
// ============================================================

/** save_draft：樂觀鎖更新 + revision 快照（M3-04） */
async function saveDraft(
  supabase: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<Response> {
  const articleId = requireArticleId(body);
  const expectedVersion = optionalExpectedVersion(body);
  if (expectedVersion == null) {
    throw new ActionError(400, "version_required", "save_draft 必須帶 expected_version");
  }
  const patchInput = body.patch;
  if (!patchInput || typeof patchInput !== "object" || Array.isArray(patchInput)) {
    throw new ActionError(400, "invalid_payload", "缺少 patch 物件");
  }

  const article = await loadArticle(supabase, articleId);
  assertVersion(article, expectedVersion);

  const sourcePatch = patchInput as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  for (const key of DRAFT_PATCH_KEYS) {
    if (!(key in sourcePatch)) continue;
    const value = sourcePatch[key];
    if (key === "title" || key === "slug") {
      const normalized = text(value);
      if (!normalized) throw new ActionError(400, "invalid_patch", `${key} 不可為空`);
      update[key] = normalized;
    } else {
      update[key] =
        typeof value === "string" ? value : value == null ? null : String(value);
    }
  }
  if (!Object.keys(update).length) {
    throw new ActionError(400, "empty_patch", "patch 沒有可更新的欄位");
  }
  if (typeof update.slug === "string") update.slug = update.slug.trim();
  if (typeof update.body_md === "string") {
    update.body_html = renderMarkdownToHtml(update.body_md);
  }
  update.version = expectedVersion + 1;

  const updated = await patchArticle(supabase, articleId, update, expectedVersion);

  // 版本快照（UNIQUE(article_id, version)；重送同一版可忽略）
  const { error: revisionError } = await supabase.from("content_article_revisions").insert({
    article_id: articleId,
    version: updated.version,
    snapshot: {
      title: updated.title,
      slug: updated.slug,
      excerpt: updated.excerpt,
      body_md: updated.body_md,
      body_html: updated.body_html,
      meta_title: updated.meta_title,
      meta_description: updated.meta_description,
      canonical: updated.canonical,
    },
    actor_id: actorUserId(actor),
  });
  if (revisionError) {
    const code = (revisionError as { code?: string }).code ?? "";
    if (code !== "23505") {
      throw new ActionError(500, "revision_failed", dbError(revisionError));
    }
  }
  return okJson(updated);
}

/** submit_for_review：draft／changes_requested → pending_review（M3-02） */
async function submitForReview(
  supabase: Db,
  body: Record<string, unknown>,
): Promise<Response> {
  const articleId = requireArticleId(body);
  const expectedVersion = optionalExpectedVersion(body);
  const article = await loadArticle(supabase, articleId);
  assertVersion(article, expectedVersion);
  const updated = await updateArticle(supabase, article, "pending_review");
  return okJson(updated);
}

/** approve：待審 → 已批准（M3-08）；必寫 reviewer_id／approved_at（PRD §6.3 不變量 1） */
async function approveArticle(
  supabase: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<Response> {
  const articleId = requireArticleId(body);
  const expectedVersion = optionalExpectedVersion(body);
  const article = await loadArticle(supabase, articleId);
  assertVersion(article, expectedVersion);

  const reviewerId = actorUserId(actor);
  if (!reviewerId) {
    throw new ActionError(403, "actor_required", "核准需要具名使用者（service_role 不能代替總編輯）");
  }
  if (article.status !== "approved") {
    try {
      assertTransition("article", article.status, "approved");
    } catch (error) {
      throw transitionError(error);
    }
  }

  await assertSeoHardChecksPass(supabase, article);

  const slot = await loadSlotForArticle(supabase, article);
  const scheduledPublishAt =
    text(body.scheduled_publish_at) || article.scheduled_publish_at || slot?.publish_at || null;
  const updated = await patchArticle(supabase, articleId, {
    status: "approved",
    reviewer_id: reviewerId,
    approved_at: nowIso(),
    scheduled_publish_at: scheduledPublishAt,
    version: article.version + 1,
  }, article.version);

  await syncSlotStatus(supabase, slot, "approved");
  await writePublishLog(supabase, {
    siteId: article.site_id,
    articleId,
    action: "approve",
    request: {
      expected_version: expectedVersion,
      scheduled_publish_at: scheduledPublishAt,
    },
    response: { status: "approved", reviewer_id: reviewerId },
    actorId: reviewerId,
  });
  return okJson(updated);
}

/** reject：→ changes_requested（預設）或 cancelled；reason 寫 publish_logs（M3-08） */
async function rejectArticle(
  supabase: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<Response> {
  const articleId = requireArticleId(body);
  const expectedVersion = optionalExpectedVersion(body);
  const article = await loadArticle(supabase, articleId);
  assertVersion(article, expectedVersion);

  const reason = text(body.reason) || "未提供原因";
  const requestedTarget = text(body.target_status) || text(body.to);
  const target: ContentArticleStatus =
    requestedTarget === "cancelled" ? "cancelled" : "changes_requested";
  const updated = await updateArticle(supabase, article, target, {
    reason: truncateText(reason, 500),
  });

  await writePublishLog(supabase, {
    siteId: article.site_id,
    articleId,
    action: "reject",
    request: { reason, target },
    response: { status: updated.status },
    actorId: actorUserId(actor),
  });
  return okJson(updated);
}

/** confirm：批准 + 排定發布（PRD §9.3.3；不是立即發布） */
async function confirmArticle(
  supabase: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<Response> {
  const articleId = requireArticleId(body);
  const expectedVersion = optionalExpectedVersion(body);
  const article = await loadArticle(supabase, articleId);
  assertVersion(article, expectedVersion);

  const slot = await loadSlotForArticle(supabase, article);
  const scheduledRaw =
    text(body.scheduled_publish_at) || article.scheduled_publish_at || slot?.publish_at || "";
  if (!scheduledRaw) {
    throw new ActionError(400, "missing_schedule", "Confirm 必須有 scheduled_publish_at（或排程格時間）");
  }
  const scheduledDate = new Date(scheduledRaw);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new ActionError(400, "invalid_schedule", `scheduled_publish_at 不是合法時間：${scheduledRaw}`);
  }

  // 自動發佈站（Beauty100 等）的硬閘門：必須先經管理員／總編輯批准，
  // 且 adapter 支援這個發佈模式、封面符合要求。manual 站行為不變。
  const site = await loadSite(supabase, article.site_id);
  if (site && site.publish_mode !== "manual") {
    if (site.status !== "active") {
      throw new ActionError(409, "site_inactive", "站點不是 active，不能排程自動發佈");
    }
    if (!isApprovedForPublish(article)) {
      throw new ActionError(
        409,
        "not_approved",
        "文章尚未經管理員／總編輯批准（缺少 reviewer_id／approved_at），不能排程自動發佈",
      );
    }
    // 只有 approved／scheduled 可以進入自動發佈；held／changes_requested 即使
    // 留著舊的批准欄位，也不能繞過狀態機直接排程。
    if (article.status !== "approved" && article.status !== "scheduled") {
      throw new ActionError(
        409,
        "invalid_transition",
        `文章狀態為 ${article.status}，只有 approved／scheduled 可以排程自動發佈`,
      );
    }
    const adapter = getContentAdapter(site.adapter);
    if (!adapter.supports(site.publish_mode)) {
      throw new ActionError(
        409,
        "publish_mode_unsupported",
        `站點 adapter「${site.adapter}」不支援 ${site.publish_mode} 模式`,
      );
    }
    if (adapter.requiresCover && !article.cover_asset_id) {
      throw new ActionError(
        409,
        "cover_required",
        "這個站點發佈必須有封面圖；請先在工作室產生或上傳封面",
      );
    }
  }

  // 重複 Confirm：冪等（PRD §12），不重建內容包、不重複加版本
  if (article.status === "scheduled") {
    await enqueueJob(
      supabase,
      "publish_article",
      { article_id: articleId, dedupe_key: `publish:${articleId}:v${article.version}` },
      article.scheduled_publish_at || scheduledDate.toISOString(),
    );
    return okJson(article);
  }

  try {
    assertTransition("article", article.status, "scheduled");
  } catch (error) {
    throw transitionError(error);
  }

  await assertSeoHardChecksPass(supabase, article);

  const reviewerId = article.reviewer_id ?? actorUserId(actor);
  const approvedAt = article.approved_at ?? nowIso();
  const updated = await patchArticle(supabase, articleId, {
    status: "scheduled",
    scheduled_publish_at: scheduledDate.toISOString(),
    reviewer_id: reviewerId,
    approved_at: approvedAt,
    version: article.version + 1,
  }, article.version);

  await syncSlotStatus(supabase, slot, "scheduled");
  await writePublishLog(supabase, {
    siteId: article.site_id,
    articleId,
    action: "confirm",
    request: {
      expected_version: expectedVersion,
      scheduled_publish_at: scheduledDate.toISOString(),
    },
    response: { status: "scheduled", reviewer_id: reviewerId },
    actorId: actorUserId(actor),
  });

  // 到點才產內容包：run_at = scheduled_publish_at（v1 manual 模式）
  const dedupeKey = `publish:${articleId}:v${updated.version}`;
  await enqueueJob(
    supabase,
    "publish_article",
    { article_id: articleId, dedupe_key: dedupeKey },
    scheduledDate.toISOString(),
  );
  return okJson(updated);
}

/** build_package：手動產包（UI 按鈕），回 package_path + 1 小時 signed URL */
async function buildPackageAction(
  supabase: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<Response> {
  const articleId = requireArticleId(body);
  const article = await loadArticle(supabase, articleId);
  if (PACKAGE_BLOCKED_ARTICLE_STATUSES.includes(article.status)) {
    throw new ActionError(409, "invalid_article_status", `文章狀態 ${article.status} 不允許產內容包`);
  }

  const { plan } = await buildPackageForArticle(supabase, article);
  const zipBytes = await zipPackage(plan);
  const storagePath = `packages/${article.site_id}/${article.id}/${plan.filename}`;
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, zipBytes, { contentType: "application/zip", upsert: true });
  if (uploadError) {
    throw new ActionError(502, "package_upload_failed", dbError(uploadError));
  }

  const { error: updateError } = await supabase
    .from("content_articles")
    .update({ package_path: storagePath })
    .eq("id", article.id);
  if (updateError) console.warn("content-publish: package_path update failed", dbError(updateError));

  await writePublishLog(supabase, {
    siteId: article.site_id,
    articleId,
    action: "package",
    request: { article_id: articleId, version: article.version },
    response: {
      package_path: storagePath,
      filename: plan.filename,
      bytes: zipBytes.byteLength,
      files: plan.files.map((file) => file.path),
    },
    idempotencyKey: contentIdempotencyKey("package", articleId, article.version),
    actorId: actorUserId(actor),
  });
  await notifyPackageReady(supabase, article, storagePath, plan.filename);

  const { data: signed, error: signedError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signedError || !signed?.signedUrl) {
    throw new ActionError(502, "signed_url_failed", "內容包已上傳但無法建立下載連結");
  }

  return okJson({
    package_path: storagePath,
    signed_url: signed.signedUrl,
    filename: plan.filename,
    bytes: zipBytes.byteLength,
  });
}

/** manual_done：人工貼上後回填 URL（PRD §9.3.4；M3-09/M3-10 的終態） */
async function manualDone(
  supabase: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<Response> {
  const articleId = requireArticleId(body);
  const liveUrl = text(body.live_url);
  if (!liveUrl || !isHttpUrl(liveUrl)) {
    throw new ActionError(400, "invalid_live_url", "live_url 必填且必須是 http(s) 網址");
  }
  const article = await loadArticle(supabase, articleId);
  if (article.status !== "publishing" && article.status !== "scheduled") {
    throw new ActionError(
      409,
      "invalid_transition",
      `文章狀態為 ${article.status}，只有 publishing／scheduled 可以回填 URL`,
    );
  }

  // scheduled → manual_done 需經 publishing（狀態機不允許跳關，PRD §6.3）
  try {
    if (article.status === "scheduled") {
      assertTransition("article", "scheduled", "publishing");
      assertTransition("article", "publishing", "manual_done");
    } else {
      assertTransition("article", article.status, "manual_done");
    }
  } catch (error) {
    throw transitionError(error);
  }

  const publishedAt = nowIso();
  const updated = await patchArticle(supabase, articleId, {
    status: "manual_done",
    live_url: liveUrl,
    manual_url: liveUrl,
    published_at: publishedAt,
    reason: null,
    version: article.version + 1,
  }, article.version);

  const slot = await loadSlotForArticle(supabase, updated);
  await syncSlotStatus(supabase, slot, "published");

  const log = await writePublishLog(supabase, {
    siteId: article.site_id,
    articleId,
    action: "manual_done",
    request: { article_id: articleId, live_url: liveUrl },
    response: { status: "manual_done", published_at: publishedAt, actor: actor.displayName },
    url: liveUrl,
    actorId: actorUserId(actor),
  });

  // 回填後排入上線驗證（M3-10）；重複回填會被狀態機擋下，不擔心重複排入
  try {
    await enqueueJob(
      supabase,
      "verify_publish",
      {
        article_id: articleId,
        dedupe_key: `verify:${articleId}:v${updated.version}`,
      },
      nowIso(),
    );
  } catch (error) {
    console.warn("content-publish: enqueue verify failed", errorMessage(error));
  }

  return okJson(log ?? updated);
}

/** retry：publish_failed／verify_failed → scheduled + 重新排入 publish_article（M3-11） */
async function retryArticle(
  supabase: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<Response> {
  const articleId = requireArticleId(body);
  const article = await loadArticle(supabase, articleId);
  if (article.status !== "publish_failed" && article.status !== "verify_failed") {
    throw new ActionError(
      409,
      "invalid_transition",
      `只有 publish_failed／verify_failed 可以重試（目前 ${article.status}）`,
    );
  }

  const slot = await loadSlotForArticle(supabase, article);
  const scheduledPublishAt =
    article.scheduled_publish_at || slot?.publish_at || nowIso();

  // verify_failed → scheduled 需經 publish_failed（狀態機的中間態）
  try {
    if (article.status === "verify_failed") {
      assertTransition("article", "verify_failed", "publish_failed");
      assertTransition("article", "publish_failed", "scheduled");
    } else {
      assertTransition("article", article.status, "scheduled");
    }
  } catch (error) {
    throw transitionError(error);
  }

  const updated = await patchArticle(supabase, articleId, {
    status: "scheduled",
    scheduled_publish_at: scheduledPublishAt,
    reason: null,
    version: article.version + 1,
  }, article.version);
  await syncSlotStatus(supabase, slot, "scheduled");

  await writePublishLog(supabase, {
    siteId: article.site_id,
    articleId,
    action: "retry",
    request: { article_id: articleId, from_status: article.status },
    response: { status: "scheduled" },
    actorId: actorUserId(actor),
  });

  await enqueueJob(
    supabase,
    "publish_article",
    {
      article_id: articleId,
      dedupe_key: `publish:${articleId}:v${updated.version}`,
    },
    nowIso(),
  );
  return okJson({ queued: true, article_id: articleId });
}

// ============================================================
// delete_published：真正刪除站點上的文章（不是只刪 MPS 記錄）
//
// 這裡只做前置檢查＋排 job；實際刪除由 content-worker 的 delete_article 呼叫 adapter。
// 只有「已由 adapter 發佈、有 external_id」的文章可以刪；手動內容包沒有遠端 ID，必須到站點手動刪。
// ============================================================

const DELETABLE_STATUSES: ContentArticleStatus[] = [
  "published",
  "updating",
  "verify_failed",
  "draft_published",
];

async function deletePublished(
  supabase: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<Response> {
  const articleId = text(body.article_id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(articleId)) {
    return failJson(400, "invalid_article_id", "缺少有效的 article_id");
  }

  const article = await loadArticle(supabase, articleId);
  if (article.deleted_at) {
    return okJson({ queued: false, already_deleted: true, article_id: article.id });
  }
  if (!DELETABLE_STATUSES.includes(article.status)) {
    return failJson(
      409,
      "not_deletable",
      `文章狀態為 ${article.status}，只有已發佈／已建草稿的文章可以遠端刪除`,
    );
  }
  if (!article.external_id) {
    return failJson(
      409,
      "no_remote_id",
      "這篇文章沒有站點 external_id（手動內容包或尚未用 adapter 發佈），請到站點後台手動刪除",
    );
  }

  const site = await loadSite(supabase, article.site_id);
  if (!site) return failJson(404, "site_not_found", "找不到文章所屬站點");
  const adapter = getContentAdapter(site.adapter);
  if (!adapter.deleteArticle) {
    return failJson(
      409,
      "delete_unsupported",
      `站點 adapter「${site.adapter}」不支援遠端刪除，請到站點後台手動刪除`,
    );
  }

  const reason = text(body.reason) || "手動下架";
  await enqueueJob(
    supabase,
    "delete_article",
    { article_id: article.id, reason, dedupe_key: `delete:${article.id}` },
    nowIso(),
  );

  await writePublishLog(supabase, {
    siteId: article.site_id,
    articleId: article.id,
    action: "delete",
    request: {
      article_id: article.id,
      adapter: adapter.name,
      external_id: article.external_id,
      reason,
      queued: true,
    },
    response: { queued: true },
    externalId: article.external_id,
    actorId: actorUserId(actor),
  });

  return okJson({ queued: true, article_id: article.id, adapter: adapter.name });
}

// ============================================================
// 入口
// ============================================================

async function handleAction(
  supabase: Db,
  actor: ContentActor,
  action: string,
  body: Record<string, unknown>,
): Promise<Response> {
  switch (action) {
    case "save_draft":
      return saveDraft(supabase, actor, body);
    case "submit_for_review":
      return submitForReview(supabase, body);
    case "approve":
      return approveArticle(supabase, actor, body);
    case "reject":
      return rejectArticle(supabase, actor, body);
    case "confirm":
      return confirmArticle(supabase, actor, body);
    case "build_package":
      return buildPackageAction(supabase, actor, body);
    case "manual_done":
      return manualDone(supabase, actor, body);
    case "retry":
      return retryArticle(supabase, actor, body);
    case "delete_published":
      return deletePublished(supabase, actor, body);
    default:
      return failJson(400, "unknown_action", `不支援的 action：${action}`);
  }
}

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
    return failJson(400, "unknown_action", `不支援的 action：${action || "(空)"}`);
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
    return await handleAction(supabase, actor, action, body);
  } catch (error) {
    if (error instanceof ActionError) {
      return failJson(error.status, error.code, error.message);
    }
    if (error instanceof ContentTransitionError) {
      return failJson(409, "invalid_transition", error.message);
    }
    console.error("content-publish: unexpected error", errorMessage(error));
    return failJson(500, "publish_failed", errorMessage(error));
  }
});
