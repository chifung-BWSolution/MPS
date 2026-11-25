import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  dbError,
  failJson,
  guardMethod,
  okJson,
  readBody,
  requireAction,
  requireActor,
  serviceClient,
} from "../_shared/contentAuth.ts";
import {
  ContentVaultError,
  sealCredential,
  vaultConfigured,
  verifyCredentialCiphertext,
} from "../_shared/contentVault.ts";
import {
  CONTENT_NOT_ENABLED_MESSAGE,
  type ContentAdapterName,
  type ContentBrandVoice,
  type ContentCadence,
  type ContentCheckResult,
  type ContentConnectionTestResult,
  type ContentCredentialKind,
  type ContentCredentialMeta,
  type ContentJsonLdType,
  type ContentPublishMode,
  type ContentSeoDefaults,
  type ContentSite,
  type ContentSiteCheck,
  type ContentSiteCheckKind,
  type ContentSiteHealth,
  type ContentSitePage,
  type ContentSiteProfile,
  type ContentSiteSection,
  type ContentSiteStatus,
  type ContentSiteWithProfile,
  type ContentSectionType,
  type ContentTier,
} from "../../../src/lib/contentTypes.ts";
import { DEFAULT_BRAND_VOICE, DEFAULT_SEO_DEFAULTS } from "../../../src/lib/contentFormat.ts";
import { normalizeCadence, validateCadence } from "../../../src/lib/contentPlanner.ts";

/**
 * content-sites｜站點接入、欄目、憑證與連線測試（PRD §9.1、§11；實作契約 §6）
 *
 * 入口一律：guardMethod → requireActor → 依動作 requireAction。
 *   - list / get：view（全體登入者可讀）
 *   - 其餘（站點接入、欄目、憑證、連線測試）：manage_sites（管理層）
 *
 * 所有讀寫都走 service role：
 *   - content_site_credentials 對 authenticated 完全封閉，只有 service_role 能碰
 *   - 站點設定／欄目／檢查紀錄即使 RLS 開放，也統一由函式寫入以維持一致性
 *
 * 回應格式一律 okJson / failJson（{ok,data} / {ok,code,error}）。
 * 憑證明文永不落地（seal 後只回 fingerprint）。
 */

type ContentDb = ReturnType<typeof serviceClient>;

// ============================================================
// 常數
// ============================================================

const TIERS: ReadonlySet<ContentTier> = new Set<ContentTier>(["A1", "A2", "B"]);
const ADAPTERS: ReadonlySet<ContentAdapterName> = new Set<ContentAdapterName>([
  "manual",
  "next_custom",
  "shopify",
  "wordpress",
  "webflow",
  "beauty100",
]);
const PUBLISH_MODES: ReadonlySet<ContentPublishMode> = new Set<ContentPublishMode>([
  "manual",
  "draft",
  "direct",
]);
const SITE_STATUSES: ReadonlySet<ContentSiteStatus> = new Set<ContentSiteStatus>([
  "active",
  "paused",
  "archived",
]);
const SITE_HEALTHS: ReadonlySet<ContentSiteHealth> = new Set<ContentSiteHealth>([
  "untested",
  "ok",
  "degraded",
  "down",
]);
const SECTION_TYPES: ReadonlySet<ContentSectionType> = new Set<ContentSectionType>([
  "article",
  "post",
  "page",
]);
const CREDENTIAL_KINDS: ReadonlySet<ContentCredentialKind> = new Set<ContentCredentialKind>([
  "http_bearer",
  "http_hmac",
  "wp_app_password",
  "shopify_admin",
  "webflow_token",
]);
const JSON_LD_TYPES: ReadonlySet<ContentJsonLdType> = new Set<ContentJsonLdType>([
  "BlogPosting",
  "Article",
]);
const CHECK_KINDS: ReadonlySet<ContentSiteCheckKind> = new Set<ContentSiteCheckKind>([
  "settings",
  "domain",
  "sitemap",
  "credential",
]);

const CHECK_LABELS: Record<ContentSiteCheckKind, string> = {
  settings: "設定完整",
  domain: "網域可達",
  sitemap: "Sitemap 可解析",
  credential: "憑證可解密",
};

/** 站點主檔可選欄位（webandsystem_list 是站點身份唯一真實來源） */
const PROFILE_COLUMNS = "id, website_name, domain_url, platform, brand, status, level";
/** 憑證 metadata：刻意不含 ciphertext，讀清單時永不把密文送到瀏覽器 */
const CREDENTIAL_META_COLUMNS = "kind, fingerprint, status, expires_at, last_verified_at";

const CHECK_TIMEOUT_MS = 10_000;
const CHECK_HISTORY_LIMIT = 20;
const SITE_PAGE_LIMIT = 200;
const CANDIDATE_LIMIT = 200;
const MAX_SECRET_LENGTH = 8_000;

const VIEW_ACTIONS: ReadonlySet<string> = new Set(["list", "get"]);

// ============================================================
// HTTP 錯誤（handler 內直接 throw，由入口統一轉成 failJson）
// ============================================================

class ContentHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ContentHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new ContentHttpError(status, code, message, details);
}

interface DbErrorShape {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const SCHEMA_MISSING_CODES: ReadonlySet<string> = new Set(["42P01", "PGRST205", "PGRST204"]);

/** 資料表未建（部署順序顛倒）時回契約認得的 code，讓前端顯示「功能尚未啟用」 */
function throwDb(error: DbErrorShape | null, context: string): void {
  if (!error) return;
  const code = String(error.code ?? "");
  if (SCHEMA_MISSING_CODES.has(code)) {
    fail(503, code, CONTENT_NOT_ENABLED_MESSAGE);
  }
  fail(500, "db_error", `${context}：${dbError(error)}`, code ? { code } : undefined);
}

// ============================================================
// 輸入正規化
// ============================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** PostgREST 的 in.(...) 走 URL query，分批可避免超長 URL */
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function requireSiteId(body: Record<string, unknown>): string {
  const siteId = asTrimmedString(body.site_id);
  if (!siteId) fail(400, "invalid_site_id", "缺少有效的 site_id");
  return siteId;
}

/** 白名單列舉欄位；不合法一律 400（不是靜默忽略） */
function pickEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  field: string,
  code = "invalid_patch",
): T {
  const text = asTrimmedString(value);
  if (!text || !allowed.has(text as T)) {
    fail(400, code, `${field} 不合法`, { field, allowed: [...allowed] });
  }
  return text as T;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function parseOptionalDateTime(value: unknown, field: string, code: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") fail(400, code, `${field} 必須是 ISO 時間字串`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(400, code, `${field} 不是有效的時間`);
  return date.toISOString();
}

/** notes 允許 null 或字串；空字串一律存 null */
function parseNotes(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail(400, "invalid_patch", "notes 必須是字串或 null");
  return value.trim() || null;
}

// ============================================================
// JSONB 讀取：一律用共用預設值補齊（PRD §9.1.3）
// ============================================================

function normalizeSeoDefaults(value: unknown): ContentSeoDefaults {
  const source = asRecord(value);
  const text = (key: string, fallback: string): string =>
    typeof source[key] === "string" ? (source[key] as string) : fallback;
  const number = (key: string, fallback: number): number => {
    const parsed = Number(source[key]);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  };
  const jsonLdType: ContentJsonLdType =
    typeof source.jsonLdType === "string" && JSON_LD_TYPES.has(source.jsonLdType as ContentJsonLdType)
      ? (source.jsonLdType as ContentJsonLdType)
      : DEFAULT_SEO_DEFAULTS.jsonLdType;
  const categoryMap: Record<string, string> = {};
  if (isRecord(source.categoryMap)) {
    for (const [key, entry] of Object.entries(source.categoryMap)) {
      if (typeof entry === "string") categoryMap[key] = entry;
    }
  }

  return {
    locale: text("locale", DEFAULT_SEO_DEFAULTS.locale),
    titleTemplate: text("titleTemplate", DEFAULT_SEO_DEFAULTS.titleTemplate),
    metaTemplate: text("metaTemplate", DEFAULT_SEO_DEFAULTS.metaTemplate),
    slugRule: text("slugRule", DEFAULT_SEO_DEFAULTS.slugRule),
    canonicalBase: text("canonicalBase", DEFAULT_SEO_DEFAULTS.canonicalBase),
    author: text("author", DEFAULT_SEO_DEFAULTS.author),
    publisher: text("publisher", DEFAULT_SEO_DEFAULTS.publisher),
    ogImage: text("ogImage", DEFAULT_SEO_DEFAULTS.ogImage),
    jsonLdType,
    categoryMap,
    robotsDraft: text("robotsDraft", DEFAULT_SEO_DEFAULTS.robotsDraft),
    robotsLive: text("robotsLive", DEFAULT_SEO_DEFAULTS.robotsLive),
    wordCountMin: number("wordCountMin", DEFAULT_SEO_DEFAULTS.wordCountMin),
    wordCountMax: number("wordCountMax", DEFAULT_SEO_DEFAULTS.wordCountMax),
    internalLinksMin: number("internalLinksMin", DEFAULT_SEO_DEFAULTS.internalLinksMin),
    internalLinksMax: number("internalLinksMax", DEFAULT_SEO_DEFAULTS.internalLinksMax),
    bannedWords: Array.isArray(source.bannedWords)
      ? source.bannedWords
          .map((word) => (typeof word === "string" ? word.trim() : ""))
          .filter(Boolean)
      : [...DEFAULT_SEO_DEFAULTS.bannedWords],
  };
}

function normalizeBrandVoice(value: unknown): ContentBrandVoice {
  const source = asRecord(value);
  const text = (key: string, fallback: string): string =>
    typeof source[key] === "string" ? (source[key] as string) : fallback;

  return {
    tone: text("tone", DEFAULT_BRAND_VOICE.tone),
    audience: text("audience", DEFAULT_BRAND_VOICE.audience),
    cta: text("cta", DEFAULT_BRAND_VOICE.cta),
    bannedWords: Array.isArray(source.bannedWords)
      ? source.bannedWords
          .map((word) => (typeof word === "string" ? word.trim() : ""))
          .filter(Boolean)
      : [...DEFAULT_BRAND_VOICE.bannedWords],
    factBoundaries: text("factBoundaries", DEFAULT_BRAND_VOICE.factBoundaries),
    allowAiImages:
      typeof source.allowAiImages === "boolean"
        ? source.allowAiImages
        : DEFAULT_BRAND_VOICE.allowAiImages,
  };
}

// ============================================================
// DB 資料列 → 契約型別
// ============================================================

interface ContentSiteRow {
  website_profile_id: string;
  tier: string | null;
  adapter: string | null;
  publish_mode: string | null;
  locale: string | null;
  timezone: string | null;
  cadence: unknown;
  seo_defaults: unknown;
  brand_voice: unknown;
  health: string | null;
  last_verified_at: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileRow {
  id: string;
  website_name: string;
  domain_url: string | null;
  platform: string | null;
  brand: string | null;
  status: string | null;
  level: number | null;
}

interface SectionRow {
  id: string;
  site_id: string;
  name: string;
  external_id: string | null;
  slug: string;
  content_type: string;
  mapping: unknown;
  created_at: string;
  updated_at: string;
}

interface CheckRow {
  id: string;
  site_id: string;
  checked_at: string;
  kind: string;
  ok: boolean;
  detail: unknown;
}

interface PageRow {
  id: string;
  site_id: string;
  url: string;
  title: string | null;
  source: string;
  last_seen_at: string | null;
  created_at: string;
}

interface CredentialMetaRow {
  kind: string;
  fingerprint: string | null;
  status: string;
  expires_at: string | null;
  last_verified_at: string | null;
}

function toContentSite(row: ContentSiteRow): ContentSite {
  const tier =
    typeof row.tier === "string" && TIERS.has(row.tier as ContentTier)
      ? (row.tier as ContentTier)
      : "B";
  const adapter =
    typeof row.adapter === "string" && ADAPTERS.has(row.adapter as ContentAdapterName)
      ? (row.adapter as ContentAdapterName)
      : "manual";
  const publishMode =
    typeof row.publish_mode === "string" && PUBLISH_MODES.has(row.publish_mode as ContentPublishMode)
      ? (row.publish_mode as ContentPublishMode)
      : "manual";
  const status =
    typeof row.status === "string" && SITE_STATUSES.has(row.status as ContentSiteStatus)
      ? (row.status as ContentSiteStatus)
      : "active";
  const health =
    typeof row.health === "string" && SITE_HEALTHS.has(row.health as ContentSiteHealth)
      ? (row.health as ContentSiteHealth)
      : "untested";

  return {
    website_profile_id: row.website_profile_id,
    tier,
    adapter,
    publish_mode: publishMode,
    locale: asTrimmedString(row.locale) ?? "zh-HK",
    timezone: asTrimmedString(row.timezone) ?? "Asia/Hong_Kong",
    cadence: normalizeCadence(row.cadence as Partial<ContentCadence> | null | undefined),
    seo_defaults: normalizeSeoDefaults(row.seo_defaults),
    brand_voice: normalizeBrandVoice(row.brand_voice),
    health,
    last_verified_at: row.last_verified_at ?? null,
    status,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toProfile(row: ProfileRow): ContentSiteProfile {
  return {
    id: row.id,
    website_name: row.website_name,
    domain_url: row.domain_url ?? null,
    platform: row.platform ?? null,
    brand: row.brand ?? null,
    status: row.status ?? null,
    level: row.level == null ? null : Number(row.level),
  };
}

function toSection(row: SectionRow): ContentSiteSection {
  const contentType =
    typeof row.content_type === "string" &&
    SECTION_TYPES.has(row.content_type as ContentSectionType)
      ? (row.content_type as ContentSectionType)
      : "article";
  return {
    id: row.id,
    site_id: row.site_id,
    name: row.name,
    external_id: row.external_id ?? null,
    slug: row.slug,
    content_type: contentType,
    mapping: asRecord(row.mapping),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toCheck(row: CheckRow): ContentSiteCheck {
  const kind =
    typeof row.kind === "string" && CHECK_KINDS.has(row.kind as ContentSiteCheckKind)
      ? (row.kind as ContentSiteCheckKind)
      : "settings";
  return {
    id: row.id,
    site_id: row.site_id,
    checked_at: row.checked_at,
    kind,
    ok: Boolean(row.ok),
    detail: asRecord(row.detail),
  };
}

function toPage(row: PageRow): ContentSitePage {
  return {
    id: row.id,
    site_id: row.site_id,
    url: row.url,
    title: row.title ?? null,
    source: row.source === "manual" ? "manual" : "sitemap",
    last_seen_at: row.last_seen_at ?? null,
    created_at: row.created_at,
  };
}

function toCredentialMeta(row: CredentialMetaRow): ContentCredentialMeta {
  const kind =
    typeof row.kind === "string" && CREDENTIAL_KINDS.has(row.kind as ContentCredentialKind)
      ? (row.kind as ContentCredentialKind)
      : "http_bearer";
  const status =
    row.status === "active" || row.status === "invalid" || row.status === "untested"
      ? row.status
      : "untested";
  return {
    kind,
    fingerprint: row.fingerprint ?? null,
    status,
    expires_at: row.expires_at ?? null,
    last_verified_at: row.last_verified_at ?? null,
  };
}

// ============================================================
// DB 查詢小工具
// ============================================================

async function loadSiteRow(db: ContentDb, siteId: string): Promise<ContentSiteRow> {
  const { data, error } = await db
    .from("content_sites")
    .select("*")
    .eq("website_profile_id", siteId)
    .maybeSingle();
  throwDb(error, "讀取站點設定失敗");
  if (!data) fail(404, "site_not_found", "此站點尚未接入內容自動化");
  return data as ContentSiteRow;
}

async function loadProfileRow(db: ContentDb, siteId: string): Promise<ProfileRow | null> {
  const { data, error } = await db
    .from("webandsystem_list")
    .select(PROFILE_COLUMNS)
    .eq("id", siteId)
    .maybeSingle();
  throwDb(error, "讀取站點主檔失敗");
  return (data as ProfileRow | null) ?? null;
}

async function fetchProfileMap(
  db: ContentDb,
  siteIds: string[],
): Promise<Map<string, ContentSiteProfile>> {
  const map = new Map<string, ContentSiteProfile>();
  for (const ids of chunk(siteIds, 100)) {
    const { data, error } = await db
      .from("webandsystem_list")
      .select(PROFILE_COLUMNS)
      .in("id", ids);
    throwDb(error, "讀取站點主檔失敗");
    for (const row of (data ?? []) as ProfileRow[]) map.set(row.id, toProfile(row));
  }
  return map;
}

async function listSections(db: ContentDb, siteId: string): Promise<ContentSiteSection[]> {
  const { data, error } = await db
    .from("content_site_sections")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: true });
  throwDb(error, "讀取欄目失敗");
  return ((data ?? []) as SectionRow[]).map(toSection);
}

async function listCheckHistory(db: ContentDb, siteId: string): Promise<ContentSiteCheck[]> {
  const { data, error } = await db
    .from("content_site_checks")
    .select("*")
    .eq("site_id", siteId)
    .order("checked_at", { ascending: false })
    .limit(CHECK_HISTORY_LIMIT);
  throwDb(error, "讀取健康檢查紀錄失敗");
  return ((data ?? []) as CheckRow[]).map(toCheck);
}

async function listCredentialMeta(
  db: ContentDb,
  siteId: string,
): Promise<ContentCredentialMeta[]> {
  const { data, error } = await db
    .from("content_site_credentials")
    .select(CREDENTIAL_META_COLUMNS)
    .eq("site_id", siteId)
    .order("created_at", { ascending: true });
  throwDb(error, "讀取憑證清單失敗");
  return ((data ?? []) as CredentialMetaRow[]).map(toCredentialMeta);
}

async function listPages(db: ContentDb, siteId: string): Promise<ContentSitePage[]> {
  const { data, error } = await db
    .from("content_site_pages")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(SITE_PAGE_LIMIT);
  throwDb(error, "讀取站點頁面失敗");
  return ((data ?? []) as PageRow[]).map(toPage);
}

// ============================================================
// 設定 patch 驗證（upsert_settings 白名單）
// ============================================================

function validateSeoDefaultsPatch(raw: Record<string, unknown>): void {
  for (const key of [
    "locale",
    "titleTemplate",
    "metaTemplate",
    "slugRule",
    "canonicalBase",
    "author",
    "publisher",
    "ogImage",
    "robotsDraft",
    "robotsLive",
  ]) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") {
      fail(400, "invalid_patch", `seo_defaults.${key} 必須是字串`, { field: `seo_defaults.${key}` });
    }
  }
  if (
    raw.jsonLdType !== undefined &&
    !JSON_LD_TYPES.has(raw.jsonLdType as ContentJsonLdType)
  ) {
    fail(400, "invalid_patch", "seo_defaults.jsonLdType 必須是 BlogPosting 或 Article", {
      field: "seo_defaults.jsonLdType",
    });
  }
  for (const key of ["wordCountMin", "wordCountMax", "internalLinksMin", "internalLinksMax"]) {
    if (raw[key] === undefined) continue;
    const value = Number(raw[key]);
    if (!Number.isFinite(value) || value < 0) {
      fail(400, "invalid_patch", `seo_defaults.${key} 必須是 0 或正整數`, {
        field: `seo_defaults.${key}`,
      });
    }
  }
  if (
    raw.bannedWords !== undefined &&
    (!Array.isArray(raw.bannedWords) || raw.bannedWords.some((word) => typeof word !== "string"))
  ) {
    fail(400, "invalid_patch", "seo_defaults.bannedWords 必須是字串陣列", {
      field: "seo_defaults.bannedWords",
    });
  }
  if (raw.categoryMap !== undefined && !isRecord(raw.categoryMap)) {
    fail(400, "invalid_patch", "seo_defaults.categoryMap 必須是物件", {
      field: "seo_defaults.categoryMap",
    });
  }
}

function assertSeoDefaultsConsistent(seoDefaults: ContentSeoDefaults): void {
  const issues: string[] = [];
  if (seoDefaults.wordCountMax < seoDefaults.wordCountMin) {
    issues.push("wordCountMax 不可小於 wordCountMin");
  }
  if (seoDefaults.internalLinksMax < seoDefaults.internalLinksMin) {
    issues.push("internalLinksMax 不可小於 internalLinksMin");
  }
  if (issues.length > 0) fail(400, "invalid_patch", "SEO 預設值不正確", issues);
}

function validateBrandVoicePatch(raw: Record<string, unknown>): void {
  for (const key of ["tone", "audience", "cta", "factBoundaries"]) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") {
      fail(400, "invalid_patch", `brand_voice.${key} 必須是字串`, { field: `brand_voice.${key}` });
    }
  }
  if (raw.allowAiImages !== undefined && typeof raw.allowAiImages !== "boolean") {
    fail(400, "invalid_patch", "brand_voice.allowAiImages 必須是布林值", {
      field: "brand_voice.allowAiImages",
    });
  }
  if (
    raw.bannedWords !== undefined &&
    (!Array.isArray(raw.bannedWords) || raw.bannedWords.some((word) => typeof word !== "string"))
  ) {
    fail(400, "invalid_patch", "brand_voice.bannedWords 必須是字串陣列", {
      field: "brand_voice.bannedWords",
    });
  }
}

/**
 * 組出只含白名單欄位的 update 物件。
 * seo_defaults / brand_voice / cadence 都與「現值 + 預設值」merge，部分更新不會把其他設定洗掉。
 */
function buildSettingsPatch(
  patch: Record<string, unknown>,
  existing: ContentSite | null,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  if (patch.tier !== undefined) update.tier = pickEnum(patch.tier, TIERS, "tier");
  if (patch.adapter !== undefined) update.adapter = pickEnum(patch.adapter, ADAPTERS, "adapter");
  if (patch.publish_mode !== undefined) {
    update.publish_mode = pickEnum(patch.publish_mode, PUBLISH_MODES, "publish_mode");
  }
  if (patch.status !== undefined) update.status = pickEnum(patch.status, SITE_STATUSES, "status");
  if (patch.locale !== undefined) {
    const locale = asTrimmedString(patch.locale);
    if (!locale) fail(400, "invalid_patch", "locale 不可為空", { field: "locale" });
    update.locale = locale;
  }
  if (patch.timezone !== undefined) {
    const timezone = asTrimmedString(patch.timezone);
    if (!timezone || !isValidTimeZone(timezone)) {
      fail(400, "invalid_patch", "timezone 必須是合法的 IANA 時區", { field: "timezone" });
    }
    update.timezone = timezone;
  }
  if (patch.notes !== undefined) update.notes = parseNotes(patch.notes);

  if (patch.cadence !== undefined) {
    if (!isRecord(patch.cadence)) {
      fail(400, "invalid_cadence", "cadence 必須是物件");
    }
    const merged = normalizeCadence({
      ...(existing?.cadence ?? {}),
      ...patch.cadence,
    } as Partial<ContentCadence>);
    const cadenceErrors = validateCadence(merged);
    if (cadenceErrors.length > 0) {
      fail(400, "invalid_cadence", "頻率設定不正確", cadenceErrors);
    }
    update.cadence = merged;
  }

  if (patch.seo_defaults !== undefined) {
    if (!isRecord(patch.seo_defaults)) {
      fail(400, "invalid_patch", "seo_defaults 必須是物件", { field: "seo_defaults" });
    }
    validateSeoDefaultsPatch(patch.seo_defaults);
    const merged = normalizeSeoDefaults({
      ...(existing?.seo_defaults ?? DEFAULT_SEO_DEFAULTS),
      ...patch.seo_defaults,
    });
    assertSeoDefaultsConsistent(merged);
    update.seo_defaults = merged;
  }

  if (patch.brand_voice !== undefined) {
    if (!isRecord(patch.brand_voice)) {
      fail(400, "invalid_patch", "brand_voice 必須是物件", { field: "brand_voice" });
    }
    validateBrandVoicePatch(patch.brand_voice);
    update.brand_voice = normalizeBrandVoice({
      ...(existing?.brand_voice ?? DEFAULT_BRAND_VOICE),
      ...patch.brand_voice,
    });
  }

  return update;
}

// ============================================================
// 動作：list（PRD §9.1.1；契約 §6）
// ============================================================

async function handleList(): Promise<ContentSiteWithProfile[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from("content_sites")
    .select("*")
    .order("created_at", { ascending: true });
  throwDb(error, "讀取站點清單失敗");

  const rows = (data ?? []) as ContentSiteRow[];
  if (rows.length === 0) return [];

  const profiles = await fetchProfileMap(
    db,
    rows.map((row) => row.website_profile_id),
  );
  return rows.map((row) => ({
    ...toContentSite(row),
    profile: profiles.get(row.website_profile_id) ?? null,
  }));
}

// ============================================================
// 動作：get（站點詳情：設定 + 欄目 + 檢查 + 憑證 metadata + 頁面）
// ============================================================

async function handleGet(body: Record<string, unknown>): Promise<{
  site: ContentSiteWithProfile;
  sections: ContentSiteSection[];
  checks: ContentSiteCheck[];
  credentials: ContentCredentialMeta[];
  pages: ContentSitePage[];
}> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  const row = await loadSiteRow(db, siteId);

  const [profile, sections, checks, credentials, pages] = await Promise.all([
    loadProfileRow(db, siteId),
    listSections(db, siteId),
    listCheckHistory(db, siteId),
    listCredentialMeta(db, siteId),
    listPages(db, siteId),
  ]);

  return {
    site: { ...toContentSite(row), profile: profile ? toProfile(profile) : null },
    sections,
    checks,
    credentials,
    pages,
  };
}

// ============================================================
// 動作：upsert_settings（接入 / 更新站點設定；PRD §9.1.1、§9.1.3）
// ============================================================

async function handleUpsertSettings(body: Record<string, unknown>): Promise<ContentSite> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  // 契約是 { site_id, patch }；同時容忍把白名單欄位直接攤平在 body（前端兩者皆可）
  const patch = body.patch === undefined ? body : asRecord(body.patch);

  // 站點身份以 webandsystem_list 為準：不存在 = 404，不允許憑空建站
  const profile = await loadProfileRow(db, siteId);
  if (!profile) fail(404, "site_not_found", "找不到此站點主檔（webandsystem_list）");

  const { data: existingRow, error: existingError } = await db
    .from("content_sites")
    .select("*")
    .eq("website_profile_id", siteId)
    .maybeSingle();
  throwDb(existingError, "讀取站點設定失敗");

  const existing = existingRow ? toContentSite(existingRow as ContentSiteRow) : null;
  const update = buildSettingsPatch(patch, existing);

  const { data, error } = existing
    ? await db
        .from("content_sites")
        .update(update)
        .eq("website_profile_id", siteId)
        .select("*")
        .single()
    : await db
        .from("content_sites")
        .insert({ website_profile_id: siteId, ...update })
        .select("*")
        .single();
  throwDb(error, existing ? "更新站點設定失敗" : "接入站點失敗");

  return toContentSite(data as ContentSiteRow);
}

// ============================================================
// 動作：set_status（active / paused / archived；歸檔不刪除）
// ============================================================

async function handleSetStatus(body: Record<string, unknown>): Promise<ContentSite> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  await loadSiteRow(db, siteId);

  const update: Record<string, unknown> = {
    status: pickEnum(body.status, SITE_STATUSES, "status", "invalid_status"),
  };
  if (body.notes !== undefined) update.notes = parseNotes(body.notes);

  const { data, error } = await db
    .from("content_sites")
    .update(update)
    .eq("website_profile_id", siteId)
    .select("*")
    .maybeSingle();
  throwDb(error, "更新站點狀態失敗");
  if (!data) fail(404, "site_not_found", "此站點尚未接入內容自動化");

  return toContentSite(data as ContentSiteRow);
}

// ============================================================
// 動作：remove_site（解除接入，回到「未接入」）
//
// 目的：讓營運人員可以把站點退回未接入狀態，之後重新走接入精靈。
//
// 影響：content_sites 設定與其子資料（欄目／排程／文章／修訂／憑證／檢查紀錄）
//       會依 ON DELETE CASCADE 一併刪除，無法復原。
//       內容素材（content_assets）的 site_id 會設為 NULL（檔案與列保留）。
// 不影響：webandsystem_list 站點主檔、GSC／廣告資料、其他模組。
// 權限：manage_sites（管理層），且必須帶 confirm: true。
// ============================================================

interface SiteRemovalCounts {
  sections: number;
  slots: number;
  articles: number;
  credentials: number;
  checks: number;
}

async function countSiteRows(
  db: ContentDb,
  table: string,
  siteId: string,
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId);
  if (error) return 0; // 計數失敗不阻擋移除，只回 0
  return count ?? 0;
}

async function handleRemoveSite(
  body: Record<string, unknown>,
): Promise<{ removed: true; site_id: string; deleted: SiteRemovalCounts }> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  if (body.confirm !== true) {
    fail(400, "confirm_required", "移除接入需要明確確認（confirm: true）");
  }
  await loadSiteRow(db, siteId);

  const [sections, slots, articles, credentials, checks] = await Promise.all([
    countSiteRows(db, "content_site_sections", siteId),
    countSiteRows(db, "content_slots", siteId),
    countSiteRows(db, "content_articles", siteId),
    countSiteRows(db, "content_site_credentials", siteId),
    countSiteRows(db, "content_site_checks", siteId),
  ]);

  const { error } = await db
    .from("content_sites")
    .delete()
    .eq("website_profile_id", siteId);
  throwDb(error, "移除站點接入失敗");

  const deleted: SiteRemovalCounts = { sections, slots, articles, credentials, checks };
  console.log(
    `[content-sites] removed site ${siteId}: ${JSON.stringify(deleted)}`,
  );
  return { removed: true, site_id: siteId, deleted };
}

// ============================================================
// 動作：list_sections / upsert_section / delete_section（PRD §9.1.1）
// ============================================================

async function handleListSections(body: Record<string, unknown>): Promise<ContentSiteSection[]> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  await loadSiteRow(db, siteId);
  return listSections(db, siteId);
}

async function handleUpsertSection(body: Record<string, unknown>): Promise<ContentSiteSection> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  await loadSiteRow(db, siteId);

  // 契約是 { site_id, section }；攤平欄位也接受
  const input = body.section === undefined ? body : asRecord(body.section);
  const sectionId = asTrimmedString(input.id);

  let existing: SectionRow | null = null;
  if (sectionId) {
    const { data, error } = await db
      .from("content_site_sections")
      .select("*")
      .eq("id", sectionId)
      .eq("site_id", siteId)
      .maybeSingle();
    throwDb(error, "讀取欄目失敗");
    if (!data) fail(404, "section_not_found", "找不到此欄目");
    existing = data as SectionRow;
  }

  const name =
    input.name === undefined ? (existing?.name ?? null) : asTrimmedString(input.name);
  if (!name) fail(400, "invalid_section", "欄目名稱不可為空（name）");

  const slug =
    input.slug === undefined ? (existing?.slug ?? null) : asTrimmedString(input.slug);
  if (!slug) fail(400, "invalid_section", "欄目 slug 不可為空（slug）");

  const contentType =
    input.content_type === undefined
      ? ((existing?.content_type as ContentSectionType | undefined) ?? "article")
      : pickEnum(input.content_type, SECTION_TYPES, "content_type", "invalid_section");

  let externalId: string | null;
  if (input.external_id === undefined) {
    externalId = existing?.external_id ?? null;
  } else if (input.external_id === null) {
    externalId = null;
  } else {
    externalId = asTrimmedString(input.external_id);
  }

  let mapping: Record<string, unknown>;
  if (input.mapping === undefined) {
    mapping = existing ? asRecord(existing.mapping) : {};
  } else if (isRecord(input.mapping)) {
    mapping = input.mapping;
  } else {
    fail(400, "invalid_section", "mapping 必須是物件");
  }

  const payload = {
    site_id: siteId,
    name,
    slug,
    content_type: contentType,
    external_id: externalId,
    mapping,
  };

  const { data, error } = existing
    ? await db
        .from("content_site_sections")
        .update(payload)
        .eq("id", existing.id)
        .eq("site_id", siteId)
        .select("*")
        .single()
    : await db.from("content_site_sections").insert(payload).select("*").single();

  if (error) {
    if (String(error.code ?? "") === "23505") {
      fail(409, "slug_taken", "此站點已有相同 slug 的欄目");
    }
    throwDb(error, existing ? "更新欄目失敗" : "新增欄目失敗");
  }

  return toSection(data as SectionRow);
}

async function handleDeleteSection(
  body: Record<string, unknown>,
): Promise<{ deleted: true; section_id: string }> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  await loadSiteRow(db, siteId);

  const sectionId = asTrimmedString(body.section_id);
  if (!sectionId) fail(400, "invalid_section_id", "缺少 section_id");

  const { data, error } = await db
    .from("content_site_sections")
    .delete()
    .eq("id", sectionId)
    .eq("site_id", siteId)
    .select("id");
  throwDb(error, "刪除欄目失敗");
  if (!data || data.length === 0) fail(404, "section_not_found", "找不到此欄目");

  return { deleted: true, section_id: sectionId };
}

// ============================================================
// 動作：save_credential / clear_credential（PRD §6.2.4、§7.4、M1-04）
// ============================================================

async function handleSaveCredential(body: Record<string, unknown>): Promise<ContentCredentialMeta> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  await loadSiteRow(db, siteId);

  const kind = pickEnum(body.kind, CREDENTIAL_KINDS, "kind", "invalid_credential_kind");
  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  if (!secret) fail(400, "invalid_secret", "憑證內容不可為空");
  if (secret.length > MAX_SECRET_LENGTH) {
    fail(400, "invalid_secret", `憑證內容不可超過 ${MAX_SECRET_LENGTH} 字元`);
  }
  const expiresAt = parseOptionalDateTime(body.expires_at, "expires_at", "invalid_expires_at");

  let sealed: { ciphertext: string; fingerprint: string };
  try {
    sealed = await sealCredential(secret);
  } catch (error) {
    if (error instanceof ContentVaultError) fail(503, error.code, error.message);
    throw error;
  }

  // 換新密文 = 舊驗證失效：status 回 untested、last_verified_at 清空（永不回寫明文）
  const { data, error } = await db
    .from("content_site_credentials")
    .upsert(
      {
        site_id: siteId,
        kind,
        ciphertext: sealed.ciphertext,
        fingerprint: sealed.fingerprint,
        expires_at: expiresAt,
        last_verified_at: null,
        status: "untested",
      },
      { onConflict: "site_id,kind" },
    )
    .select(CREDENTIAL_META_COLUMNS)
    .single();
  throwDb(error, "儲存憑證失敗");

  return toCredentialMeta(data as CredentialMetaRow);
}

async function handleClearCredential(
  body: Record<string, unknown>,
): Promise<{ cleared: true }> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  await loadSiteRow(db, siteId);

  const kind = pickEnum(body.kind, CREDENTIAL_KINDS, "kind", "invalid_credential_kind");
  // 只刪這一筆；沒有也視為已清除（冪等）
  const { error } = await db
    .from("content_site_credentials")
    .delete()
    .eq("site_id", siteId)
    .eq("kind", kind);
  throwDb(error, "刪除憑證失敗");

  return { cleared: true };
}

// ============================================================
// 動作：test_connection（PRD §9.1.2、M1-05）
// ============================================================

interface CheckOutcome {
  kind: ContentSiteCheckKind;
  ok: boolean;
  blocking: boolean;
  detail: Record<string, unknown>;
  summary: string;
}

interface CredentialCipherRow {
  kind: string;
  ciphertext: string;
  expires_at: string | null;
}

function toCheckResult(outcome: CheckOutcome): ContentCheckResult {
  return {
    kind: outcome.kind,
    label: CHECK_LABELS[outcome.kind],
    ok: outcome.ok,
    blocking: outcome.blocking,
    detail: outcome.summary,
  };
}

/** (1) 設定完整：tier / locale / seo_defaults 必填項 / 至少一個欄目（PRD §9.1.2-1） */
function checkSettings(row: ContentSiteRow, sections: ContentSiteSection[]): CheckOutcome {
  const site = toContentSite(row);
  const missing: string[] = [];

  if (!TIERS.has(site.tier)) missing.push("tier");
  if (!site.locale.trim()) missing.push("locale");
  if (!isValidTimeZone(site.timezone)) missing.push("timezone");

  const seo = site.seo_defaults;
  const seoRequired: Array<[string, string]> = [
    ["locale", seo.locale],
    ["titleTemplate", seo.titleTemplate],
    ["metaTemplate", seo.metaTemplate],
    ["slugRule", seo.slugRule],
  ];
  for (const [key, value] of seoRequired) {
    if (!String(value ?? "").trim()) missing.push(`seo_defaults.${key}`);
  }
  if (!Number.isFinite(seo.wordCountMin) || seo.wordCountMin <= 0) {
    missing.push("seo_defaults.wordCountMin");
  }
  if (!Number.isFinite(seo.wordCountMax) || seo.wordCountMax < seo.wordCountMin) {
    missing.push("seo_defaults.wordCountMax");
  }
  if (!Number.isFinite(seo.internalLinksMin) || seo.internalLinksMin < 0) {
    missing.push("seo_defaults.internalLinksMin");
  }
  if (!Number.isFinite(seo.internalLinksMax) || seo.internalLinksMax < seo.internalLinksMin) {
    missing.push("seo_defaults.internalLinksMax");
  }
  if (sections.length === 0) missing.push("至少一個欄目");

  const ok = missing.length === 0;
  return {
    kind: "settings",
    ok,
    blocking: true,
    detail: { ok, missing, section_count: sections.length },
    summary: ok ? "設定齊全" : `設定不完整：缺少 ${missing.join("、")}`,
  };
}

function normalizeDomainUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

function describeFetchError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "AbortError" || name === "TimeoutError") {
    return `逾時（${Math.round(CHECK_TIMEOUT_MS / 1000)} 秒）`;
  }
  const message = (error as { message?: string } | null)?.message;
  return message ? `連線失敗：${message}` : "連線失敗";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

/** (2) 網域可達：HEAD，10 秒 timeout；非 2xx/3xx 視為失敗（PRD §9.1.2-2） */
async function checkDomain(domainUrl: string | null): Promise<CheckOutcome> {
  const origin = normalizeDomainUrl(domainUrl);
  if (!origin) {
    return {
      kind: "domain",
      ok: false,
      blocking: true,
      detail: { url: null, error: "missing_domain" },
      summary: "站點主檔缺少網域（domain_url）",
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(origin, { method: "HEAD" }, CHECK_TIMEOUT_MS);
    const durationMs = Date.now() - startedAt;
    const ok = response.status >= 200 && response.status < 400;
    return {
      kind: "domain",
      ok,
      blocking: true,
      detail: { url: origin, status: response.status, duration_ms: durationMs },
      summary: ok
        ? `HTTP ${response.status}`
        : `HTTP ${response.status}（非 2xx/3xx，站點可能無法連線）`,
    };
  } catch (error) {
    return {
      kind: "domain",
      ok: false,
      blocking: true,
      detail: { url: origin, error: String((error as { name?: string })?.name ?? "fetch_failed"), duration_ms: Date.now() - startedAt },
      summary: describeFetchError(error),
    };
  }
}

/** (3) sitemap 可解析：容錯項，失敗只算 warning（PRD §9.1.2-3） */
async function checkSitemap(domainUrl: string | null, domainReachable: boolean): Promise<CheckOutcome> {
  if (!domainReachable) {
    return {
      kind: "sitemap",
      ok: false,
      blocking: false,
      detail: { skipped: true, reason: "domain_unreachable" },
      summary: "網域不可達，略過 sitemap 檢查",
    };
  }

  const origin = normalizeDomainUrl(domainUrl);
  if (!origin) {
    return {
      kind: "sitemap",
      ok: false,
      blocking: false,
      detail: { url: null, error: "missing_domain" },
      summary: "站點主檔缺少網域，無法檢查 sitemap",
    };
  }

  const url = `${origin}/sitemap.xml`;
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(
      url,
      { method: "GET", headers: { accept: "application/xml,text/xml,*/*" } },
      CHECK_TIMEOUT_MS,
    );
    const body = await response.text();
    const statusOk = response.status >= 200 && response.status < 300;
    const looksLikeXml = /<urlset[\s>]|<sitemapindex[\s>]/i.test(body);
    const urlCount = (body.match(/<loc>/gi) ?? []).length;
    const ok = statusOk && looksLikeXml;

    return {
      kind: "sitemap",
      ok,
      blocking: false,
      detail: {
        url,
        status: response.status,
        url_count: urlCount,
        duration_ms: Date.now() - startedAt,
        ...(ok ? {} : { error: statusOk ? "not_a_sitemap" : "http_error" }),
      },
      summary: ok
        ? `sitemap 可用（${urlCount} 個 URL）`
        : statusOk
          ? "sitemap.xml 不是有效的 sitemap（僅記警告）"
          : `sitemap HTTP ${response.status}（僅記警告）`,
    };
  } catch (error) {
    return {
      kind: "sitemap",
      ok: false,
      blocking: false,
      detail: {
        url,
        error: String((error as { name?: string })?.name ?? "fetch_failed"),
        duration_ms: Date.now() - startedAt,
      },
      summary: `sitemap 檢查失敗（僅記警告）：${describeFetchError(error)}`,
    };
  }
}

/** (4) 憑證可解密（有才驗）；把驗證結果寫回該筆憑證的 status / last_verified_at */
async function checkCredentials(
  db: ContentDb,
  siteId: string,
  rows: CredentialCipherRow[],
  testedAt: string,
): Promise<CheckOutcome> {
  if (rows.length === 0) {
    return {
      kind: "credential",
      ok: true,
      blocking: false,
      detail: { configured: false, verified: [] },
      summary: "未設定憑證（v1 手動站可略）",
    };
  }

  // vault 密鑰沒設好時不去改 status，避免把有效憑證誤標成 invalid
  if (!vaultConfigured()) {
    return {
      kind: "credential",
      ok: false,
      blocking: true,
      detail: { configured: true, error: "vault_not_configured" },
      summary: "伺服器未設定 CONTENT_VAULT_KEY，無法驗證憑證（請先設 secrets 後重測）",
    };
  }

  const verified: string[] = [];
  const failed: string[] = [];
  const expired: string[] = [];
  const now = Date.now();

  for (const row of rows) {
    const ok = await verifyCredentialCiphertext(row.ciphertext);
    if (ok) verified.push(row.kind);
    else failed.push(row.kind);
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
    if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt < now) {
      expired.push(row.kind);
    }
  }

  const updates = await Promise.all(
    rows.map((row) =>
      db
        .from("content_site_credentials")
        .update({
          status: verified.includes(row.kind) ? "active" : "invalid",
          last_verified_at: testedAt,
        })
        .eq("site_id", siteId)
        .eq("kind", row.kind),
    ),
  );
  for (const { error } of updates) throwDb(error, "更新憑證驗證狀態失敗");

  const ok = failed.length === 0;
  return {
    kind: "credential",
    ok,
    blocking: true,
    detail: { configured: true, verified, failed, expired },
    summary: ok
      ? `已驗證 ${verified.length} 筆憑證可解密${expired.length ? `（${expired.join("、")} 已過期）` : ""}`
      : `憑證無法解密：${failed.join("、")}（請重新儲存）`,
  };
}

/** 健康判定：設定缺失=untested、domain/credential 失敗=down、只有 sitemap 失敗=degraded */
function resolveHealth(checks: CheckOutcome[]): ContentSiteHealth {
  const byKind = new Map(checks.map((check) => [check.kind, check]));
  const settingsOk = byKind.get("settings")?.ok ?? false;
  const domainOk = byKind.get("domain")?.ok ?? false;
  const sitemapOk = byKind.get("sitemap")?.ok ?? false;
  const credentialOk = byKind.get("credential")?.ok ?? true;

  if (!settingsOk) return "untested";
  if (!domainOk || !credentialOk) return "down";
  if (!sitemapOk) return "degraded";
  return "ok";
}

async function handleTestConnection(
  body: Record<string, unknown>,
): Promise<ContentConnectionTestResult> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  const siteRow = await loadSiteRow(db, siteId);

  const [profile, sections, credentialRows] = await Promise.all([
    loadProfileRow(db, siteId),
    listSections(db, siteId),
    (async () => {
      const { data, error } = await db
        .from("content_site_credentials")
        .select("kind, ciphertext, expires_at")
        .eq("site_id", siteId);
      throwDb(error, "讀取憑證失敗");
      return (data ?? []) as CredentialCipherRow[];
    })(),
  ]);

  const testedAt = new Date().toISOString();
  const domainUrl = profile?.domain_url ?? null;

  // 依 PRD §9.1.2 的順序逐項檢查，每項都會寫一列 content_site_checks
  const checks: CheckOutcome[] = [];
  checks.push(checkSettings(siteRow, sections));
  const domainCheck = await checkDomain(domainUrl);
  checks.push(domainCheck);
  checks.push(await checkSitemap(domainUrl, domainCheck.ok));
  checks.push(await checkCredentials(db, siteId, credentialRows, testedAt));

  const health = resolveHealth(checks);

  const { error: updateError } = await db
    .from("content_sites")
    .update({ health, last_verified_at: testedAt })
    .eq("website_profile_id", siteId);
  throwDb(updateError, "更新站點健康狀態失敗");

  const { error: insertError } = await db.from("content_site_checks").insert(
    checks.map((check) => ({
      site_id: siteId,
      checked_at: testedAt,
      kind: check.kind,
      ok: check.ok,
      detail: check.detail,
    })),
  );
  throwDb(insertError, "寫入健康檢查紀錄失敗");

  return { health, checks: checks.map(toCheckResult), testedAt };
}

// ============================================================
// 動作：list_site_candidates（接線精靈選站；webandsystem_list + 已接入標記）
// ============================================================

interface SiteCandidate {
  id: string;
  website_name: string;
  domain_url: string | null;
  platform: string | null;
  brand: string | null;
  level: number | null;
  connected: boolean;
}

/** PostgREST or() 的過濾字串用逗號/括號分段，使用者輸入需先清掉這些語法字元 */
function sanitizeFilterValue(value: string): string {
  return value.replace(/[,()%"\\*]/g, "").trim();
}

async function handleListSiteCandidates(
  body: Record<string, unknown>,
): Promise<SiteCandidate[]> {
  const db = serviceClient();
  const query = asTrimmedString(body.query)?.slice(0, 80) ?? null;

  const base = db.from("webandsystem_list").select(PROFILE_COLUMNS);
  const needle = query ? sanitizeFilterValue(query) : "";
  const filtered =
    needle.length > 0
      ? base.or(`website_name.ilike.%${needle}%,domain_url.ilike.%${needle}%`)
      : base;

  const { data, error } = await filtered
    .order("level", { ascending: true })
    .order("website_name", { ascending: true })
    .limit(CANDIDATE_LIMIT);
  throwDb(error, "讀取站點主檔失敗");

  const rows = (data ?? []) as ProfileRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const connected = new Set<string>();
  for (const batch of chunk(ids, 100)) {
    const { data: connectedRows, error: connectedError } = await db
      .from("content_sites")
      .select("website_profile_id")
      .in("website_profile_id", batch);
    throwDb(connectedError, "讀取已接入站點失敗");
    for (const row of (connectedRows ?? []) as { website_profile_id: string }[]) {
      connected.add(row.website_profile_id);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    website_name: row.website_name,
    domain_url: row.domain_url ?? null,
    platform: row.platform ?? null,
    brand: row.brand ?? null,
    level: row.level == null ? null : Number(row.level),
    connected: connected.has(row.id),
  }));
}

// ============================================================
// 入口
// ============================================================

type ActionHandler = (body: Record<string, unknown>) => Promise<unknown>;

const ACTION_HANDLERS: Record<string, ActionHandler> = {
  list: () => handleList(),
  get: handleGet,
  upsert_settings: handleUpsertSettings,
  set_status: handleSetStatus,
  remove_site: handleRemoveSite,
  list_sections: handleListSections,
  upsert_section: handleUpsertSection,
  delete_section: handleDeleteSection,
  save_credential: handleSaveCredential,
  clear_credential: handleClearCredential,
  test_connection: handleTestConnection,
  list_site_candidates: handleListSiteCandidates,
};

function readAction(body: Record<string, unknown>): string {
  const action = asTrimmedString(body.action);
  if (!action) fail(400, "unknown_action", "缺少 action");
  return action;
}

Deno.serve(async (req: Request) => {
  const methodGuard = guardMethod(req);
  if (methodGuard) return methodGuard;

  try {
    const actorResult = await requireActor(req);
    if (actorResult.response) return actorResult.response;
    const actor = actorResult.actor;
    if (!actor) return failJson(401, "invalid_session", "Invalid session");

    const body = await readBody<Record<string, unknown>>(req);
    const action = readAction(body);
    const handler = ACTION_HANDLERS[action];
    if (!handler) return failJson(400, "unknown_action", `未知的動作：${action}`);

    // PRD §11：每次寫入前重算角色權限，不信任前端
    const denied = requireAction(actor, VIEW_ACTIONS.has(action) ? "view" : "manage_sites");
    if (denied) return denied;

    const data = await handler(body);
    return okJson(data);
  } catch (error) {
    if (error instanceof ContentHttpError) {
      return failJson(error.status, error.code, error.message, error.details);
    }
    console.error("[content-sites] unhandled error:", error);
    return failJson(500, "internal_error", "處理請求時發生未預期的錯誤");
  }
});
