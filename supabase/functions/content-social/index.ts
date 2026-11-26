import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import JSZip from "npm:jszip@3.10.1";
import {
  actorUserId,
  dbError,
  failJson,
  guardMethod,
  okJson,
  readBody,
  requireAction,
  requireActor,
  requireServiceRole,
  serviceClient,
  type ContentActor,
} from "../_shared/contentAuth.ts";
import { renderMarkdownToHtml } from "../../../src/lib/contentGenerate.ts";
import { estimateLlmCostUsd } from "../../../src/lib/contentFormat.ts";
// 匯入熱點的去重鍵與熱度：與 content-sources／看板共用同一套純函式（PRD §10）
import {
  contentFingerprint,
  dedupeKey,
  heatScore,
  normalizeBody,
  pickCanonicalPost,
} from "../../../src/lib/contentSocialDedupe.ts";
// 事件聚簇：召回門檻與 AIHOT 一致，判斷「同一件事」的精度靠這幾個純函式把關
import {
  duplicateVerdict,
  findSimilarEvents,
} from "../../../src/lib/contentSocialCluster.ts";
import {
  composeLongform,
  composeSocial,
  nextPublishAtHkt,
  platformOrder,
  socialPlatformLabel,
  type ComposedLongform,
} from "../../../src/lib/contentSocialGenerate.ts";
import {
  composeWithGrok,
  grokConfigured,
  grokModel,
  judgeEventRelation,
  listGrokModels,
  SAME_EVENT_MIN_CONFIDENCE,
  SAME_EVENT_RELATIONS,
  type SocialLlmResult,
} from "../_shared/contentSocialLlm.ts";
import {
  ContentVaultError,
  sealCredential,
  unsealCredential,
  vaultConfigured,
} from "../_shared/contentVault.ts";
import {
  SOCIAL_OAUTH_PROVIDERS,
  isAllowedSocialOAuthOrigin,
  oauthProviderForPlatform,
  socialOAuthRedirectUri,
  type SocialOAuthProvider,
} from "../../../src/lib/contentSocialOAuth.ts";
import { CANONICAL_SITE_URL } from "../../../src/lib/siteUrl.ts";
import {
  CONTENT_NOT_ENABLED_MESSAGE,
  type ContentAction,
} from "../../../src/lib/contentTypes.ts";

/**
 * content-social｜社媒自動營運（熱點 → 1 篇長文 + 每個帳號一條導流；同一事件不重複生成）
 *
 * 這一版把最小鏈路打通：熱點 → 產稿 → 審核 → 排期／標記已發，並自動推進。
 * 文案預設用 **Grok（xAI）** 生成；沒有 key、超時或格式錯誤時自動退回模板，
 * 所以「模型壞了」不會讓整條自動化停擺（稿件會標 generator 區分來源）。
 *
 * actions（全部 POST JSON body；回應一律 { ok, data } / { ok:false, code, error }）：
 *   list          view     今日看板：統計 + 熱點 + 稿件（含各帳號導流）+ 組 + 帳號
 *   create_event  write    貼一個熱點 → 立即產 1 篇長文 + 每個帳號一條導流（同一件事不重複建）
 *   generate_now  write    對指定熱點補產／補導流（是同一件事就併進既有事件）
 *   review        approve  decision=approve → approved + scheduled_at；decision=reject → changes_requested
 *   mark          write    標記某條導流（或整批）已發佈，並自動推進稿件狀態
 *   auto_tick     service  cron 每 2 分鐘：推進到期稿件 + 自動掃描 7 天內新熱點產稿
 *   dedupe_cleanup service 維運：清理已生成的重複（事件合併 + 同事件多稿收斂；可重跑）
 *   import_events write    熱點匯入（≤200 列；dedupeKey + 文字近似去重，逐列回報錯誤）— M4-04
 *   update_post   approve  工作室改標題／正文（重算 body_html 與去重指紋）— M4-07
 *   update_target write    改單一帳號的導流文案 — M4-07
 *   schedule_post approve  日曆排期／取消排期（approved ⇄ scheduled）— M4-08
 *   social_package approve 手動發佈包 zip + 1 小時下載連結 — M4-09
 *
 * 業務規則（對應 PRD §10、migration 20261126120000；2026-11-26 去重改動）：
 *   - **一個熱點只有一篇稿**（DB 唯一索引 event_id）；品牌組只是「誰會收到」的名單
 *   - 產稿前先跟最近 14 天的熱點比對，是同一件事就併進既有事件，不再產第二篇
 *   - 同一帳號同時在多組 → 只收一條導流（targets 以 (post_id, account_id) 唯一）
 *   - 同平台多帳號共用同一份導流文案（不重複生成）
 *   - 熱點至少產出一篇 → status 轉 used（不再被自動掃描重複處理）
 *
 * 身分與權限：
 *   - 入口 guardMethod → requireActor；每個 action 再 requireAction 重算角色（PRD §11）
 *   - auto_tick 額外用 requireServiceRole 把關（cron 以 ?action=auto_tick 觸發）
 *   - 讀寫一律走 serviceClient()（避開 RLS 變數），但一定先驗 actor
 */

type Db = ReturnType<typeof serviceClient>;

// ============================================================
// 常數
// ============================================================

const EVENT_LIST_LIMIT = 30;
const POST_LIST_LIMIT = 50;
/** 列表 API 的可調上限：待審積壓時前端可要求更多，避免看板被截斷 */
const MAX_EVENT_LIST_LIMIT = 200;
const MAX_POST_LIST_LIMIT = 300;

function clampLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}
const AUTO_SCAN_LIMIT = 20;
const AUTO_TICK_EVENT_LIMIT = 3;
const AUTO_EVENT_WINDOW_DAYS = 7;
const CHUNK_SIZE = 100;

const MIN_TITLE_LENGTH = 2;
const MAX_TITLE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 1_000;
const MAX_URL_LENGTH = 2_000;

/** 匯入熱點（M4-04）：CSV 一次貼一批，200 列足夠一輪匯入，也讓逐列查重不會拖慢請求 */
const IMPORT_EVENT_LIMIT = 200;
/** 匯入標題上限獨立於 create_event（200）：CSV 常見一行一標題，120 字已足夠且避免髒資料 */
const MAX_IMPORT_TITLE_LENGTH = 120;
/** dedupe_key 內含正規化 URL，可能很長；每批 in(...) 只帶 20 筆，避免 PostgREST 查詢字串過長 */
const IMPORT_DEDUPE_CHUNK_SIZE = 20;

/**
 * 匯入熱點的熱度：用共用公式（來源分級 2、剛抓到 ageHours=0）算出「可預期」的值，
 * 同批匯入熱度一致（同時段的排序再按 created_at 決定）。
 * heat 是 integer 欄位，四捨五入；人工貼的熱點走 manualHeat（60–90），語義不同。
 */
const IMPORT_EVENT_HEAT = Math.round(heatScore(2, 0));

/** 工作室編輯（M4-07）：與 UI 輸入限制一致，後端仍是最後一道 */
const MAX_POST_TITLE_LENGTH = 120;
const MAX_POST_BODY_LENGTH = 20_000;
const MAX_TARGET_COPY_LENGTH = 5_000;

/** 可排期（日曆拖動／取消排期，M4-08）的稿件狀態：批准後、已排期（改時間） */
const SCHEDULABLE_STATUSES: ReadonlySet<string> = new Set(["approved", "scheduled"]);

/** 手動發佈包（M4-09）：Storage bucket／路徑前綴／簽名連結有效期 */
const STORAGE_BUCKET = "content-assets";
const SOCIAL_PACKAGE_PREFIX = "social-packages";
const SIGNED_URL_TTL_SECONDS = 3_600;
const PACKAGE_SLUG_LENGTH = 20;
const PACKAGE_SLUG_FALLBACK_LENGTH = 8;

/** 可審核（批准／退回）的稿件狀態：只有待審與「退回待改」 */
const REVIEWABLE_STATUSES: ReadonlySet<string> = new Set(["pending_review", "changes_requested"]);

/**
 * 已批准／已排程／發佈中 都算「待發佈」。
 * publishing 是 tick 推進後的狀態（還沒真的貼出去），若不算進來，
 * 每 2 分鐘的 tick 會讓看板的「待發佈」數字莫名歸零。
 */
const READY_STATUSES: readonly string[] = ["approved", "scheduled", "publishing"];
const READY_STATUS_SET: ReadonlySet<string> = new Set(READY_STATUSES);

/** 建熱點卻沒有任何可產稿的組／帳號時的回應（第一次使用最常撞到，訊息要說真話） */
const NO_ACCOUNTS_MESSAGE = "請先建立品牌組與社群帳號";

const SERVICE_ACTIONS = new Set(["auto_tick", "llm_check", "dedupe_cleanup"]);

/** 自動營運總開關（存在 content_settings.feature_flags.social_autopilot；缺省＝開啟） */
const AUTOPILOT_FLAG = "social_autopilot";

interface AutopilotStatus {
  enabled: boolean;
  updatedAt: string | null;
}

async function loadAutopilot(db: Db): Promise<AutopilotStatus> {
  const { data, error } = await db
    .from("content_settings")
    .select("feature_flags, updated_at")
    .eq("id", "default")
    .maybeSingle();
  if (error) throwDb(error, "讀取自動營運設定失敗");
  const flags = (data?.feature_flags ?? {}) as Record<string, unknown>;
  return {
    enabled: flags[AUTOPILOT_FLAG] !== false,
    updatedAt: (data as { updated_at?: string } | null)?.updated_at ?? null,
  };
}

async function saveAutopilot(db: Db, enabled: boolean): Promise<AutopilotStatus> {
  const { data, error } = await db
    .from("content_settings")
    .select("feature_flags")
    .eq("id", "default")
    .maybeSingle();
  if (error) throwDb(error, "讀取自動營運設定失敗");
  const flags = {
    ...((data?.feature_flags ?? {}) as Record<string, unknown>),
    [AUTOPILOT_FLAG]: enabled,
  };
  const { data: updated, error: updateError } = await db
    .from("content_settings")
    .update({ feature_flags: flags })
    .eq("id", "default")
    .select("feature_flags, updated_at")
    .maybeSingle();
  if (updateError) throwDb(updateError, "更新自動營運設定失敗");
  const nextFlags = (updated?.feature_flags ?? flags) as Record<string, unknown>;
  return {
    enabled: nextFlags[AUTOPILOT_FLAG] !== false,
    updatedAt: (updated as { updated_at?: string } | null)?.updated_at ?? null,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 資料表／欄位未建立（部署順序顛倒）時，回契約認得的 code 讓前端顯示「功能尚未啟用」 */
const SCHEMA_MISSING_CODES: ReadonlySet<string> = new Set(["42P01", "PGRST205", "PGRST204"]);

// ============================================================
// HTTP 錯誤（handler 內直接 throw，由入口統一轉成 failJson）
// ============================================================

class SocialHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "SocialHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new SocialHttpError(status, code, message, details);
}

interface DbErrorShape {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/** 統一的 DB 錯誤出口：資料表未建 → 503；其餘 → 500（不得拋未捕捉） */
function throwDb(error: DbErrorShape | null, context: string): void {
  if (!error) return;
  const code = String(error.code ?? "");
  if (SCHEMA_MISSING_CODES.has(code)) {
    fail(503, code, CONTENT_NOT_ENABLED_MESSAGE);
  }
  fail(500, "db_error", `${context}：${dbError(error)}`, code ? { code } : undefined);
}

function isUniqueViolation(error: unknown): boolean {
  return String((error as { code?: string } | null)?.code ?? "") === "23505";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "未知錯誤");
}

// ============================================================
// 輸入正規化
// ============================================================

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function requireUuid(value: unknown, code: string, message: string): string {
  const text = asTrimmedString(value);
  if (!text || !UUID_PATTERN.test(text)) fail(400, code, message);
  return text;
}

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    return Boolean(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** url 可空；有值就必須是可點的 http(s) 連結，避免把亂碼寫進 published_url */
function parseOptionalHttpUrl(value: unknown): string | null {
  const text = asTrimmedString(value);
  if (!text) return null;
  if (text.length > MAX_URL_LENGTH) {
    fail(400, "invalid_url", `連結不可超過 ${MAX_URL_LENGTH} 字元`);
  }
  if (!isHttpUrl(text)) fail(400, "invalid_url", "連結必須是 http(s) 開頭");
  return text;
}

function parseOptionalDateTime(value: unknown, field: string, code: string): string | null {
  const text = asTrimmedString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) fail(400, code, `${field} 不是有效的時間`);
  return date.toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 香港時間的「今天 00:00」對應的 UTC 時間（HKT 固定 UTC+8，無夏令時間）。
 * 今日已發佈的統計一律以 HKT 日界為準，避免 UTC 跨日讓數字在晚上 8 點跳掉。
 */
function hktDayStartIso(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? "01";
  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  return new Date(Date.UTC(year, month - 1, day, -8, 0, 0)).toISOString();
}

/** PostgREST 的 in.(...) 走 URL query，分批避免超長 URL */
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

// ============================================================
// 資料列型別（DB → 函式內部）
// ============================================================

interface HotEventRow {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
  heat: number | null;
  source: string | null;
  status: string;
  created_at: string;
  duplicate_of?: string | null;
}

interface SocialGroupRow {
  id: string;
  name: string;
  archived: boolean | null;
}

interface SocialAccountRow {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  login_status: string | null;
  archived: boolean | null;
}

interface SocialMemberRow {
  group_id: string;
  account_id: string;
}

interface SocialPostRow {
  id: string;
  event_id: string | null;
  group_id: string | null;
  title: string | null;
  body_md: string | null;
  status: string;
  scheduled_at: string | null;
  approved_at: string | null;
  created_at: string;
  generator?: string | null;
  cover_asset_id?: string | null;
  /** 輸出層去重指紋（migration 20261127140000 新增；未推時為 undefined） */
  content_fingerprint?: string | null;
}

interface SocialTargetRow {
  id: string;
  post_id: string;
  account_id: string;
  copy_text: string | null;
  status: string;
  published_url: string | null;
  published_at: string | null;
}

// ============================================================
// 回應型別（對外契約）
// ============================================================

interface SocialStats {
  openEvents: number;
  pendingReview: number;
  readyToPublish: number;
  publishedToday: number;
  accounts: number;
  groups: number;
}

interface SocialEventView {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
  heat: number;
  source: string;
  status: string;
  created_at: string;
  post_count: number;
}

interface SocialTargetView {
  id: string;
  account_id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  copy_text: string;
  status: string;
  published_url: string | null;
  published_at: string | null;
}

interface SocialPostView {
  id: string;
  event_id: string | null;
  group_id: string | null;
  group_name: string | null;
  event_title: string | null;
  title: string;
  body_md: string;
  status: string;
  scheduled_at: string | null;
  approved_at: string | null;
  created_at: string;
  /** template｜grok：讓 UI 誠實標示這篇是 AI 還是模板 */
  generator: string;
  targets: SocialTargetView[];
}

interface SocialGroupView {
  id: string;
  name: string;
  account_count: number;
}

interface SocialAccountView {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  login_status: string;
  archived: boolean;
}

interface SocialOverview {
  stats: SocialStats;
  events: SocialEventView[];
  posts: SocialPostView[];
  groups: SocialGroupView[];
  accounts: SocialAccountView[];
}

/** 一組品牌組 + 可用帳號（產稿的唯一輸入） */
interface GroupWithAccounts {
  group: SocialGroupRow;
  accounts: SocialAccountRow[];
}

// ============================================================
// 排序：平台固定順序，再按 handle
// ============================================================

function sortAccounts(accounts: SocialAccountRow[]): SocialAccountRow[] {
  return [...accounts].sort((left, right) => {
    const byPlatform = platformOrder(left.platform) - platformOrder(right.platform);
    if (byPlatform !== 0) return byPlatform;
    const byHandle = left.handle.localeCompare(right.handle, "en");
    if (byHandle !== 0) return byHandle;
    return left.id.localeCompare(right.id);
  });
}

function sortTargetViews(views: SocialTargetView[]): SocialTargetView[] {
  return [...views].sort((left, right) => {
    const byPlatform = platformOrder(left.platform) - platformOrder(right.platform);
    if (byPlatform !== 0) return byPlatform;
    const byHandle = left.handle.localeCompare(right.handle, "en");
    if (byHandle !== 0) return byHandle;
    return left.id.localeCompare(right.id);
  });
}

// ============================================================
// DB → 回應型別
// ============================================================

function toEventView(row: HotEventRow, postCount: number): SocialEventView {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? null,
    url: row.url ?? null,
    heat: Number(row.heat ?? 0),
    source: row.source ?? "manual",
    status: row.status,
    created_at: row.created_at,
    post_count: postCount,
  };
}

function toAccountView(row: SocialAccountRow): SocialAccountView {
  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    display_name: row.display_name ?? null,
    login_status: row.login_status ?? "unknown",
    archived: Boolean(row.archived),
  };
}

/** 導流目標：平台／帳號資料一律由帳號表補上（targets 只存 copy 與狀態） */
function toTargetView(
  row: SocialTargetRow,
  accountsById: Map<string, SocialAccountRow>,
): SocialTargetView {
  const account = accountsById.get(row.account_id) ?? null;
  return {
    id: row.id,
    account_id: row.account_id,
    platform: account?.platform ?? "other",
    handle: account?.handle ?? "",
    display_name: account?.display_name ?? null,
    copy_text: row.copy_text ?? "",
    status: row.status,
    published_url: row.published_url ?? null,
    published_at: row.published_at ?? null,
  };
}

function toPostView(
  post: SocialPostRow,
  groupsById: Map<string, SocialGroupRow>,
  eventsById: Map<string, HotEventRow>,
  accountsById: Map<string, SocialAccountRow>,
  targetRows: SocialTargetRow[],
): SocialPostView {
  return {
    id: post.id,
    event_id: post.event_id ?? null,
    group_id: post.group_id ?? null,
    group_name: post.group_id ? groupsById.get(post.group_id)?.name ?? null : null,
    event_title: post.event_id ? eventsById.get(post.event_id)?.title ?? null : null,
    title: post.title ?? "",
    body_md: post.body_md ?? "",
    status: post.status,
    scheduled_at: post.scheduled_at ?? null,
    approved_at: post.approved_at ?? null,
    created_at: post.created_at,
    generator: post.generator ?? "template",
    targets: sortTargetViews(
      targetRows.map((row) => toTargetView(row, accountsById)),
    ),
  };
}

// ============================================================
// DB 讀取小工具
// ============================================================

const HOT_EVENT_COLUMNS = "id, title, summary, url, heat, source, status, created_at";
const POST_COLUMNS =
  "id, event_id, group_id, title, body_md, status, scheduled_at, approved_at, created_at, generator, cover_asset_id";
const GROUP_COLUMNS = "id, name, archived";
const ACCOUNT_COLUMNS =
  "id, platform, handle, display_name, login_status, archived, " +
  "credential_status, credential_kind, credential_expires_at, credential_fingerprint, credential_updated_at";

async function listHotEvents(db: Db, limit = EVENT_LIST_LIMIT): Promise<HotEventRow[]> {
  const { data, error } = await db
    .from("content_hot_events")
    .select(HOT_EVENT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwDb(error, "讀取熱點失敗");
  return (data ?? []) as HotEventRow[];
}

async function listSocialPosts(db: Db, limit = POST_LIST_LIMIT): Promise<SocialPostRow[]> {
  const { data, error } = await db
    .from("content_social_posts")
    // 刻意不取 body_html：列表只需要 Markdown 原文，少搬一份 HTML 讓看板更快
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwDb(error, "讀取社媒稿失敗");
  return (data ?? []) as SocialPostRow[];
}

async function listSocialGroups(db: Db): Promise<SocialGroupRow[]> {
  const { data, error } = await db
    .from("content_social_groups")
    .select(GROUP_COLUMNS)
    .order("name", { ascending: true });
  throwDb(error, "讀取品牌組失敗");
  return (data ?? []) as SocialGroupRow[];
}

async function listSocialAccounts(db: Db): Promise<SocialAccountRow[]> {
  const { data, error } = await db.from("content_social_accounts").select(ACCOUNT_COLUMNS);
  throwDb(error, "讀取社群帳號失敗");
  return (data ?? []) as SocialAccountRow[];
}

async function loadGroupMap(db: Db): Promise<Map<string, SocialGroupRow>> {
  const groups = await listSocialGroups(db);
  return new Map(groups.map((group): [string, SocialGroupRow] => [group.id, group]));
}

async function loadAccountMap(db: Db): Promise<Map<string, SocialAccountRow>> {
  // v0 帳號量少（個位數～數十），整表讀取最省事；M4 再改以 view / RPC 聚合
  const accounts = await listSocialAccounts(db);
  return new Map(
    accounts.map((account): [string, SocialAccountRow] => [account.id, account]),
  );
}

async function loadEventMap(db: Db, eventIds: string[]): Promise<Map<string, HotEventRow>> {
  const map = new Map<string, HotEventRow>();
  const ids = [...new Set(eventIds)];
  for (const batch of chunk(ids, CHUNK_SIZE)) {
    const { data, error } = await db
      .from("content_hot_events")
      .select(HOT_EVENT_COLUMNS)
      .in("id", batch);
    throwDb(error, "讀取熱點失敗");
    for (const row of (data ?? []) as HotEventRow[]) map.set(row.id, row);
  }
  return map;
}

async function fetchHotEventRow(db: Db, eventId: string): Promise<HotEventRow | null> {
  const { data, error } = await db
    .from("content_hot_events")
    .select(HOT_EVENT_COLUMNS)
    .eq("id", eventId)
    .maybeSingle();
  throwDb(error, "讀取熱點失敗");
  return (data as HotEventRow | null) ?? null;
}

async function fetchPostRow(db: Db, postId: string): Promise<SocialPostRow | null> {
  const { data, error } = await db
    .from("content_social_posts")
    .select(POST_COLUMNS)
    .eq("id", postId)
    .maybeSingle();
  throwDb(error, "讀取社媒稿失敗");
  return (data as SocialPostRow | null) ?? null;
}

/** 一次查多張稿件底下的導流目標，回傳 post_id → rows */
async function loadTargetsByPost(
  db: Db,
  postIds: string[],
): Promise<Map<string, SocialTargetRow[]>> {
  const map = new Map<string, SocialTargetRow[]>();
  for (const batch of chunk([...new Set(postIds)], CHUNK_SIZE)) {
    const { data, error } = await db
      .from("content_social_targets")
      .select("*")
      .in("post_id", batch);
    throwDb(error, "讀取導流目標失敗");
    for (const row of (data ?? []) as SocialTargetRow[]) {
      const list = map.get(row.post_id) ?? [];
      list.push(row);
      map.set(row.post_id, list);
    }
  }
  return map;
}

/** 用「整表 maps + targets」補齊單／多張稿件（review / mark 回傳用） */
async function hydratePosts(db: Db, posts: SocialPostRow[]): Promise<SocialPostView[]> {
  if (posts.length === 0) return [];
  const eventIds = posts.map((post) => post.event_id).filter(isNonEmptyString);
  const [groupsById, accountsById, eventsById, targetsByPost] = await Promise.all([
    loadGroupMap(db),
    loadAccountMap(db),
    loadEventMap(db, eventIds),
    loadTargetsByPost(
      db,
      posts.map((post) => post.id),
    ),
  ]);
  return posts.map((post) =>
    toPostView(post, groupsById, eventsById, accountsById, targetsByPost.get(post.id) ?? []),
  );
}

// ============================================================
// 統計（PostgREST 沒有 group by，一律用 count 或另查後在記憶體組）
// ============================================================

async function countOpenEvents(db: Db): Promise<number> {
  const { count, error } = await db
    .from("content_hot_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  throwDb(error, "統計待處理熱點失敗");
  return count ?? 0;
}

async function countPostsByStatus(db: Db, statuses: readonly string[]): Promise<number> {
  const { count, error } = await db
    .from("content_social_posts")
    .select("id", { count: "exact", head: true })
    .in("status", [...statuses]);
  throwDb(error, "統計稿件數量失敗");
  return count ?? 0;
}

/** 今日已發佈：published_at 落在 HKT 今天（只有 targets 有這個時間欄位） */
async function countPublishedTargetsSince(db: Db, sinceIso: string): Promise<number> {
  const { count, error } = await db
    .from("content_social_targets")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .gte("published_at", sinceIso);
  throwDb(error, "統計今日已發佈失敗");
  return count ?? 0;
}

async function countPostsByEvent(db: Db, eventIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const batch of chunk([...new Set(eventIds)], CHUNK_SIZE)) {
    const { data, error } = await db
      .from("content_social_posts")
      .select("event_id")
      .in("event_id", batch);
    throwDb(error, "統計熱點批次數失敗");
    for (const row of (data ?? []) as { event_id: string | null }[]) {
      if (!row.event_id) continue;
      counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
    }
  }
  return counts;
}

/** 每組「未歸檔帳號」數：與自動產稿的可用性判定保持一致 */
async function countAccountsByGroup(
  db: Db,
  groupIds: string[],
  accountsById: Map<string, SocialAccountRow>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const batch of chunk([...new Set(groupIds)], CHUNK_SIZE)) {
    const { data, error } = await db
      .from("content_social_group_members")
      .select("group_id, account_id")
      .in("group_id", batch);
    throwDb(error, "統計組內帳號失敗");
    for (const row of (data ?? []) as SocialMemberRow[]) {
      const account = accountsById.get(row.account_id);
      if (!account || account.archived) continue;
      counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
    }
  }
  return counts;
}

// ============================================================
// 可用名單：active 組 × 未歸檔帳號
// ============================================================

async function loadRoster(db: Db): Promise<GroupWithAccounts[]> {
  const [groupsResult, membersResult, accountsResult] = await Promise.all([
    db
      .from("content_social_groups")
      .select(GROUP_COLUMNS)
      .eq("archived", false)
      .order("name", { ascending: true }),
    db.from("content_social_group_members").select("group_id, account_id"),
    db
      .from("content_social_accounts")
      .select(ACCOUNT_COLUMNS)
      .eq("archived", false),
  ]);
  throwDb(groupsResult.error, "讀取品牌組失敗");
  throwDb(membersResult.error, "讀取品牌組成員失敗");
  throwDb(accountsResult.error, "讀取社群帳號失敗");

  const groups = (groupsResult.data ?? []) as SocialGroupRow[];
  const accountsById = new Map(
    ((accountsResult.data ?? []) as SocialAccountRow[]).map(
      (account): [string, SocialAccountRow] => [account.id, account],
    ),
  );

  const accountsByGroup = new Map<string, SocialAccountRow[]>();
  for (const member of (membersResult.data ?? []) as SocialMemberRow[]) {
    const account = accountsById.get(member.account_id);
    // 已歸檔帳號不參與產稿（名單本身就只查未歸檔，這裡再守一次）
    if (!account) continue;
    const list = accountsByGroup.get(member.group_id) ?? [];
    list.push(account);
    accountsByGroup.set(member.group_id, list);
  }

  return groups.map((group) => ({
    group,
    // 帳號順序穩定：平台固定順序 → handle，讓 targets 的插入與顯示每次都一樣
    accounts: sortAccounts(accountsByGroup.get(group.id) ?? []),
  }));
}

// ============================================================
// generateForEvent：熱點 → 「1 篇長文 + 每個帳號一條導流」
// ============================================================

/**
 * 為單一熱點產出**一篇**長文，並為所有可用帳號各建一條導流。
 *
 * 2026-11-26 去重改動（對應 docs/content-dedupe.md）：
 *   以前是「每組一篇」：兩個品牌組 = 兩篇幾乎一樣的稿，同一帳號（同時在多組）
 *   甚至會收到兩份。現在**一個事件只有一篇稿**，品牌組只是「誰會收到」的名單：
 *     - 事件已有稿 → 只補缺的導流（之後新加的帳號也會補到），不會再產第二篇
 *     - 事件還沒有稿 → 只呼叫一次模型（成本同時由 N 次降到 1 次）
 *     - 歷史遺留的同事件多稿 → 搬走導流後刪掉多餘的稿
 *
 * 回傳「本次新建」的稿件；既有稿件不回傳（維持原本 API 語義）。
 */
async function generateForEvent(
  db: Db,
  event: HotEventRow,
  roster?: GroupWithAccounts[],
): Promise<SocialPostView[]> {
  const groupsWithAccounts = roster ?? (await loadRoster(db));
  const eligible = groupsWithAccounts.filter((entry) => entry.accounts.length > 0);
  // 沒有可用的組／帳號就不產（呼叫端負責回 400 no_accounts）
  if (eligible.length === 0) return [];

  const groupNames = eligible.map((entry) => entry.group.name);

  // 1) 已有稿件：只補導流，不再產稿（這是「同事件永不重複」的主閘門）
  const existing = await loadEventPostsWithTargetCount(db, event.id);
  if (existing.length > 0) {
    const canonical = pickCanonicalPost(existing);
    if (!canonical) return [];
    for (const post of existing) {
      if (post.id === canonical.id) continue;
      await absorbDuplicatePost(db, canonical.id, post.id);
    }
    await ensureTargetsForEvent(db, canonical, eligible, event, groupNames);
    // 至少有一篇稿 → 熱點標 used（與原本語義一致）
    await markEventUsed(db, event);
    return [];
  }

  // 2) 第一次產稿：整件事只呼叫一次模型、只寫一篇稿
  const accounts = uniqueRosterAccounts(eligible);
  if (accounts.length === 0) return [];
  const platforms = [...new Set(accounts.map((account) => account.platform || "other"))];
  const llm = await tryComposeWithLlm(event, groupNames.join("、"), platforms);
  const longform =
    llm?.longform ??
    composeLongform({
      eventTitle: event.title,
      eventSummary: event.summary,
      groupName: groupNames.join("、"),
    });
  const copiesByPlatform = llm ? new Map(Object.entries(llm.copies)) : undefined;

  const { data: postData, error: postError } = await db
    .from("content_social_posts")
    .insert({
      event_id: event.id,
      // 一篇稿服務所有品牌組，不再掛在單一組底下（UI 顯示「全品牌組」）
      group_id: null,
      title: longform.title,
      body_md: longform.body_md,
      // HTML 由共用渲染器產生，前端不用再解析 Markdown
      body_html: renderMarkdownToHtml(longform.body_md),
      // 一律先進待審：自動化只負責產稿，批准仍由真人決定
      status: "pending_review",
      // template｜grok：UI 會標示來源，模板 fallback 不會被誤認成 AI
      generator: llm ? "grok" : "template",
      // 輸出層指紋：日後稽核「同一內容有沒有被生成兩次」用
      content_fingerprint: contentFingerprint(longform.title, longform.body_md),
    })
    .select("*")
    .single();

  if (postError) {
    if (isUniqueViolation(postError)) {
      // 併發（tick 與手動同時跑）時撞唯一索引：視為已存在，補導流即可
      console.warn(`[content-social] 熱點 ${event.id} 已有稿件，改為補導流`);
      const concurrent = await loadEventPostsWithTargetCount(db, event.id);
      const canonical = pickCanonicalPost(concurrent);
      if (canonical) await ensureTargetsForEvent(db, canonical, eligible, event, groupNames);
      return [];
    }
    // content_fingerprint 的 migration 未推時，退回不帶指紋的插入，不讓整條產稿停擺
    if (SCHEMA_MISSING_CODES.has(String((postError as { code?: string }).code ?? ""))) {
      return insertPostWithoutFingerprint(db, event, longform, llm, eligible, groupNames);
    }
    throwDb(postError, "新增社媒稿失敗");
  }
  if (!postData) return [];

  const post = postData as SocialPostRow;
  const targetRows = await insertTargetsForAccounts(
    db,
    post.id,
    accounts,
    groupNames.join("、"),
    longform,
    event,
    copiesByPlatform,
  );

  // 用量與成本：只有真的呼叫 Grok 才記
  if (llm) await recordSocialUsage(db, post.id, llm.usage);

  // 只貼標題的熱點：用生成出的摘要回填，讓看板卡片有「標題 + 註釋」
  if (!event.summary) await fillEventSummary(db, event, longform.excerpt);

  await markEventUsed(db, event);

  const groupsById = new Map(
    groupsWithAccounts.map((entry): [string, SocialGroupRow] => [entry.group.id, entry.group]),
  );
  const accountsById = new Map(
    accounts.map((account): [string, SocialAccountRow] => [account.id, account]),
  );
  return [
    toPostView(post, groupsById, new Map([[event.id, event]]), accountsById, targetRows),
  ];
}

/**
 * 舊 schema（沒有 content_fingerprint）的退路：其餘流程完全相同，
 * 只是少寫一個指紋欄位。遷移上線後就不會再走到這裡。
 */
async function insertPostWithoutFingerprint(
  db: Db,
  event: HotEventRow,
  longform: ComposedLongform,
  llm: SocialLlmResult | null,
  eligible: GroupWithAccounts[],
  groupNames: string[],
): Promise<SocialPostView[]> {
  const accounts = uniqueRosterAccounts(eligible);
  const { data, error } = await db
    .from("content_social_posts")
    .insert({
      event_id: event.id,
      group_id: null,
      title: longform.title,
      body_md: longform.body_md,
      body_html: renderMarkdownToHtml(longform.body_md),
      status: "pending_review",
      generator: llm ? "grok" : "template",
    })
    .select("*")
    .single();
  if (error) {
    if (isUniqueViolation(error)) return [];
    throwDb(error, "新增社媒稿失敗");
  }
  if (!data) return [];
  const post = data as SocialPostRow;
  const targets = await insertTargetsForAccounts(
    db,
    post.id,
    accounts,
    groupNames.join("、"),
    longform,
    event,
    llm ? new Map(Object.entries(llm.copies)) : undefined,
  );
  if (llm) await recordSocialUsage(db, post.id, llm.usage);
  if (!event.summary) await fillEventSummary(db, event, longform.excerpt);
  await markEventUsed(db, event);
  const groupsById = new Map(
    eligible.map((entry): [string, SocialGroupRow] => [entry.group.id, entry.group]),
  );
  const accountsById = new Map(
    accounts.map((account): [string, SocialAccountRow] => [account.id, account]),
  );
  return [toPostView(post, groupsById, new Map([[event.id, event]]), accountsById, targets)];
}

/** 所有可用帳號去重（同一帳號同時在多組只留一份 → 只收一次文案） */
function uniqueRosterAccounts(eligible: GroupWithAccounts[]): SocialAccountRow[] {
  const map = new Map<string, SocialAccountRow>();
  for (const entry of eligible) {
    for (const account of entry.accounts) {
      if (!map.has(account.id)) map.set(account.id, account);
    }
  }
  return sortAccounts([...map.values()]);
}

/**
 * 嘗試用 Grok 產稿；任何失敗（沒有 key／超時／格式錯）都退回模板，
 * 讓自動化不會因為模型問題停擺。
 */
async function tryComposeWithLlm(
  event: HotEventRow,
  groupName: string,
  platforms: string[],
): Promise<SocialLlmResult | null> {
  if (!grokConfigured()) return null;
  try {
    return await composeWithGrok({
      eventTitle: event.title,
      eventSummary: event.summary,
      eventUrl: event.url,
      groupName,
      platforms,
      // grok-4.3 實測 60 秒內可完成；仍留 fallback，超時就退回模板
      timeoutMs: 60_000,
      maxTokens: 2_000,
    });
  } catch (error) {
    console.warn(`[content-social] Grok 生成失敗，退回模板：${errorMessage(error)}`);
    return null;
  }
}

/** 記錄一次社媒 LLM 用量（content_llm_usage 是通用表，use_case=social） */
async function recordSocialUsage(
  db: Db,
  postId: string,
  usage: { model: string; tokens_in: number; tokens_out: number },
): Promise<void> {
  const { error } = await db.from("content_llm_usage").insert({
    site_id: null,
    article_id: null,
    job_id: null,
    model: usage.model,
    use_case: "social",
    tokens_in: usage.tokens_in,
    tokens_out: usage.tokens_out,
    // 以公開牌價估算（Grok 4 系列：$3 in／$15 out per 1M tokens）；實際以 xAI 帳單為準
    cost_usd: estimateLlmCostUsd(usage.model, usage.tokens_in, usage.tokens_out),
  });
  if (error) {
    console.warn(`[content-social] 記錄 LLM 用量失敗（post ${postId}）：${dbError(error)}`);
  }
}

/** 熱點沒有摘要時，用生成內容的摘要回填（讓卡片有「標題 + 註釋」） */
async function fillEventSummary(
  db: Db,
  event: HotEventRow,
  excerpt: string | null | undefined,
): Promise<void> {
  const summary = (excerpt || "").trim().slice(0, 160);
  if (!summary) return;
  const { error } = await db.from("content_hot_events").update({ summary }).eq("id", event.id);
  if (error) {
    console.warn(`[content-social] 回填熱點摘要失敗（event ${event.id}）：${dbError(error)}`);
    return;
  }
  event.summary = summary;
}

/**
 * 逐帳號建立導流目標（同平台多帳號共用一份文案，第二個帳號直接拿快取）。
 * 傳入的是「去重後的全部帳號」，不是單一品牌組。
 */
async function insertTargetsForAccounts(
  db: Db,
  postId: string,
  accounts: SocialAccountRow[],
  groupName: string,
  longform: ComposedLongform,
  event: HotEventRow,
  copiesByPlatform?: Map<string, string>,
): Promise<SocialTargetRow[]> {
  const captionByPlatform = new Map<string, string>();
  const rows: SocialTargetRow[] = [];

  for (const account of accounts) {
    const platformKey = account.platform || "other";
    let caption = captionByPlatform.get(platformKey) ?? copiesByPlatform?.get(platformKey);
    if (caption === undefined) {
      caption = composeSocial({
        platform: platformKey,
        title: longform.title,
        excerpt: longform.excerpt,
        hashtags: longform.hashtags,
        // 熱點帶了原文連結就放進 CTA，導流才回得到站內
        link: event.url ?? null,
        groupName,
      }).caption;
      captionByPlatform.set(platformKey, caption);
    }

    const { data, error } = await db
      .from("content_social_targets")
      .insert({
        post_id: postId,
        account_id: account.id,
        copy_text: caption,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      if (isUniqueViolation(error)) continue; // (post_id, account_id) 已存在 → 跳過
      throwDb(error, "新增導流目標失敗");
    }
    if (data) rows.push(data as SocialTargetRow);
  }

  return rows;
}

/** 某個事件底下的稿件（含導流數）：去重與補導流都要看目前實況 */
async function loadEventPostsWithTargetCount(
  db: Db,
  eventId: string,
): Promise<(SocialPostRow & { target_count: number })[]> {
  const { data, error } = await db
    .from("content_social_posts")
    .select(POST_COLUMNS)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  throwDb(error, "讀取既有稿件失敗");
  const rows = (data ?? []) as SocialPostRow[];
  if (rows.length === 0) return [];
  const targets = await loadTargetsByPost(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, target_count: (targets.get(row.id) ?? []).length }));
}

/**
 * 事件已有稿時，為「還沒有導流」的帳號補上（新加入品牌組的帳號也能收到舊稿）。
 * 平台文案沿用既有稿的標題／摘要重新組，不再呼叫模型，成本為零。
 */
async function ensureTargetsForEvent(
  db: Db,
  post: SocialPostRow,
  eligible: GroupWithAccounts[],
  event: HotEventRow,
  groupNames: string[],
): Promise<void> {
  const accounts = uniqueRosterAccounts(eligible);
  if (accounts.length === 0) return;
  const existingTargets = await db
    .from("content_social_targets")
    .select("account_id")
    .eq("post_id", post.id);
  throwDb(existingTargets.error, "讀取既有導流失敗");
  const present = new Set(
    ((existingTargets.data ?? []) as { account_id: string }[]).map((row) => row.account_id),
  );
  const missing = accounts.filter((account) => !present.has(account.id));
  if (missing.length === 0) return;

  const excerpt =
    (post.body_md ? normalizeBody(post.body_md).slice(0, 120) : "") ||
    event.summary ||
    "";
  const longform: ComposedLongform = {
    title: post.title ?? event.title,
    excerpt,
    body_md: post.body_md ?? "",
    // 指紋／標籤不影響導流文案，這裡只需 hashtag 來源
    hashtags: [],
  };
  await insertTargetsForAccounts(db, post.id, missing, groupNames.join("、"), longform, event);
}

/** 把重複稿的導流搬到保留稿後刪除（同帳號只留一份） */
async function absorbDuplicatePost(db: Db, keeperPostId: string, loserPostId: string): Promise<void> {
  const { data, error } = await db
    .from("content_social_targets")
    .select("account_id, copy_text, status, published_url, published_at")
    .eq("post_id", loserPostId);
  if (error) {
    console.warn(`[content-social] 讀取重複稿導流失敗：${dbError(error)}`);
    return;
  }
  for (const row of (data ?? []) as {
    account_id: string;
    copy_text: string | null;
    status: string;
    published_url: string | null;
    published_at: string | null;
  }[]) {
    const { error: insertError } = await db.from("content_social_targets").insert({
      post_id: keeperPostId,
      account_id: row.account_id,
      copy_text: row.copy_text,
      status: row.status,
      published_url: row.published_url,
      published_at: row.published_at,
    });
    if (insertError && !isUniqueViolation(insertError)) {
      console.warn(`[content-social] 搬移導流失敗：${dbError(insertError)}`);
      continue;
    }
    // 同一帳號已在保留稿：已發佈狀態優先，不要把發佈紀錄留在被刪的稿上
    if (insertError && row.status === "published") {
      await db
        .from("content_social_targets")
        .update({
          status: "published",
          published_url: row.published_url,
          published_at: row.published_at,
        })
        .eq("post_id", keeperPostId)
        .eq("account_id", row.account_id)
        .neq("status", "published");
    }
  }
  const { error: deleteError } = await db
    .from("content_social_posts")
    .delete()
    .eq("id", loserPostId);
  if (deleteError) {
    console.warn(`[content-social] 刪除重複稿失敗：${dbError(deleteError)}`);
  }
}

async function markEventUsed(db: Db, event: HotEventRow): Promise<void> {
  if (event.status === "used") return;
  const { error } = await db
    .from("content_hot_events")
    .update({ status: "used" })
    .eq("id", event.id);
  if (error) {
    // 批次已建立；狀態更新失敗不該讓整批回滾，記 log 後繼續（下次 tick 會再處理）
    console.warn(`[content-social] 更新熱點狀態失敗（event ${event.id}）：${dbError(error)}`);
    return;
  }
  event.status = "used";
}

/** 手動熱點的熱度：由標題＋摘要長度推導 60–90 的可預期值（同輸入永遠同結果） */
function manualHeat(title: string, summary: string | null): number {
  const seed = title.length + (summary?.length ?? 0);
  return 60 + (seed % 31);
}

// ============================================================
// 產稿前的事件去重（AIHOT 式：召回 → 模型判斷 → 寫入前覆核）
//
// 三層防線，缺一不可：
//   1. 抓取層：content-sources 抓 RSS 時就去重／聚簇（同一則新聞只進一次）
//   2. 產稿前：這裡再對「最近 14 天的熱點」召回一次（手動貼、CSV 匯入、
//      來源沒聚好的漏網之魚都在這一層擋掉），確認重複就把新事件併進既有事件，
//      **不會**再產出第二篇稿
//   3. 產稿時：一個事件只有一篇稿，品牌組只是收件名單（見 generateForEvent）
//
// 門檻用本專案真實資料校準（docs/content-dedupe.md）：
//   ≥ 0.66 直接視為同一事件；0.32–0.66 交給模型；模型信心 < 0.9 再覆核一次。
// ============================================================

/** 只跟最近 14 天的熱點比對（與 RSS 抓取窗口一致，避免跟半年前舊聞誤合併） */
const DEDUPE_WINDOW_DAYS = 14;
const DEDUPE_EVENT_LIMIT = 300;
/** 一次 tick／一次匯入最多問模型幾次；用完就保守當成新事件，下一輪再判斷 */
const DEDUPE_LLM_BUDGET_TICK = 2;
const DEDUPE_LLM_BUDGET_IMPORT = 4;
const DEDUPE_LLM_BUDGET_MANUAL = 2;

interface DedupeEventRow {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
  heat: number | null;
  item_ids: string[] | null;
  status: string;
  created_at: string;
  duplicate_of?: string | null;
}

interface DedupeBudget {
  remaining: number;
}

interface DuplicateMatch {
  event: DedupeEventRow;
  score: number;
  reason: string;
}

/** 讀最近 14 天仍有效（未被合併、未被忽略）的熱點，用來當去重候選 */
async function loadDedupeCandidates(db: Db, excludeId?: string): Promise<DedupeEventRow[]> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 24 * 3_600_000).toISOString();
  let query = db
    .from("content_hot_events")
    .select("id, title, summary, url, heat, item_ids, status, created_at, duplicate_of")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(DEDUPE_EVENT_LIMIT);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) {
    // duplicate_of 未推（migration 未上）→ 退回不含該欄的查詢
    if (SCHEMA_MISSING_CODES.has(String((error as { code?: string }).code ?? ""))) {
      let fallbackQuery = db
        .from("content_hot_events")
        .select("id, title, summary, url, heat, item_ids, status, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(DEDUPE_EVENT_LIMIT);
      if (excludeId) fallbackQuery = fallbackQuery.neq("id", excludeId);
      const fallback = await fallbackQuery;
      throwDb(fallback.error, "讀取去重候選失敗");
      return ((fallback.data ?? []) as DedupeEventRow[]).filter(
        (row) => row.status !== "ignored",
      );
    }
    throwDb(error, "讀取去重候選失敗");
  }
  return ((data ?? []) as DedupeEventRow[]).filter(
    (row) => row.status !== "ignored" && !row.duplicate_of,
  );
}

/** 記錄一次「判斷是否同一事件」的模型用量（與內容來源共用 use_case=social_dedupe） */
async function recordDedupeUsage(
  db: Db,
  usage: { model: string; tokens_in: number; tokens_out: number },
): Promise<void> {
  const { error } = await db.from("content_llm_usage").insert({
    site_id: null,
    article_id: null,
    job_id: null,
    model: usage.model,
    use_case: "social_dedupe",
    tokens_in: usage.tokens_in,
    tokens_out: usage.tokens_out,
    cost_usd: estimateLlmCostUsd(usage.model, usage.tokens_in, usage.tokens_out),
  });
  if (error) console.warn(`[content-social] 記錄去重用量失敗：${dbError(error)}`);
}

/**
 * 在給定的候選清單裡找「同一件事」：先召回，夠像直接判定；
 * 不夠像才問模型，模型說同一件事但信心 < 0.9 時再覆核一次（AIHOT 的 groupReview）。
 */
async function matchDuplicateInList(
  db: Db,
  query: { title: string; summary: string | null },
  candidates: DedupeEventRow[],
  budget: DedupeBudget,
): Promise<DuplicateMatch | null> {
  if (candidates.length === 0) return null;

  const similar = findSimilarEvents(query, candidates, (candidate) => candidate, 3);
  for (const candidate of similar) {
    const verdict = duplicateVerdict(candidate.score);
    if (verdict === "distinct") break;
    if (verdict === "duplicate") {
      return { event: candidate.item, score: candidate.score, reason: "召回分數達直接合併門檻" };
    }
    if (!grokConfigured() || budget.remaining <= 0) break;

    budget.remaining -= 1;
    const first = await judgeEventRelation({
      titleA: query.title,
      summaryA: query.summary,
      titleB: candidate.item.title,
      summaryB: candidate.item.summary,
      timeoutMs: 15_000,
    });
    if (!first) continue;
    await recordDedupeUsage(db, first.usage);
    const sameRelation =
      (SAME_EVENT_RELATIONS as readonly string[]).includes(first.relation) &&
      first.confidence >= SAME_EVENT_MIN_CONFIDENCE;
    if (!sameRelation) continue;
    if (first.confidence >= 0.9) {
      return { event: candidate.item, score: candidate.score, reason: first.reason };
    }
    if (budget.remaining <= 0) break;
    budget.remaining -= 1;
    const review = await judgeEventRelation({
      titleA: query.title,
      summaryA: query.summary,
      titleB: candidate.item.title,
      summaryB: candidate.item.summary,
      pass: "review",
      timeoutMs: 15_000,
    });
    if (!review) continue;
    await recordDedupeUsage(db, review.usage);
    if (
      (SAME_EVENT_RELATIONS as readonly string[]).includes(review.relation) &&
      review.confidence >= SAME_EVENT_MIN_CONFIDENCE
    ) {
      return { event: candidate.item, score: candidate.score, reason: review.reason };
    }
  }
  return null;
}

/** 找出這則熱點是否其實是「同一件事」（候選＝最近 14 天仍有效的熱點） */
async function findDuplicateEvent(
  db: Db,
  event: { id: string; title: string; summary: string | null },
  budget: DedupeBudget,
): Promise<DuplicateMatch | null> {
  const candidates = await loadDedupeCandidates(db, event.id);
  return matchDuplicateInList(db, event, candidates, budget);
}

/**
 * 把重複事件併進保留事件：
 *   - 兩邊的稿一起挑「最值得留的一篇」（狀態 > grok > 導流數 > 時間），
 *     其餘的導流搬過去後刪掉，避免為了合併事件反而刪掉已批准／AI 稿
 *   - 重複報導掛進保留事件的 item_ids（AIHOT 的 event_items 概念），熱度累加
 *   - 重複事件標成 ignored + duplicate_of，之後不會再被掃描或比對
 */
async function absorbDuplicateEvent(
  db: Db,
  keep: DedupeEventRow,
  drop: HotEventRow,
  reason: string,
): Promise<void> {
  // 1) 稿件收斂成一篇：把兩個事件的所有稿放在一起挑，不是預設留 keep 的
  const keepPosts = await loadEventPostsWithTargetCount(db, keep.id);
  const dropPosts = await loadEventPostsWithTargetCount(db, drop.id);
  const allPosts = [...keepPosts, ...dropPosts];
  const keeper = pickCanonicalPost(allPosts);

  if (keeper) {
    const keeperFromDrop = keeper.event_id === drop.id;
    const others = allPosts.filter((post) => post.id !== keeper.id);
    if (keeperFromDrop) {
      // 先把 keep 的舊稿併進 keeper（keeper 此時仍在 drop 事件底下，不會撞 event_id 唯一鍵）
      for (const post of others) {
        if (post.event_id === keep.id) await absorbDuplicatePost(db, keeper.id, post.id);
      }
      const { error } = await db
        .from("content_social_posts")
        .update({ event_id: keep.id, group_id: null })
        .eq("id", keeper.id);
      if (error) {
        // 搬不過去就別把 drop 標成 ignored：留給下一次清理重試，避免稿掛在已忽略的事件上
        console.warn(`[content-social] 改掛保留稿失敗，暫不合併事件：${dbError(error)}`);
        return;
      }
      // 再把 drop 其餘稿併進 keeper
      for (const post of others) {
        if (post.event_id === drop.id) await absorbDuplicatePost(db, keeper.id, post.id);
      }
    } else {
      for (const post of others) await absorbDuplicatePost(db, keeper.id, post.id);
    }

    // 最後確認 drop 底下真的沒有稿了；搬移失敗就中止，不要留下「已忽略但仍有稿」的狀態
    const leftovers = await loadEventPostsWithTargetCount(db, drop.id);
    if (leftovers.length > 0) {
      console.warn(
        `[content-social] drop 事件仍有 ${leftovers.length} 篇稿未合併，暫不標記事件`,
      );
      return;
    }
  }

  // 2) 重複報導掛到保留事件（source 只允許 manual／csv／rss／hotlist）
  let nextItemIds = (keep.item_ids ?? []) as string[];
  if (drop.url) {
    const itemSource = ["manual", "csv", "rss", "hotlist"].includes(String(drop.source))
      ? String(drop.source)
      : "manual";
    const { data: itemRow, error: itemError } = await db
      .from("content_hot_items")
      .insert({
        title: drop.title,
        url: drop.url,
        summary: drop.summary,
        source: itemSource,
        heat: Math.round(Number(drop.heat ?? 0)),
      })
      .select("id")
      .single();
    if (!itemError && itemRow) {
      nextItemIds = [...nextItemIds, (itemRow as { id: string }).id];
    } else if (itemError && !isUniqueViolation(itemError)) {
      console.warn(`[content-social] 掛載重複報導失敗：${dbError(itemError)}`);
    }
  }
  const nextHeat = Math.min(100, Number(keep.heat ?? 0) + 3);
  const { error: keepError } = await db
    .from("content_hot_events")
    .update({ item_ids: nextItemIds, heat: nextHeat })
    .eq("id", keep.id);
  if (keepError) console.warn(`[content-social] 更新保留事件失敗：${dbError(keepError)}`);

  // 3) 重複事件收工
  const { error: ignoreError } = await db
    .from("content_hot_events")
    .update({ status: "ignored", duplicate_of: keep.id })
    .eq("id", drop.id);
  if (ignoreError) {
    const fallback = await db
      .from("content_hot_events")
      .update({ status: "ignored" })
      .eq("id", drop.id);
    if (fallback.error) console.warn(`[content-social] 標記重複事件失敗：${dbError(fallback.error)}`);
  }

  console.info(
    `[content-social] 合併重複熱點：${drop.id} → ${keep.id}（${reason}）`,
  );
}

// ============================================================
// 動作：dedupe_cleanup（service；維運用的重複清理）
//
// 用途：把「已經生成」的重複內容清乾淨，並可重複執行（冪等）。
//   - 事件層：最近 30 天內同一件事的多個熱點 → 合併（可重跑，已 ignored 的會跳過）
//   - 稿件層：同一事件多篇稿 → 搬走導流後刪掉多餘的（一個事件只留一篇）
//
// body：{ apply?: boolean, max_checks?: number }
//   apply 預設 false（只回報告，不動資料）；確認報告無誤後再送 apply: true。
// ============================================================

interface DedupeCleanupReport {
  applied: boolean;
  scannedEvents: number;
  scannedPosts: number;
  eventMerges: { keep: string; drop: string; score: number; reason: string }[];
  postMerges: { keep: string; drop: string; movedTargets: number }[];
  fingerprintsBackfilled: number;
}

async function handleDedupeCleanup(
  db: Db,
  body: Record<string, unknown>,
): Promise<DedupeCleanupReport> {
  const apply = body.apply === true;
  const maxChecks = Math.min(20, Math.max(1, Number(body.max_checks) || 8));
  const since = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();

  const { data, error } = await db
    .from("content_hot_events")
    .select("id, title, summary, url, heat, item_ids, status, created_at, source, duplicate_of")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(500);
  throwDb(error, "讀取熱點失敗");
  const rows = (data ?? []) as (DedupeEventRow & { source?: string | null })[];

  const report: DedupeCleanupReport = {
    applied: apply,
    scannedEvents: 0,
    scannedPosts: 0,
    eventMerges: [],
    postMerges: [],
    fingerprintsBackfilled: 0,
  };
  const kept: DedupeEventRow[] = [];
  const budget: DedupeBudget = { remaining: maxChecks };

  for (const row of rows) {
    if (row.status === "ignored" || row.duplicate_of) continue;
    report.scannedEvents += 1;
    const match = await matchDuplicateInList(db, row, kept, budget);
    if (!match) {
      kept.push(row);
      continue;
    }
    report.eventMerges.push({
      keep: match.event.id,
      drop: row.id,
      score: match.score,
      reason: match.reason,
    });
    if (apply) {
      await absorbDuplicateEvent(
        db,
        match.event,
        {
          id: row.id,
          title: row.title,
          summary: row.summary,
          url: row.url,
          heat: row.heat,
          source: row.source ?? "manual",
          status: row.status,
          created_at: row.created_at,
        },
        match.reason,
      );
    }
  }

  // 同一事件多篇稿：即使事件層沒有重複，也要收斂成一篇
  const { data: postRows, error: postError } = await db
    .from("content_social_posts")
    .select("id, event_id, created_at")
    .not("event_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(1_000);
  throwDb(postError, "讀取社媒稿失敗");
  const byEvent = new Map<string, string[]>();
  for (const row of (postRows ?? []) as { id: string; event_id: string | null }[]) {
    if (!row.event_id) continue;
    const list = byEvent.get(row.event_id) ?? [];
    list.push(row.id);
    byEvent.set(row.event_id, list);
  }
  report.scannedPosts = (postRows ?? []).length;
  for (const [eventId, postIds] of byEvent) {
    if (postIds.length < 2) continue;
    const posts = await loadEventPostsWithTargetCount(db, eventId);
    if (posts.length < 2) continue;
    const keeper = pickCanonicalPost(posts);
    if (!keeper) continue;
    for (const post of posts) {
      if (post.id === keeper.id) continue;
      const loserTargets = (await loadTargetsByPost(db, [post.id])).get(post.id) ?? [];
      report.postMerges.push({
        keep: keeper.id,
        drop: post.id,
        movedTargets: loserTargets.length,
      });
      if (apply) await absorbDuplicatePost(db, keeper.id, post.id);
    }
  }

  // 既有稿沒有指紋（migration 前生成的）→ 補算，讓日後稽核看得到。
  // 每次最多 200 篇、每批 10 篇並行：避免維運呼叫撞到 Edge Function 150 秒上限。
  const { data: missingFingerprints, error: fingerprintError } = await db
    .from("content_social_posts")
    .select("id, title, body_md")
    .is("content_fingerprint", null)
    .limit(200);
  if (!fingerprintError) {
    const rowsToFill = (missingFingerprints ?? []) as {
      id: string;
      title: string | null;
      body_md: string | null;
    }[];
    report.fingerprintsBackfilled = rowsToFill.length;
    if (apply) {
      for (const batch of chunk(rowsToFill, 10)) {
        await Promise.all(
          batch.map(async (row) => {
            const { error } = await db
              .from("content_social_posts")
              .update({ content_fingerprint: contentFingerprint(row.title, row.body_md) })
              .eq("id", row.id);
            if (error) {
              console.warn(`[content-social] 回填指紋失敗（${row.id}）：${dbError(error)}`);
            }
          }),
        );
      }
    }
  }

  return report;
}

// ============================================================
// 動作：list（今日看板）
// ============================================================

async function handleList(db: Db, body: Record<string, unknown> = {}): Promise<SocialOverview> {
  const dayStart = hktDayStartIso();
  const postLimit = clampLimit(body.post_limit, POST_LIST_LIMIT, MAX_POST_LIST_LIMIT);
  const eventLimit = clampLimit(body.event_limit, EVENT_LIST_LIMIT, MAX_EVENT_LIST_LIMIT);

  const [events, posts, groups, accounts] = await Promise.all([
    listHotEvents(db, eventLimit),
    listSocialPosts(db, postLimit),
    listSocialGroups(db),
    listSocialAccounts(db),
  ]);

  const groupsById = new Map(
    groups.map((group): [string, SocialGroupRow] => [group.id, group]),
  );
  const accountsById = new Map(
    accounts.map((account): [string, SocialAccountRow] => [account.id, account]),
  );
  const activeGroups = groups.filter((group) => !group.archived);
  const postEventIds = posts.map((post) => post.event_id).filter(isNonEmptyString);

  const [counts, postCountsByEvent, accountCountByGroup, targetsByPost, eventsByIdOfPosts] =
    await Promise.all([
      Promise.all([
        countOpenEvents(db),
        // 「待審」= 現在真的可以按通過／駁回的稿件：
        // pending_review 之外也算 changes_requested（與 SocialDeskView 的可審核狀態一致）
        countPostsByStatus(db, ["pending_review", "changes_requested"]),
        countPostsByStatus(db, READY_STATUSES),
        countPublishedTargetsSince(db, dayStart),
      ]),
      countPostsByEvent(db, events.map((event) => event.id)),
      countAccountsByGroup(db, activeGroups.map((group) => group.id), accountsById),
      loadTargetsByPost(db, posts.map((post) => post.id)),
      loadEventMap(db, postEventIds),
    ]);

  const [openEvents, pendingReview, readyToPublish, publishedToday] = counts;

  return {
    stats: {
      openEvents,
      pendingReview,
      readyToPublish,
      publishedToday,
      // 帳號／組的數字以「還在營運中」的為準（歸檔的不計）
      accounts: accounts.filter((account) => !account.archived).length,
      groups: activeGroups.length,
    },
    events: events.map((event) => toEventView(event, postCountsByEvent.get(event.id) ?? 0)),
    posts: posts.map((post) =>
      toPostView(
        post,
        groupsById,
        eventsByIdOfPosts,
        accountsById,
        targetsByPost.get(post.id) ?? [],
      ),
    ),
    groups: activeGroups.map((group) => ({
      id: group.id,
      name: group.name,
      account_count: accountCountByGroup.get(group.id) ?? 0,
    })),
    accounts: sortAccounts(accounts).map(toAccountView),
  };
}

// ============================================================
// 動作：create_event（貼熱點 → 立即產批次）
// ============================================================

async function handleCreateEvent(
  db: Db,
  body: Record<string, unknown>,
): Promise<{ event: SocialEventView; posts: SocialPostView[]; duplicate_of?: string }> {
  const title = asTrimmedString(body.title);
  if (!title || title.length < MIN_TITLE_LENGTH) {
    fail(400, "invalid_title", "熱點標題至少需要 2 個字");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    fail(400, "invalid_title", `熱點標題不可超過 ${MAX_TITLE_LENGTH} 字`);
  }
  // 摘要過長直接截斷（不擋操作），反正標題才是主要輸入
  const summary = asTrimmedString(body.summary);
  const trimmedSummary = summary && summary.length > MAX_SUMMARY_LENGTH
    ? summary.slice(0, MAX_SUMMARY_LENGTH)
    : summary;
  const url = parseOptionalHttpUrl(body.url);
  const heat = manualHeat(title, trimmedSummary);

  // 先確認真的有「組 × 帳號」可用，否則熱點建了也產不出東西。
  // 這是最常見的第一次使用卡點，訊息要說真話（不是 dev 文案）。
  const roster = await loadRoster(db);
  if (!roster.some((entry) => entry.accounts.length > 0)) {
    fail(400, "no_accounts", NO_ACCOUNTS_MESSAGE);
  }

  // 貼之前先用「標題＋摘要」比對最近 14 天：是同一件事就不再建新熱點。
  // 這樣「同一則新聞換個連結再貼」不會變成看板上的第二張卡。
  const duplicate = await matchDuplicateInList(
    db,
    { title, summary: trimmedSummary },
    await loadDedupeCandidates(db),
    { remaining: DEDUPE_LLM_BUDGET_MANUAL },
  );
  if (duplicate) {
    const canonical = await fetchHotEventRow(db, duplicate.event.id);
    if (!canonical) fail(404, "event_not_found", "找不到既有的同一事件");
    // 保留事件若還沒有稿（例如當時沒有帳號）→ 順便補產；已有稿就只補導流
    const posts = await generateForEvent(db, canonical, roster);
    const latest = (await fetchHotEventRow(db, canonical.id)) ?? canonical;
    return {
      event: toEventView(latest, posts.length),
      posts,
      duplicate_of: canonical.id,
    };
  }

  const { data, error } = await db
    .from("content_hot_events")
    .insert({
      title,
      summary: trimmedSummary,
      url,
      heat,
      source: "manual",
      status: "open",
      // 與 RSS／CSV 匯入共用去重鍵；已存在的話下方便回 409
      dedupe_key: dedupeKey(url, title),
    })
    .select("*")
    .single();
  if (error) {
    if (String((error as { code?: string }).code) === "23505") {
      fail(409, "duplicate_event", "這個熱點已經存在（標題或連結重複）");
    }
    throwDb(error, "新增熱點失敗");
  }
  if (!data) fail(500, "db_error", "新增熱點後沒有回傳資料");

  const event = data as HotEventRow;
  // 插入後立即產稿：使用者貼完就馬上看得到待審稿件（今天上線就要看到效果）
  const posts = await generateForEvent(db, event, roster);

  const latest = (await fetchHotEventRow(db, event.id)) ?? event;
  return { event: toEventView(latest, posts.length), posts };
}

// ============================================================
// 動作：generate_now（補產缺批次的組）
// ============================================================

async function handleGenerateNow(
  db: Db,
  body: Record<string, unknown>,
): Promise<{ posts: SocialPostView[]; duplicate_of?: string }> {
  const eventId = requireUuid(body.event_id, "invalid_event_id", "缺少有效的 event_id");
  const event = await fetchHotEventRow(db, eventId);
  if (!event) fail(404, "event_not_found", "找不到此熱點");

  // 這個熱點先前已被判定為重複 → 直接對保留事件補導流／補稿
  const mergedInto = await loadEventDuplicateOf(db, event.id);
  if (mergedInto) {
    const canonical = await fetchHotEventRow(db, mergedInto);
    if (!canonical) fail(404, "event_not_found", "找不到此熱點合併後的保留事件");
    const posts = await generateForEvent(db, canonical);
    return { posts, duplicate_of: canonical.id };
  }

  // 已經有稿的事件不再做「合併到別的事件」：稿件可能已批准／已排期，
  // 把它併走等於刪掉人工審過的內容。generateForEvent 只會補缺的導流。
  if (event.status === "ignored") {
    fail(409, "event_ignored", "此熱點已被忽略或合併，請先恢復後再生成");
  }
  const existingPosts = await loadEventPostsWithTargetCount(db, event.id);
  if (existingPosts.length > 0) {
    const posts = await generateForEvent(db, event);
    return { posts };
  }

  // 產生前再確認一次：是同一件事就併進既有事件，避免又生一篇重複稿
  const duplicate = await findDuplicateEvent(db, event, {
    remaining: DEDUPE_LLM_BUDGET_MANUAL,
  });
  if (duplicate) {
    await absorbDuplicateEvent(db, duplicate.event, event, duplicate.reason);
    const canonical = await fetchHotEventRow(db, duplicate.event.id);
    if (!canonical) fail(404, "event_not_found", "找不到此熱點合併後的保留事件");
    const posts = await generateForEvent(db, canonical);
    return { posts, duplicate_of: canonical.id };
  }

  const posts = await generateForEvent(db, event);
  return { posts };
}

/** 讀事件的 duplicate_of（migration 未推時回 null，不讓整個操作失敗） */
async function loadEventDuplicateOf(db: Db, eventId: string): Promise<string | null> {
  const { data, error } = await db
    .from("content_hot_events")
    .select("duplicate_of")
    .eq("id", eventId)
    .maybeSingle();
  if (error) return null;
  return (data as { duplicate_of?: string | null } | null)?.duplicate_of ?? null;
}

// ============================================================
// 動作：review（批准 / 退回）
// ============================================================

async function handleReview(
  db: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<SocialPostView> {
  const postId = requireUuid(body.post_id, "invalid_post_id", "缺少有效的 post_id");
  // 外層 action 已經是 'review'，決策放 decision（approve / reject）
  const decision = asTrimmedString(body.decision);
  if (decision !== "approve" && decision !== "reject") {
    fail(400, "invalid_decision", "decision 只接受 approve 或 reject");
  }

  const post = await fetchPostRow(db, postId);
  if (!post) fail(404, "post_not_found", "找不到此社媒稿");
  if (!REVIEWABLE_STATUSES.has(post.status)) {
    fail(
      409,
      "invalid_transition",
      `稿件目前狀態（${post.status}）不可審核，請先確認是否已在審核流程中`,
    );
  }

  const now = nowIso();
  const patch: Record<string, unknown> = {};

  if (decision === "approve") {
    // 沒指定就排到下一個 HKT 10:00；指定時間允許在過去（tick 會立刻推進）
    const scheduledAt =
      parseOptionalDateTime(body.scheduled_at, "scheduled_at", "invalid_scheduled_at") ??
      nextPublishAtHkt(new Date(now));
    patch.status = "approved";
    patch.scheduled_at = scheduledAt;
    patch.approved_at = now;
    patch.reviewer_id = actorUserId(actor);
  } else {
    const reason = asTrimmedString(body.reason);
    // content_social_posts 沒有退回理由欄位（且本階段不得改 migration），
    // 理由寫進函式 log 供追查；退回本身只改狀態。
    if (reason) console.warn(`[content-social] 稿件 ${postId} 退回：${reason}`);
    patch.status = "changes_requested";
  }

  const { data, error } = await db
    .from("content_social_posts")
    .update(patch)
    .eq("id", postId)
    .select("*")
    .maybeSingle();
  throwDb(error, "更新稿件狀態失敗");
  if (!data) fail(404, "post_not_found", "找不到此社媒稿");

  const [view] = await hydratePosts(db, [data as SocialPostRow]);
  return view;
}

// ============================================================
// 動作：mark（標記已發佈）
// ============================================================

/**
 * 標記「已發佈」後的稿件狀態：
 *   - 所有 target 都 published → post = published
 *   - 還有沒發的，且 post 已在 approved / scheduled / publishing → publishing
 *   - 其他（待審、已取消）不動，避免一鍵標記把稿件狀態帶歪
 */
function resolvePostStatusAfterMark(
  currentStatus: string,
  targets: SocialTargetRow[],
): string {
  if (targets.length > 0 && targets.every((target) => target.status === "published")) {
    return "published";
  }
  if (READY_STATUS_SET.has(currentStatus)) return "publishing";
  return currentStatus;
}

async function handleMark(
  db: Db,
  body: Record<string, unknown>,
): Promise<{ post: SocialPostView; targets: SocialTargetView[] }> {
  const postId = requireUuid(body.post_id, "invalid_post_id", "缺少有效的 post_id");
  const targetIdRaw = asTrimmedString(body.target_id);
  const targetId = targetIdRaw
    ? requireUuid(body.target_id, "invalid_target_id", "target_id 不是有效的 uuid")
    : null;
  const url = parseOptionalHttpUrl(body.url);

  let post = await fetchPostRow(db, postId);
  if (!post) fail(404, "post_not_found", "找不到此社媒稿");

  const now = nowIso();

  if (targetId) {
    // 單一帳號：先確認這條導流真的屬於這張稿（避免跨稿誤標）
    const { data: targetRow, error: targetError } = await db
      .from("content_social_targets")
      .select("*")
      .eq("id", targetId)
      .eq("post_id", postId)
      .maybeSingle();
    throwDb(targetError, "讀取導流目標失敗");
    if (!targetRow) fail(404, "target_not_found", "找不到此導流目標");

    const { error: updateError } = await db
      .from("content_social_targets")
      .update({ status: "published", published_at: now, published_url: url })
      .eq("id", targetId);
    throwDb(updateError, "更新導流目標失敗");
  } else {
    // 整批：只補還沒發的，已發過的不重寫 published_at（保留第一次發佈時間）
    const patch: Record<string, unknown> = { status: "published", published_at: now };
    if (url) patch.published_url = url;
    const { error: updateError } = await db
      .from("content_social_targets")
      .update(patch)
      .eq("post_id", postId)
      .neq("status", "published");
    throwDb(updateError, "更新導流目標失敗");
  }

  // 重新讀 targets 判定整批進度
  const targetsByPost = await loadTargetsByPost(db, [postId]);
  const rawTargets = targetsByPost.get(postId) ?? [];
  const nextStatus = resolvePostStatusAfterMark(post.status, rawTargets);

  if (nextStatus !== post.status) {
    const { data: updatedPost, error: postUpdateError } = await db
      .from("content_social_posts")
      .update({ status: nextStatus })
      .eq("id", postId)
      .select("*")
      .maybeSingle();
    throwDb(postUpdateError, "更新稿件狀態失敗");
    if (updatedPost) post = updatedPost as SocialPostRow;
  }

  const [groupsById, accountsById, eventsById] = await Promise.all([
    loadGroupMap(db),
    loadAccountMap(db),
    loadEventMap(db, post.event_id ? [post.event_id] : []),
  ]);

  return {
    post: toPostView(post, groupsById, eventsById, accountsById, rawTargets),
    targets: sortTargetViews(rawTargets.map((row) => toTargetView(row, accountsById))),
  };
}

// ============================================================
// 動作：auto_tick（cron 每 2 分鐘；只准 service_role）
// ============================================================

async function handleAutoTick(
  db: Db,
): Promise<{
  advanced: number;
  generated: number;
  deduped: number;
  events: string[];
  disabled?: boolean;
}> {
  // 總開關關閉時：不推進、不產稿；手動操作（create_event／generate_now）仍可用
  const autopilot = await loadAutopilot(db);
  if (!autopilot.enabled) {
    return { disabled: true, advanced: 0, generated: 0, deduped: 0, events: [] };
  }
  const now = nowIso();

  // 1) 推進到期稿件：approved / scheduled 且 scheduled_at <= now → publishing
  const { data: advancedRows, error: advanceError } = await db
    .from("content_social_posts")
    .update({ status: "publishing" })
    .in("status", ["approved", "scheduled"])
    .lte("scheduled_at", now)
    .select("id");
  throwDb(advanceError, "推進到期稿件失敗");
  const advanced = (advancedRows ?? []).length;

  // 2) 自動產稿：7 天內、還沒有任何批次的 open 熱點（最多 3 個）
  const generatedEventIds: string[] = [];
  let generated = 0;
  let deduped = 0;
  // 每 tick 共用一份模型預算：去重判斷不能吃掉整輪的時間／成本
  const dedupeBudget: DedupeBudget = { remaining: DEDUPE_LLM_BUDGET_TICK };

  const roster = await loadRoster(db);
  if (!roster.some((entry) => entry.accounts.length > 0)) {
    // 沒有任何可用帳號時不用掃描，避免每 2 分鐘白跑一輪查詢
    return { advanced, generated, deduped, events: generatedEventIds };
  }

  const since = new Date(
    Date.now() - AUTO_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: openEvents, error: openError } = await db
    .from("content_hot_events")
    .select(HOT_EVENT_COLUMNS)
    .eq("status", "open")
    .gte("created_at", since)
    // 新貼的先產：使用者通常在貼完的幾分鐘內就想看到稿件
    .order("created_at", { ascending: false })
    .limit(AUTO_SCAN_LIMIT);
  throwDb(openError, "讀取待處理熱點失敗");

  const candidates = (openEvents ?? []) as HotEventRow[];
  if (candidates.length === 0) return { advanced, generated, deduped, events: generatedEventIds };

  const postCountsByEvent = await countPostsByEvent(
    db,
    candidates.map((event) => event.id),
  );
  // LLM 模式下每個事件要打 1–2 次模型（每次最多 60 秒），一輪只處理 1 個，
  // 避免 150 秒的 Edge 時限；模板模式沒有這個限制，維持 3 個。
  const eventLimit = grokConfigured() ? 1 : AUTO_TICK_EVENT_LIMIT;
  const pending = candidates
    .filter((event) => (postCountsByEvent.get(event.id) ?? 0) === 0)
    .slice(0, eventLimit);

  const tickStartedAt = Date.now();
  const tickBudgetMs = grokConfigured() ? 95_000 : 70_000;

  for (const event of pending) {
    // 時間預算用完就先收工，剩下的下一個 tick 再處理（不讓整個請求被砍）
    if (Date.now() - tickStartedAt > tickBudgetMs) {
      console.warn(`[content-social] tick 時間預算用盡，剩餘熱點留待下一輪`);
      break;
    }
    // 單一事件失敗不可中止整批：cron 2 分鐘後會再試一次
    try {
      // 產稿前先去重：同一件事只留一個事件、一篇稿
      const duplicate = await findDuplicateEvent(db, event, dedupeBudget);
      if (duplicate) {
        await absorbDuplicateEvent(db, duplicate.event, event, duplicate.reason);
        deduped += 1;
        continue;
      }
      const posts = await generateForEvent(db, event, roster);
      if (posts.length > 0) {
        generated += posts.length;
        generatedEventIds.push(event.id);
      }
    } catch (error) {
      console.warn(
        `[content-social] auto_tick 產稿失敗（event ${event.id}）：${errorMessage(error)}`,
      );
    }
  }

  return { advanced, generated, deduped, events: generatedEventIds };
}

/**
 * 診斷：確認 Grok 是否可用（只給 service_role）。
 * 會實際打一次小請求，回傳模型、token 用量與樣本標題；
 * 失敗時回 ok:false 但不拋錯，方便維運一眼看出是 key、額度還是格式問題。
 */
async function handleLlmCheck(body: Record<string, unknown> = {}): Promise<unknown> {
  const configured = grokConfigured();
  const mode = asTrimmedString(body.mode) || "generate";
  const requestedModel = asTrimmedString(body.model);
  const model = requestedModel || grokModel();

  // ping：只列出可用模型，驗證 key 與網路（最快、最省）
  if (mode === "ping") {
    const listing = await listGrokModels(Number(body.timeout_ms) || 20_000);
    return { configured, mode, ...listing };
  }

  if (!configured) {
    return { configured: false, ok: false, model, error: "XAI_API_KEY 未設定" };
  }

  const timeoutMs = Math.min(
    120_000,
    Math.max(15_000, Number(body.timeout_ms) || 90_000),
  );

  try {
    const result = await composeWithGrok({
      eventTitle: "換季敏感肌點樣揀潔面？",
      eventSummary: "測試用：確認 Grok 能回傳合法 JSON。",
      platforms: ["instagram"],
      timeoutMs,
      model,
      maxTokens: Number(body.max_tokens) || 1_600,
    });
    return {
      configured: true,
      mode,
      ok: true,
      model: result.usage.model,
      tokens_in: result.usage.tokens_in,
      tokens_out: result.usage.tokens_out,
      sample_title: result.longform.title,
      sample_chars: result.longform.body_md.length,
    };
  } catch (error) {
    return { configured: true, mode, ok: false, model, error: errorMessage(error) };
  }
}

// ============================================================
// 動作：登入憑證（半自動，M4-03）
//
// 為什麼是「半自動」：v1 不呼叫 Meta／Threads／IG API（PRD §1.3 非目標），
// 但把憑證以 AES-256-GCM 加密存起來、記錄到期日，就能做到：
//   - 前端只看到非機密封印（狀態／到期日／尾碼指紋），永不回傳明文
//   - 「全部檢測」＝ 解密自檢 + 到期日判斷（不依賴平台 API、不需要 App Review）
//   - 7 天內到期自動標 expiring，日報／看板可先提醒負責人重新登入
// ============================================================

/** 少於這個天數就標 expiring（先提醒，不要等到過期才發現） */
const CREDENTIAL_EXPIRING_DAYS = 7;
const MAX_CREDENTIAL_SECRET_LENGTH = 8_192;
const CREDENTIAL_KINDS: ReadonlySet<string> = new Set(["oauth_token", "app_password", "manual_note"]);

type CredentialMirrorStatus = "active" | "expiring" | "expired" | "invalid";

interface CredentialAccountRow {
  id: string;
  handle: string;
  platform: string;
  login_status: string | null;
  credential_status: string | null;
  credential_expires_at: string | null;
  credential_fingerprint: string | null;
  last_checked_at: string | null;
}

interface CredentialCipherRow {
  account_id: string;
  ciphertext: string;
  expires_at: string | null;
  status: string;
  last_error: string | null;
}

function daysLeftOf(expiresAt: string | null, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const value = new Date(expiresAt).getTime();
  if (!Number.isFinite(value)) return null;
  // 對齊 B100：未到期無條件進位、已過期無條件退位（避免 -0 被顯示成未過期）
  const days = (value - now) / 86_400_000;
  return days >= 0 ? Math.ceil(days) : -Math.ceil(-days);
}

function deriveCredentialMirror(expiresAt: string | null, invalid = false): CredentialMirrorStatus {
  if (invalid) return "invalid";
  const daysLeft = daysLeftOf(expiresAt);
  if (daysLeft === null) return "active"; // 長效 token（沒有到期日）
  if (daysLeft < 0) return "expired";
  if (daysLeft <= CREDENTIAL_EXPIRING_DAYS) return "expiring";
  return "active";
}

/** 帳號的 login_status 是給看板／日報用的粗略訊號：有有效憑證就算已登入 */
function loginStatusForCredential(status: CredentialMirrorStatus): "active" | "expired" {
  return status === "active" || status === "expiring" ? "active" : "expired";
}

/** 憑證表只允許 active／expired／invalid／untested；expiring 只存在帳號鏡像 */
function credentialRowStatus(status: CredentialMirrorStatus): "active" | "expired" | "invalid" {
  if (status === "expired") return "expired";
  if (status === "invalid") return "invalid";
  return "active";
}

/**
 * 到期日輸入：接受完整 ISO 或 `YYYY-MM-DD`。
 * 日期只給到天時，以香港時間當天 23:59:59 為到期點（「這天還有效」）。
 */
function parseCredentialExpiry(value: unknown): string | null {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const text = dateOnly ? `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T23:59:59+08:00` : raw;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    fail(400, "invalid_expires_at", "到期日格式不正確（請用 YYYY-MM-DD 或 ISO 時間）");
  }
  return date.toISOString();
}

async function fetchCredentialAccount(db: Db, accountId: string): Promise<CredentialAccountRow | null> {
  const { data, error } = await db
    .from("content_social_accounts")
    .select(
      "id, handle, platform, login_status, credential_status, credential_expires_at, credential_fingerprint, last_checked_at",
    )
    .eq("id", accountId)
    .maybeSingle();
  throwDb(error, "讀取社群帳號失敗");
  return (data as CredentialAccountRow | null) ?? null;
}

/** 把已驗證過的憑證加密落庫＋同步帳號鏡像（save_credential 與 OAuth callback 共用） */
async function persistCredential(
  db: Db,
  accountId: string,
  secret: string,
  expiresAt: string | null,
  kind: string,
): Promise<Record<string, unknown>> {
  const now = nowIso();
  let sealed: Awaited<ReturnType<typeof sealCredential>>;
  try {
    sealed = await sealCredential(secret);
  } catch (error) {
    if (error instanceof ContentVaultError) fail(503, error.code, error.message);
    throw error;
  }

  const status = deriveCredentialMirror(expiresAt);
  const { error: credentialError } = await db
    .from("content_social_account_credentials")
    .upsert(
      {
        account_id: accountId,
        kind,
        ciphertext: sealed.ciphertext,
        fingerprint: sealed.fingerprint,
        expires_at: expiresAt,
        status: credentialRowStatus(status),
        last_checked_at: now,
        last_error: null,
      },
      { onConflict: "account_id" },
    );
  throwDb(credentialError, "儲存帳號憑證失敗");

  const { error: accountError } = await db
    .from("content_social_accounts")
    .update({
      credential_status: status,
      credential_kind: kind,
      credential_expires_at: expiresAt,
      credential_fingerprint: sealed.fingerprint,
      credential_updated_at: now,
      login_status: loginStatusForCredential(status),
      last_checked_at: now,
    })
    .eq("id", accountId);
  throwDb(accountError, "更新帳號憑證狀態失敗");

  return {
    account_id: accountId,
    kind,
    credential_status: status,
    credential_expires_at: expiresAt,
    credential_fingerprint: sealed.fingerprint,
    days_left: daysLeftOf(expiresAt),
    checked_at: now,
  };
}

/** save_credential：加密儲存憑證＋更新帳號鏡像（不回傳明文） */
async function handleSaveCredential(
  db: Db,
  body: Record<string, unknown>,
): Promise<unknown> {
  const accountId = requireUuid(body.account_id, "invalid_account_id", "缺少有效的 account_id");
  const secret = asTrimmedString(body.secret);
  if (!secret) fail(400, "missing_secret", "請貼上平台憑證（access token／應用程式密碼）");
  if (secret.length > MAX_CREDENTIAL_SECRET_LENGTH) {
    fail(400, "secret_too_long", `憑證長度不可超過 ${MAX_CREDENTIAL_SECRET_LENGTH} 字元`);
  }
  const kind = asTrimmedString(body.kind) || "oauth_token";
  if (!CREDENTIAL_KINDS.has(kind)) {
    fail(400, "invalid_kind", "kind 只能是 oauth_token／app_password／manual_note");
  }
  if (!vaultConfigured()) {
    fail(
      503,
      "vault_not_configured",
      "CONTENT_VAULT_KEY 未設定，無法加密憑證；請先執行 supabase secrets set CONTENT_VAULT_KEY=...",
    );
  }

  const account = await fetchCredentialAccount(db, accountId);
  if (!account) fail(404, "account_not_found", "找不到此社群帳號");

  const expiresAt = parseCredentialExpiry(body.expires_at);
  return persistCredential(db, accountId, secret, expiresAt, kind);
}

/** clear_credential：刪除密文並把鏡像恢復「未設定」（冪等） */
async function handleClearCredential(
  db: Db,
  body: Record<string, unknown>,
): Promise<unknown> {
  const accountId = requireUuid(body.account_id, "invalid_account_id", "缺少有效的 account_id");
  const account = await fetchCredentialAccount(db, accountId);
  if (!account) fail(404, "account_not_found", "找不到此社群帳號");

  const { error: deleteError } = await db
    .from("content_social_account_credentials")
    .delete()
    .eq("account_id", accountId);
  throwDb(deleteError, "清除帳號憑證失敗");

  const now = nowIso();
  const { error: accountError } = await db
    .from("content_social_accounts")
    .update({
      credential_status: null,
      credential_kind: null,
      credential_expires_at: null,
      credential_fingerprint: null,
      credential_updated_at: now,
      login_status: "unknown",
      last_checked_at: now,
    })
    .eq("id", accountId);
  throwDb(accountError, "重設帳號憑證狀態失敗");

  return { cleared: true, account_id: accountId, cleared_at: now };
}

/**
 * diagnose_credentials：批次（或單一）檢測
 *   - 有憑證：解密自檢（金鑰輪換／格式錯誤 → invalid）＋到期日判斷
 *   - 無憑證：保持手動 login_status，不硬改
 * 不呼叫任何平台 API（v1 非目標）；一次最多 500 個帳號。
 */
async function handleDiagnoseCredentials(
  db: Db,
  body: Record<string, unknown>,
): Promise<unknown> {
  const accountIdRaw = asTrimmedString(body.account_id);
  const accountId = accountIdRaw
    ? requireUuid(body.account_id, "invalid_account_id", "account_id 不是有效的 uuid")
    : null;

  let accountQuery = db
    .from("content_social_accounts")
    .select(
      "id, handle, platform, login_status, credential_status, credential_expires_at, credential_fingerprint, last_checked_at",
    )
    .order("platform", { ascending: true })
    .order("handle", { ascending: true });
  accountQuery = accountId ? accountQuery.eq("id", accountId) : accountQuery.eq("archived", false).limit(500);
  const { data: accountRows, error: accountError } = await accountQuery;
  throwDb(accountError, "讀取社群帳號失敗");

  const accounts = (accountRows ?? []) as CredentialAccountRow[];
  if (accounts.length === 0) {
    return {
      checked_at: nowIso(),
      summary: { accounts: 0, with_credential: 0, active: 0, expiring: 0, expired: 0, invalid: 0, missing: 0 },
      accounts: [],
    };
  }

  const credentialByAccount = new Map<string, CredentialCipherRow>();
  for (const batch of chunk(accounts.map((account) => account.id), CHUNK_SIZE)) {
    const { data: credentialRows, error: credentialError } = await db
      .from("content_social_account_credentials")
      .select("account_id, ciphertext, expires_at, status, last_error")
      .in("account_id", batch);
    throwDb(credentialError, "讀取帳號憑證失敗");
    for (const row of (credentialRows ?? []) as CredentialCipherRow[]) {
      credentialByAccount.set(row.account_id, row);
    }
  }

  const now = nowIso();
  const keyReady = vaultConfigured();
  const summary = { accounts: accounts.length, with_credential: 0, active: 0, expiring: 0, expired: 0, invalid: 0, missing: 0 };
  const results: Record<string, unknown>[] = [];

  for (const account of accounts) {
    const credential = credentialByAccount.get(account.id);
    if (!credential) {
      summary.missing += 1;
      results.push({
        account_id: account.id,
        handle: account.handle,
        platform: account.platform,
        credential_status: "none",
        credential_expires_at: account.credential_expires_at,
        days_left: null,
        login_status: account.login_status,
        last_error: null,
      });
      continue;
    }

    summary.with_credential += 1;
    let invalid = false;
    let lastError: string | null = null;
    if (!keyReady) {
      invalid = true;
      lastError = "CONTENT_VAULT_KEY 未設定，無法解密";
    } else {
      try {
        await unsealCredential(credential.ciphertext);
      } catch (error) {
        invalid = true;
        lastError = errorMessage(error);
      }
    }

    const expiresAt = credential.expires_at ?? account.credential_expires_at;
    const status = deriveCredentialMirror(expiresAt, invalid);
    summary[status] += 1;

    const { error: credentialUpdateError } = await db
      .from("content_social_account_credentials")
      .update({
        status: credentialRowStatus(status),
        last_checked_at: now,
        last_error: lastError,
      })
      .eq("account_id", account.id);
    if (credentialUpdateError) console.warn("[content-social] credential status update failed", dbError(credentialUpdateError));

    const { error: accountUpdateError } = await db
      .from("content_social_accounts")
      .update({
        credential_status: status,
        credential_expires_at: expiresAt,
        credential_fingerprint: account.credential_fingerprint,
        credential_updated_at: now,
        login_status: loginStatusForCredential(status),
        last_checked_at: now,
      })
      .eq("id", account.id);
    if (accountUpdateError) console.warn("[content-social] account credential status update failed", dbError(accountUpdateError));

    results.push({
      account_id: account.id,
      handle: account.handle,
      platform: account.platform,
      credential_status: status,
      credential_expires_at: expiresAt,
      days_left: daysLeftOf(expiresAt),
      login_status: loginStatusForCredential(status),
      last_error: lastError,
    });
  }

  return { checked_at: now, summary, accounts: results };
}

// ============================================================
// 動作：import_events（熱點匯入；PRD §10 熱點雷達、執行清單 M4-04）
//
// 前端（雷達頁的 CSV／貼上）把整批資料丟進來，這裡逐列驗證、逐列去重、逐列插入：
//   - 單列壞掉只回報那一列（errors[{line,title,reason}]），不讓整批失敗
//   - 去重鍵與 content-sources 共用 dedupeKey(url, title)（有 URL 用正規化 URL，
//     沒有就用標題 simhash），寫進 content_hot_events.dedupe_key
//   - 先分批查既有鍵跳過；插入時再讓唯一索引的 23505 兜底（兩人同時匯入同一批）
//
// dedupe_key 欄位由 migration 20261126140000 新增；未部署時查詢／插入會回
// PGRST204，這裡走 throwDb → 503「功能尚未啟用」，而不是回一堆看不懂的逐列錯誤。
// ============================================================

interface ImportEventCandidate {
  /** 1-based：前端顯示「第幾列」，與 CSV 行號直覺對得上 */
  line: number;
  title: string;
  url: string | null;
  summary: string | null;
  dedupe_key: string;
}

interface SocialImportError {
  line: number;
  title: string;
  reason: string;
}

interface SocialImportResult {
  inserted: number;
  skipped: number;
  errors: SocialImportError[];
}

type ImportRowParse =
  | { ok: true; candidate: ImportEventCandidate }
  | { ok: false; error: SocialImportError };

/**
 * 單列解析：不合法時「回傳錯誤」而不是 throw —— 這是批次匯入，
 * 一列壞掉不能讓其他 199 列一起消失。
 */
function parseImportEventRow(raw: unknown, line: number): ImportRowParse {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  // 錯誤訊息要盡量回報使用者原本打的字（即使它不合法），前端才能標出問題列
  const rawTitle = typeof record?.title === "string" ? record.title.trim() : "";
  const reject = (reason: string): ImportRowParse => ({
    ok: false,
    error: { line, title: rawTitle, reason },
  });

  if (!record) return reject("每一列必須是物件（{ title, url?, summary? }）");
  if (!rawTitle) return reject("缺少標題");
  if (rawTitle.length < MIN_TITLE_LENGTH) {
    return reject(`標題至少需要 ${MIN_TITLE_LENGTH} 個字`);
  }
  if (rawTitle.length > MAX_IMPORT_TITLE_LENGTH) {
    return reject(`標題不可超過 ${MAX_IMPORT_TITLE_LENGTH} 字`);
  }

  // url 可空；有值必須是可點的 http(s)（與 create_event 同一套規則，但不整批失敗）
  let url: string | null = null;
  const rawUrl = typeof record.url === "string" ? record.url.trim() : "";
  if (rawUrl) {
    if (rawUrl.length > MAX_URL_LENGTH) {
      return reject(`連結不可超過 ${MAX_URL_LENGTH} 字元`);
    }
    if (!isHttpUrl(rawUrl)) return reject("連結必須是 http(s) 開頭");
    url = rawUrl;
  }

  // 摘要過長直接截斷（與 create_event 一致：摘要不是主要輸入，不值得擋整列）
  const rawSummary = typeof record.summary === "string" ? record.summary.trim() : "";
  const summary = rawSummary ? rawSummary.slice(0, MAX_SUMMARY_LENGTH) : null;

  return {
    ok: true,
    candidate: {
      line,
      title: rawTitle,
      url,
      summary,
      dedupe_key: dedupeKey(url, rawTitle),
    },
  };
}

/** 既有去重鍵（分批 in）：dedupe_key 含 URL 可能很長，所以每批只帶 20 筆 */
async function loadExistingDedupeKeys(db: Db, keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const batch of chunk([...new Set(keys)], IMPORT_DEDUPE_CHUNK_SIZE)) {
    const { data, error } = await db
      .from("content_hot_events")
      .select("dedupe_key")
      .in("dedupe_key", batch);
    throwDb(error, "查詢既有熱點失敗");
    for (const row of (data ?? []) as { dedupe_key: string | null }[]) {
      if (row.dedupe_key) found.add(row.dedupe_key);
    }
  }
  return found;
}

async function handleImportEvents(
  db: Db,
  body: Record<string, unknown>,
): Promise<SocialImportResult> {
  const rawEvents = body.events;
  if (!Array.isArray(rawEvents)) {
    fail(400, "invalid_events", "缺少 events 陣列（[{ title, url?, summary? }]）");
  }
  const rows: unknown[] = rawEvents;
  if (rows.length === 0) return { inserted: 0, skipped: 0, errors: [] };
  if (rows.length > IMPORT_EVENT_LIMIT) {
    fail(
      400,
      "too_many_events",
      `一次最多匯入 ${IMPORT_EVENT_LIMIT} 筆熱點（本次 ${rows.length} 筆），請分批匯入`,
    );
  }

  const errors: SocialImportError[] = [];
  const candidates: ImportEventCandidate[] = [];
  const seenKeys = new Set<string>();
  let skipped = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const parsed = parseImportEventRow(rows[index], index + 1);
    if (parsed.ok === false) {
      errors.push(parsed.error);
      continue;
    }
    // 同一批裡重複（同 URL 或同標題）只留第一筆：CSV 整段重貼是常態
    if (seenKeys.has(parsed.candidate.dedupe_key)) {
      skipped += 1;
      continue;
    }
    seenKeys.add(parsed.candidate.dedupe_key);
    candidates.push(parsed.candidate);
  }

  let inserted = 0;
  if (candidates.length > 0) {
    const existing = await loadExistingDedupeKeys(
      db,
      candidates.map((candidate) => candidate.dedupe_key),
    );
    // 一次讀齊「最近 14 天有效熱點」當文字去重候選；本批新插入的也會加進來，
    // 所以「同一批 CSV 裡兩則換了寫法的同一件事」同樣擋得住。
    const dedupeCandidates = await loadDedupeCandidates(db);
    const dedupeBudget: DedupeBudget = { remaining: DEDUPE_LLM_BUDGET_IMPORT };

    for (const candidate of candidates) {
      if (existing.has(candidate.dedupe_key)) {
        skipped += 1;
        continue;
      }

      // 文字層去重：同一則新聞換了連結或標題寫法，不應該變成第二個熱點
      const duplicate = await matchDuplicateInList(
        db,
        { title: candidate.title, summary: candidate.summary },
        dedupeCandidates,
        dedupeBudget,
      );
      if (duplicate) {
        skipped += 1;
        continue;
      }

      // 逐列插入：單列 DB 錯誤只影響自己，回報行號比整批 500 有用
      const { data, error } = await db
        .from("content_hot_events")
        .insert({
          title: candidate.title,
          summary: candidate.summary,
          url: candidate.url,
          heat: IMPORT_EVENT_HEAT,
          source: "manual",
          status: "open",
          dedupe_key: candidate.dedupe_key,
        })
        .select("id, title, summary, url, heat, item_ids, status, created_at")
        .single();

      if (!error) {
        inserted += 1;
        if (data) dedupeCandidates.unshift(data as DedupeEventRow);
        continue;
      }
      // 併發匯入撞唯一索引 → 視為已存在（不是錯誤）
      if (isUniqueViolation(error)) {
        skipped += 1;
        continue;
      }
      // 欄位不存在（dedupe_key 的 migration 未推）→ 整批 503，別讓每列都變「錯誤」
      if (SCHEMA_MISSING_CODES.has(String(error.code ?? ""))) {
        throwDb(error, "新增熱點失敗");
      }
      errors.push({
        line: candidate.line,
        title: candidate.title,
        reason: dbError(error),
      });
    }
  }

  return { inserted, skipped, errors };
}

// ============================================================
// 動作：update_post（工作室改稿；PRD §10 審核工作室、執行清單 M4-07）
//
// 只開兩個欄位：title 與 body_md。body_html 一定由共用渲染器重算，
// 前端不必（也不應該）自己送 HTML —— 避免兩份內容不一致。
// ============================================================

async function handleUpdatePost(
  db: Db,
  body: Record<string, unknown>,
): Promise<SocialPostView> {
  const postId = requireUuid(body.post_id, "invalid_post_id", "缺少有效的 post_id");

  const post = await fetchPostRow(db, postId);
  if (!post) fail(404, "post_not_found", "找不到此社媒稿");

  const patchInput = body.patch;
  if (!patchInput || typeof patchInput !== "object" || Array.isArray(patchInput)) {
    fail(400, "invalid_patch", "缺少 patch 物件（{ title?, body_md? }）");
  }
  const patch = patchInput as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if ("title" in patch) {
    const title = asTrimmedString(patch.title);
    if (!title) fail(400, "invalid_title", "稿件標題不可為空");
    if (title.length > MAX_POST_TITLE_LENGTH) {
      fail(400, "invalid_title", `稿件標題不可超過 ${MAX_POST_TITLE_LENGTH} 字`);
    }
    update.title = title;
  }

  if ("body_md" in patch) {
    // 正文保留作者排版，只去頭尾空白（不壓縮換行，否則 Markdown 段落會壞掉）
    const bodyMd = typeof patch.body_md === "string" ? patch.body_md.trim() : "";
    if (!bodyMd) fail(400, "invalid_body", "稿件正文不可為空");
    if (bodyMd.length > MAX_POST_BODY_LENGTH) {
      fail(400, "invalid_body", `稿件正文不可超過 ${MAX_POST_BODY_LENGTH} 字`);
    }
    update.body_md = bodyMd;
    // HTML 與 Markdown 必須同一次寫入：前端拿到的是可直接預覽的 HTML
    update.body_html = renderMarkdownToHtml(bodyMd);
  }

  if (Object.keys(update).length === 0) {
    // 只送 title／body_md，其他欄位一律忽略（不開放改狀態、時間、generator）
    fail(400, "empty_patch", "patch 沒有可更新的欄位（只接受 title／body_md）");
  }

  // 改稿後重算指紋：人工改過的內容不該再被當成「跟原本那篇一樣」
  const nextTitle = typeof update.title === "string" ? update.title : post.title;
  const nextBody = typeof update.body_md === "string" ? update.body_md : post.body_md;
  update.content_fingerprint = contentFingerprint(nextTitle, nextBody);

  const { data, error } = await db
    .from("content_social_posts")
    .update(update)
    .eq("id", postId)
    .select("*")
    .maybeSingle();
  if (error && SCHEMA_MISSING_CODES.has(String((error as { code?: string }).code ?? ""))) {
    // content_fingerprint 的 migration 未推：退回不帶指紋的更新
    delete update.content_fingerprint;
    const fallback = await db
      .from("content_social_posts")
      .update(update)
      .eq("id", postId)
      .select("*")
      .maybeSingle();
    throwDb(fallback.error, "更新社媒稿失敗");
    if (!fallback.data) fail(404, "post_not_found", "找不到此社媒稿");
    const [view] = await hydratePosts(db, [fallback.data as SocialPostRow]);
    return view;
  }
  throwDb(error, "更新社媒稿失敗");
  if (!data) fail(404, "post_not_found", "找不到此社媒稿");

  // 沿用列表的組裝方式（組名／熱點標題／各帳號導流都補齊），前端可原地換掉這張卡
  const [view] = await hydratePosts(db, [data as SocialPostRow]);
  return view;
}

// ============================================================
// 動作：update_target（工作室改單一帳號的導流文案；M4-07）
//
// 導流文案是按帳號存的（同平台共用內容，但每個帳號可以各自微調，
// 例如換 hashtag 或加 @ 提及）。
// ============================================================

async function handleUpdateTarget(
  db: Db,
  body: Record<string, unknown>,
): Promise<SocialTargetView> {
  const targetId = requireUuid(body.target_id, "invalid_target_id", "缺少有效的 target_id");
  const copyText = asTrimmedString(body.copy_text);
  if (!copyText) fail(400, "invalid_copy_text", "導流文案不可為空");
  if (copyText.length > MAX_TARGET_COPY_LENGTH) {
    fail(400, "invalid_copy_text", `導流文案不可超過 ${MAX_TARGET_COPY_LENGTH} 字`);
  }

  const { data, error } = await db
    .from("content_social_targets")
    .update({ copy_text: copyText })
    .eq("id", targetId)
    .select("*")
    .maybeSingle();
  throwDb(error, "更新導流文案失敗");
  if (!data) fail(404, "target_not_found", "找不到此導流目標");

  // 平台／handle／顯示名由帳號表補上（targets 只存文案與狀態）
  const accountsById = await loadAccountMap(db);
  return toTargetView(data as SocialTargetRow, accountsById);
}

// ============================================================
// 動作：schedule_post（日曆排期／取消排期；PRD §10 審核／看板／日曆、M4-08）
//
// 狀態機（只有這兩種狀態可以動時間，其餘 409 invalid_transition）：
//   approved  + 有時間 → scheduled（approved_at 不動）
//   scheduled + 有時間 → scheduled（改時間）
//   scheduled + null  → approved（取消排期，回到待發佈）
//   approved  + null  → approved（冪等）
// 過去的時間不擋：auto_tick 每 2 分鐘會把到期的稿件推進 publishing。
// ============================================================

async function handleSchedulePost(
  db: Db,
  body: Record<string, unknown>,
): Promise<SocialPostView> {
  const postId = requireUuid(body.post_id, "invalid_post_id", "缺少有效的 post_id");

  const post = await fetchPostRow(db, postId);
  if (!post) fail(404, "post_not_found", "找不到此社媒稿");
  if (!SCHEDULABLE_STATUSES.has(post.status)) {
    fail(
      409,
      "invalid_transition",
      `稿件目前狀態（${post.status}）不可排期，只有已批准（approved）或已排期（scheduled）可以調整`,
    );
  }

  // scheduled_at 只接受 ISO 字串或 null；數字／物件直接擋掉，
  // 免得「送錯型別」被當成「取消排期」默默生效
  const rawScheduledAt = body.scheduled_at;
  if (
    rawScheduledAt !== undefined &&
    rawScheduledAt !== null &&
    typeof rawScheduledAt !== "string"
  ) {
    fail(400, "invalid_scheduled_at", "scheduled_at 必須是 ISO 時間字串或 null");
  }

  const scheduledAt = parseOptionalDateTime(
    body.scheduled_at,
    "scheduled_at",
    "invalid_scheduled_at",
  );

  const update: Record<string, unknown> = { scheduled_at: scheduledAt };
  if (scheduledAt) {
    // 批准後第一次排期 → 進 scheduled，讓看板「已排期」與 tick 的推進條件一致
    if (post.status === "approved") update.status = "scheduled";
  } else if (post.status === "scheduled") {
    // 取消排期 → 回 approved（不能留在 scheduled 而沒有時間，tick 會永遠等不到）
    update.status = "approved";
  }

  const { data, error } = await db
    .from("content_social_posts")
    .update(update)
    .eq("id", postId)
    .select("*")
    .maybeSingle();
  throwDb(error, "更新稿件排期失敗");
  if (!data) fail(404, "post_not_found", "找不到此社媒稿");

  const [view] = await hydratePosts(db, [data as SocialPostRow]);
  return view;
}

// ============================================================
// 動作：social_package（手動發佈包；PRD §9.3.5 內容包、§10 發佈、M4-09）
//
// 為什麼要產包：v1 不呼叫 Meta／Threads／IG API（PRD §1.3 非目標），
// 所以「一鍵發佈」實際上是「一鍵打包 + 人工貼上 + 回 MPS 標記已發」。
// zip 內容（刻意只放文字，圖片由平台端決定）：
//   article.md      站內長文原稿
//   meta.json       post_id／event_title／group_name／title／scheduled_at／status／platforms
//   copies/*.txt    各平台文案（同平台多帳號共用一份，檔名 = 平台）
//   README.txt      人工發佈步驟
// 上傳 content-assets（private）→ 簽 1 小時下載連結 → 寫 content_publish_logs。
// ============================================================

/** 一個平台一份文案（PRD §10：同平台多帳號共用同一份） */
interface PlatformCopy {
  /** DB 內的 platform 值（instagram／threads／…），回執與 meta.json 用 */
  platform: string;
  /** 顯示名（Instagram／小紅書…），給人看的 */
  label: string;
  /** copies/<fileKey>.txt 的檔名：一律 ASCII，避免中文檔名在解壓工具亂碼 */
  fileKey: string;
  accounts: SocialTargetView[];
  copy_text: string;
}

interface SocialPackageMeta {
  post_id: string;
  event_title: string | null;
  group_name: string | null;
  title: string;
  scheduled_at: string | null;
  status: string;
  platforms: string[];
}

interface SocialPackageResult {
  filename: string;
  package_path: string;
  signed_url: string;
}

interface PackageFile {
  path: string;
  content: string;
}

interface PackageReadmeInput {
  title: string;
  groupName: string | null;
  eventTitle: string | null;
  scheduledAt: string | null;
  status: string;
  generatedAt: string;
  copies: PlatformCopy[];
}

/** 平台還沒有文案時的佔位：不要給空檔案，也不要拿整篇長文冒充導流文案 */
const PACKAGE_EMPTY_COPY_NOTE = "（此平台尚未有導流文案，請先回 MPS 工作室補上再重新產包）";

/** 平台 → 檔名安全的鍵（copies/<fileKey>.txt） */
function platformFileKey(platform: string): string {
  const key = (platform || "other")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || "other";
}

/** 撞名（自訂平台值只差符號）時補序號，保證 zip 內不會有同名檔案 */
function uniqueFileKey(base: string, used: Set<string>): string {
  let key = base || "other";
  let suffix = 2;
  while (used.has(key)) {
    key = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

/** 帳號顯示：@handle（顯示名）—— 貼文的人要一眼知道用哪個帳號 */
function accountLine(target: SocialTargetView): string {
  const handle = target.handle ? `@${target.handle}` : target.account_id.slice(0, 8);
  return target.display_name ? `${handle}（${target.display_name}）` : handle;
}

/** 依平台分組：同平台共用一份文案，平台順序與看板／工作室一致 */
function groupPlatformCopies(targets: SocialTargetView[], fallbackCopy: string): PlatformCopy[] {
  const byPlatform = new Map<string, SocialTargetView[]>();
  for (const target of targets) {
    const platform = target.platform || "other";
    const list = byPlatform.get(platform) ?? [];
    list.push(target);
    byPlatform.set(platform, list);
  }

  const usedFileKeys = new Set<string>();
  const copies: PlatformCopy[] = [];
  for (const [platform, list] of byPlatform) {
    const accounts = sortTargetViews(list);
    // 同平台共用一份：取第一個有內容的文案，個別帳號被清空時不會讓整份檔案變空
    const copyText =
      accounts
        .map((account) => (account.copy_text || "").trim())
        .find((text) => text.length > 0) ?? fallbackCopy;
    copies.push({
      platform,
      label: socialPlatformLabel(platform),
      fileKey: uniqueFileKey(platformFileKey(platform), usedFileKeys),
      accounts,
      copy_text: copyText,
    });
  }

  return copies.sort(
    (left, right) => platformOrder(left.platform) - platformOrder(right.platform),
  );
}

/**
 * copies/<platform>.txt：第 1 行平台、第 2 行帳號清單、空行、文案。
 * 固定順序讓「複製 → 貼上」的人不用判斷哪裡開始是正文。
 */
function copyFileContent(copy: PlatformCopy): string {
  const accounts =
    copy.accounts.length > 0
      ? copy.accounts.map(accountLine).join("、")
      : "（尚未綁定帳號）";
  return `平台：${copy.label}\n帳號：${accounts}\n\n${copy.copy_text}\n`;
}

/** README.txt：人工發佈步驟（照著做就能完成一次發佈，不必回文件查） */
function buildPackageReadme(input: PackageReadmeInput): string {
  const lines: string[] = [
    `MPS 社媒手動發佈包 · ${input.title}`,
    "",
    `產生時間：${input.generatedAt}`,
    `品牌組：${input.groupName ?? "（未指定）"}`,
    `熱點：${input.eventTitle ?? "（未指定）"}`,
    `排期：${input.scheduledAt ?? "（未排期）"}`,
    `稿件狀態：${input.status}`,
    "",
    "── 檔案說明 ─────────────",
    "article.md      站內長文原稿（Markdown）",
    "meta.json       本次發佈包摘要（post_id／平台／排期／狀態）",
    "copies/*.txt    各平台文案；檔名就是平台，同一平台多帳號共用一份",
    "",
    "── 人工發佈步驟 ─────────",
    "1. 打開 copies/ 內對應平台的 .txt：第 1 行是平台、第 2 行是要使用的帳號清單。",
    "2. 複製空行之後的文案，貼到該平台（app 或網頁），用清單上的每個帳號各發一次。",
    "3. 需要導流時，把 article.md 的內容發成站內文章，並在文案補上連結。",
    "4. 發佈完成後回到 MPS：社媒 → 工作室選這篇稿，逐個帳號按「標記已發」並貼上平台連結。",
    "5. 所有帳號都標記已發後，稿件狀態會自動變成 published（看板與日曆同步）。",
    "",
  ];

  if (input.copies.length > 0) {
    lines.push("── 平台清單 ─────────────");
    for (const copy of input.copies) {
      lines.push(
        `${copy.label}（copies/${copy.fileKey}.txt）：${copy.accounts.map(accountLine).join("、")}`,
      );
    }
    lines.push("");
  }

  lines.push(
    "※ 本包只交付文案，不含圖片；平台貼文若需要圖片請自行上傳。",
    "※ v1 不呼叫平台 API，發佈一律人工完成（PRD §1.3 刻意不做）。",
  );
  return lines.join("\n");
}

/** 檔名用的香港時間戳：yyyyMMdd-HHmm（與看板／日報同一時區，避免 UTC 跨日誤導） */
function hktStamp(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? "00";
  // 部分 ICU 在午夜回 "24"（不是 "00"），檔名會變成 24xx 讓人誤解，這裡收斂
  const hour = read("hour") === "24" ? "00" : read("hour");
  return `${read("year")}${read("month")}${read("day")}-${hour}${read("minute")}`;
}

/**
 * 檔名 slug：標題的前 20 個英數字（中文不進檔名，避免 URL／zip 亂碼）；
 * 全部被濾掉時退回 post id 前 8 碼（一定是 ASCII，保證檔名可用）。
 */
function packageSlug(title: string, postId: string): string {
  const alnum = (title || "").replace(/[^A-Za-z0-9]/g, "");
  if (alnum.length > 0) return alnum.slice(0, PACKAGE_SLUG_LENGTH);
  const fallback = postId.replace(/-/g, "").slice(0, PACKAGE_SLUG_FALLBACK_LENGTH);
  return fallback || "post";
}

async function zipPackageFiles(files: PackageFile[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.content);
  try {
    return await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  } catch (error) {
    fail(500, "package_failed", `產生內容包失敗：${errorMessage(error)}`);
  }
}

/**
 * 產包回執：content_publish_logs 是通用表，social 沒有站點／文章，
 * site_id 與 article_id 一律 null（前端以 request.post_id 對回社媒稿）。
 * 寫入失敗不影響已產好的包，只記 warning（與 content-publish 的處理一致）。
 */
async function writeSocialPackageLog(
  db: Db,
  input: {
    postId: string;
    actorId: string | null;
    filename: string;
    bytes: number;
    platforms: string[];
  },
): Promise<void> {
  const { error } = await db.from("content_publish_logs").insert({
    site_id: null,
    article_id: null,
    action: "package",
    request: { post_id: input.postId },
    response: {
      filename: input.filename,
      bytes: input.bytes,
      platforms: input.platforms,
    },
    // 人工可能重複產包，每次都要留一筆 → 冪等鍵帶毫秒時間戳
    idempotency_key: `social-package:${input.postId}:${Date.now()}`,
    actor_id: input.actorId,
  });
  if (!error) return;
  // 同一毫秒重複（幾乎不可能）視為已記；其他錯誤只記錄，不讓產包失敗
  if (isUniqueViolation(error)) return;
  console.warn(
    `[content-social] 寫入產包回執失敗（post ${input.postId}）：${dbError(error)}`,
  );
}

async function handleSocialPackage(
  db: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<SocialPackageResult> {
  const postId = requireUuid(body.post_id, "invalid_post_id", "缺少有效的 post_id");

  const post = await fetchPostRow(db, postId);
  if (!post) fail(404, "post_not_found", "找不到此社媒稿");

  const [groupsById, accountsById, eventsById, targetsByPost] = await Promise.all([
    loadGroupMap(db),
    loadAccountMap(db),
    loadEventMap(db, post.event_id ? [post.event_id] : []),
    loadTargetsByPost(db, [postId]),
  ]);

  const group = post.group_id ? groupsById.get(post.group_id) ?? null : null;
  const event = post.event_id ? eventsById.get(post.event_id) ?? null : null;
  const targetRows = targetsByPost.get(postId) ?? [];
  const targets = sortTargetViews(
    targetRows.map((row) => toTargetView(row, accountsById)),
  );

  // 標題一律有值（稿件沒標題時退回熱點標題），否則 zip 內的檔頭會是空的
  const title =
    (post.title || "").trim() || (event?.title || "").trim() || "未命名社媒稿";
  const copies = groupPlatformCopies(targets, PACKAGE_EMPTY_COPY_NOTE);
  const platforms = copies.map((copy) => copy.platform);
  const generatedAt = nowIso();

  const meta: SocialPackageMeta = {
    post_id: post.id,
    event_title: event?.title ?? null,
    // 一個事件一篇稿之後，稿件服務所有品牌組（group_id 為 null）
    group_name: group?.name ?? (post.event_id ? "全品牌組" : null),
    title,
    scheduled_at: post.scheduled_at ?? null,
    status: post.status,
    platforms,
  };

  const files: PackageFile[] = [
    { path: "article.md", content: `# ${title}\n\n${(post.body_md || "").trim()}\n` },
    { path: "meta.json", content: `${JSON.stringify(meta, null, 2)}\n` },
    ...copies.map((copy) => ({
      path: `copies/${copy.fileKey}.txt`,
      content: copyFileContent(copy),
    })),
    {
      path: "README.txt",
      content: buildPackageReadme({
        title,
        groupName: group?.name ?? null,
        eventTitle: event?.title ?? null,
        scheduledAt: post.scheduled_at ?? null,
        status: post.status,
        generatedAt,
        copies,
      }),
    },
  ];

  const zipBytes = await zipPackageFiles(files);
  const filename = `${hktStamp()}-${packageSlug(title, post.id)}.zip`;
  const storagePath = `${SOCIAL_PACKAGE_PREFIX}/${post.id}/${filename}`;

  const { error: uploadError } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, zipBytes, { contentType: "application/zip", upsert: true });
  if (uploadError) {
    fail(502, "package_upload_failed", `內容包上傳失敗：${dbError(uploadError)}`);
  }

  const { data: signed, error: signedError } = await db.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signedError || !signed?.signedUrl) {
    fail(
      502,
      "signed_url_failed",
      `內容包已上傳，但無法建立下載連結：${
        signedError ? dbError(signedError) : "Storage 未回傳連結"
      }`,
    );
  }

  await writeSocialPackageLog(db, {
    postId: post.id,
    actorId: actorUserId(actor),
    filename,
    bytes: zipBytes.byteLength,
    platforms,
  });

  return {
    filename,
    package_path: storagePath,
    signed_url: signed.signedUrl,
  };
}

// ============================================================
// 動作：平台 OAuth 登入（Meta／Threads／Google-YouTube）
//
// 流程：
//   1. 前端 oauth_start → 建一次性 state（綁定帳號＋登入者）→ 回授權 URL
//   2. 使用者在平台授權 → 導回 <origin>/social-oauth-callback?code=&state=
//   3. callback 頁呼叫 oauth_callback → 換 token → AES 加密落庫 → 回非機密摘要
//
// client secret 只存在 Edge Function 環境變數，永不進前端。
// 小紅書／其他平台沒有公開 OAuth → 明確回 oauth_unsupported（用手動憑證）。
// ============================================================

const OAUTH_STATE_TTL_MINUTES = 10;
const OAUTH_HTTP_TIMEOUT_MS = 20_000;

/** 每個 provider 讀哪些環境變數；primary 是回報缺失時顯示的名字 */
const OAUTH_ENV: Record<SocialOAuthProvider, { id: string[]; secret: string[]; primary: [string, string] }> = {
  meta: {
    id: ['META_APP_ID'],
    secret: ['META_APP_SECRET'],
    primary: ['META_APP_ID', 'META_APP_SECRET'],
  },
  threads: {
    id: ['THREADS_APP_ID'],
    secret: ['THREADS_APP_SECRET'],
    primary: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  },
  google: {
    id: ['GOOGLE_OAUTH_CLIENT_ID'],
    secret: ['GOOGLE_OAUTH_CLIENT_SECRET'],
    primary: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
  },
};

interface OAuthRuntime {
  provider: SocialOAuthProvider;
  label: string;
  platforms: string[];
  scopes: string[];
  note: string;
  clientId: string | null;
  clientSecret: string | null;
  missing: string[];
}

function firstEnvValue(names: readonly string[]): string | null {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return null;
}

function oauthRuntime(provider: SocialOAuthProvider): OAuthRuntime {
  const def = SOCIAL_OAUTH_PROVIDERS[provider];
  const env = OAUTH_ENV[provider];
  const clientId = firstEnvValue(env.id);
  const clientSecret = firstEnvValue(env.secret);
  const missing: string[] = [];
  if (!clientId) missing.push(env.primary[0]);
  if (!clientSecret) missing.push(env.primary[1]);
  return {
    provider,
    label: def.label,
    platforms: def.platforms,
    scopes: def.scopes,
    note: def.note,
    clientId,
    clientSecret,
    missing,
  };
}

function expiresInToIso(seconds: unknown): string | null {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(Date.now() + value * 1_000).toISOString();
}

function resolveOAuthOrigin(body: Record<string, unknown>): string {
  const requested = asTrimmedString(body.return_origin);
  if (requested && isAllowedSocialOAuthOrigin(requested)) return requested.replace(/\/+$/, '');
  const fromEnv = Deno.env.get('APP_PUBLIC_URL')?.trim() || CANONICAL_SITE_URL;
  return fromEnv.replace(/\/+$/, '');
}

function buildOAuthAuthorizeUrl(
  provider: SocialOAuthProvider,
  runtime: OAuthRuntime,
  state: string,
  redirectUri: string,
): string {
  const def = SOCIAL_OAUTH_PROVIDERS[provider];
  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: String(runtime.clientId),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: def.scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  const params = new URLSearchParams({
    client_id: String(runtime.clientId),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: def.scopes.join(','),
    state,
  });
  if (provider === 'threads') {
    return `https://threads.net/oauth/authorize?${params.toString()}`;
  }
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

async function fetchOAuthJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OAUTH_HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...(init || {}), signal: controller.signal });
    const text = await response.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }
    if (!response.ok) {
      const detail =
        (json.error_description as string | undefined) ||
        ((json.error as Record<string, unknown> | undefined)?.message as string | undefined) ||
        (typeof json.error === 'string' ? json.error : '') ||
        `HTTP ${response.status}`;
      throw new Error(String(detail));
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** 用授權碼換 token；回傳加密前的 secret 與到期日（refresh token 視為長效） */
async function exchangeOAuthCode(
  provider: SocialOAuthProvider,
  runtime: OAuthRuntime,
  code: string,
  redirectUri: string,
): Promise<{ secret: string; expiresAt: string | null }> {
  if (provider === 'google') {
    const body = new URLSearchParams({
      code,
      client_id: String(runtime.clientId),
      client_secret: String(runtime.clientSecret),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const json = await fetchOAuthJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const accessToken = String(json.access_token || '');
    if (!accessToken) throw new Error('Google 沒有回傳 access_token');
    const refreshToken = typeof json.refresh_token === 'string' ? json.refresh_token : null;
    return {
      secret: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: typeof json.token_type === 'string' ? json.token_type : 'Bearer',
      }),
      // 有 refresh token 代表可長期續期；沒有就照 access token 壽命
      expiresAt: refreshToken ? null : expiresInToIso(json.expires_in),
    };
  }

  if (provider === 'threads') {
    const body = new URLSearchParams({
      client_id: String(runtime.clientId),
      client_secret: String(runtime.clientSecret),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });
    const json = await fetchOAuthJson('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const shortToken = String(json.access_token || '');
    if (!shortToken) throw new Error('Threads 沒有回傳 access_token');
    try {
      const longParams = new URLSearchParams({
        grant_type: 'th_exchange_token',
        client_secret: String(runtime.clientSecret),
        access_token: shortToken,
      });
      const longJson = await fetchOAuthJson(`https://graph.threads.net/access_token?${longParams.toString()}`);
      return {
        secret: String(longJson.access_token || shortToken),
        expiresAt: expiresInToIso(longJson.expires_in ?? json.expires_in),
      };
    } catch {
      return { secret: shortToken, expiresAt: expiresInToIso(json.expires_in) };
    }
  }

  // Meta（Facebook／Instagram）：短效 token → 長效 token
  const exchangeParams = new URLSearchParams({
    client_id: String(runtime.clientId),
    client_secret: String(runtime.clientSecret),
    redirect_uri: redirectUri,
    code,
  });
  const json = await fetchOAuthJson(
    `https://graph.facebook.com/v21.0/oauth/access_token?${exchangeParams.toString()}`,
  );
  const shortToken = String(json.access_token || '');
  if (!shortToken) throw new Error('Meta 沒有回傳 access_token');
  try {
    const longParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: String(runtime.clientId),
      client_secret: String(runtime.clientSecret),
      fb_exchange_token: shortToken,
    });
    const longJson = await fetchOAuthJson(
      `https://graph.facebook.com/v21.0/oauth/access_token?${longParams.toString()}`,
    );
    return {
      secret: String(longJson.access_token || shortToken),
      expiresAt: expiresInToIso(longJson.expires_in ?? json.expires_in),
    };
  } catch {
    return { secret: shortToken, expiresAt: expiresInToIso(json.expires_in) };
  }
}

/** oauth_providers：回各平台是否已設定（缺哪些 secrets） */
async function handleOAuthProviders(): Promise<unknown> {
  const providers = (Object.keys(SOCIAL_OAUTH_PROVIDERS) as SocialOAuthProvider[]).map((provider) => {
    const runtime = oauthRuntime(provider);
    return {
      provider,
      label: runtime.label,
      configured: runtime.missing.length === 0,
      missing_env: runtime.missing,
      platforms: runtime.platforms,
      note: runtime.note,
    };
  });
  return { providers };
}

/** oauth_start：建一次性 state，回平台授權 URL */
async function handleOAuthStart(
  db: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<unknown> {
  const accountId = requireUuid(body.account_id, 'invalid_account_id', '缺少有效的 account_id');
  const account = await fetchCredentialAccount(db, accountId);
  if (!account) fail(404, 'account_not_found', '找不到此社群帳號');

  const provider = oauthProviderForPlatform(account.platform);
  if (!provider) {
    fail(
      400,
      'oauth_unsupported',
      `${account.platform} 沒有公開 OAuth；請在「登入憑證」手動貼上 access token／應用程式密碼`,
    );
  }
  const runtime = oauthRuntime(provider);
  if (runtime.missing.length > 0) {
    fail(
      503,
      'oauth_not_configured',
      `缺少 ${runtime.missing.join('／')}，尚未設定 ${runtime.label} OAuth`,
      { provider, missing_env: runtime.missing, note: runtime.note },
    );
  }
  if (!vaultConfigured()) {
    fail(503, 'vault_not_configured', 'CONTENT_VAULT_KEY 未設定，無法加密授權結果');
  }

  const origin = resolveOAuthOrigin(body);
  const redirectUri = socialOAuthRedirectUri(origin);
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MINUTES * 60_000).toISOString();

  // 清掉一天前的舊 state（best effort，失敗不影響本次授權）
  await db
    .from('content_social_oauth_states')
    .delete()
    .lt('expires_at', new Date(Date.now() - 86_400_000).toISOString());

  const { data: stateRow, error: stateError } = await db
    .from('content_social_oauth_states')
    .insert({
      account_id: accountId,
      provider,
      user_id: actorUserId(actor),
      redirect_uri: redirectUri,
      return_origin: origin,
      expires_at: expiresAt,
    })
    .select('state')
    .single();
  throwDb(stateError, '建立 OAuth state 失敗');

  const state = String((stateRow as { state: string }).state);
  return {
    provider,
    provider_label: runtime.label,
    authorization_url: buildOAuthAuthorizeUrl(provider, runtime, state, redirectUri),
    state,
    redirect_uri: redirectUri,
    expires_at: expiresAt,
    expires_minutes: OAUTH_STATE_TTL_MINUTES,
  };
}

/** oauth_callback：驗證 state → 換 token → 加密落庫 */
async function handleOAuthCallback(
  db: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
): Promise<unknown> {
  const code = asTrimmedString(body.code);
  if (!code) fail(400, 'missing_code', '缺少平台授權碼（code）');
  const stateId = requireUuid(body.state, 'invalid_state', '缺少有效的 state');

  // 先原子領取 state（used_at 由 null → now），避免同一個 code 被重放
  const { data: claimed, error: claimError } = await db
    .from('content_social_oauth_states')
    .update({ used_at: nowIso() })
    .eq('state', stateId)
    .is('used_at', null)
    .select('*')
    .maybeSingle();
  throwDb(claimError, '領取 OAuth state 失敗');
  if (!claimed) fail(409, 'oauth_state_invalid', '授權連結已使用或不存在，請重新按「平台登入」');

  const state = claimed as {
    state: string;
    account_id: string;
    provider: SocialOAuthProvider;
    user_id: string | null;
    redirect_uri: string;
  };

  if (new Date(String((claimed as { expires_at?: string }).expires_at || 0)).getTime() < Date.now()) {
    await db.from('content_social_oauth_states').update({ error: 'expired' }).eq('state', stateId);
    fail(400, 'oauth_state_expired', '授權逾時（10 分鐘），請重新按「平台登入」');
  }
  if (state.user_id && actor.kind === 'user' && actor.userId !== state.user_id) {
    fail(403, 'oauth_state_mismatch', '此授權連結不屬於目前登入者，請重新登入');
  }

  const provider = state.provider;
  if (!SOCIAL_OAUTH_PROVIDERS[provider]) fail(400, 'oauth_unsupported', '未知的 OAuth provider');
  const runtime = oauthRuntime(provider);
  if (runtime.missing.length > 0) {
    fail(503, 'oauth_not_configured', `缺少 ${runtime.missing.join('／')}`, {
      provider,
      missing_env: runtime.missing,
    });
  }

  try {
    const token = await exchangeOAuthCode(provider, runtime, code, state.redirect_uri);
    const stored = await persistCredential(db, state.account_id, token.secret, token.expiresAt, 'oauth_token');
    await db.from('content_social_oauth_states').update({ error: null }).eq('state', stateId);
    return { ...stored, provider, provider_label: runtime.label, account_id: state.account_id };
  } catch (error) {
    const message = errorMessage(error);
    await db
      .from('content_social_oauth_states')
      .update({ error: message.slice(0, 500) })
      .eq('state', stateId);
    if (error instanceof SocialHttpError) throw error;
    fail(502, 'oauth_exchange_failed', `平台授權失敗：${message}`);
  }
}

async function handleAutopilotStatus(db: Db): Promise<AutopilotStatus> {
  return loadAutopilot(db);
}

async function handleSetAutopilot(
  db: Db,
  body: Record<string, unknown>,
): Promise<AutopilotStatus> {
  const enabled = body.enabled === true;
  return saveAutopilot(db, enabled);
}

// ============================================================
// 動作：delivery（手機交付頁資料；只讀）
//
// 半自動交付（C）：不呼叫任何平台 API，只把「各平台文案 + 帳號 + 封面簽名 URL + 已發狀態」
// 整理成手機可用的交付頁；按「標記已發」仍走既有 mark action（不改審核／排期）。
// ============================================================

async function handleDelivery(db: Db, body: Record<string, unknown>): Promise<unknown> {
  const postId = requireUuid(body.post_id, "invalid_post_id", "缺少有效的 post_id");
  const post = await fetchPostRow(db, postId);
  if (!post) fail(404, "post_not_found", "找不到此社媒稿");

  const targetsByPost = await loadTargetsByPost(db, [postId]);
  const [groupsById, accountsById, eventsById] = await Promise.all([
    loadGroupMap(db),
    loadAccountMap(db),
    loadEventMap(db, post.event_id ? [post.event_id] : []),
  ]);
  const view = toPostView(
    post,
    groupsById,
    eventsById,
    accountsById,
    targetsByPost.get(postId) ?? [],
  );

  let coverUrl: string | null = null;
  const coverAssetId = post.cover_asset_id ?? null;
  if (coverAssetId) {
    const { data: asset } = await db
      .from("content_assets")
      .select("bucket, storage_path")
      .eq("id", coverAssetId)
      .maybeSingle();
    if (asset) {
      const bucket = String((asset as { bucket?: string }).bucket || "content-assets");
      const path = String((asset as { storage_path?: string }).storage_path || "");
      if (path) {
        const { data: signed } = await db.storage.from(bucket).createSignedUrl(path, 3600);
        coverUrl = signed?.signedUrl ?? null;
      }
    }
  }

  return {
    post: { ...view, cover_asset_id: coverAssetId, cover_url: coverUrl },
    generated_at: nowIso(),
  };
}

// ============================================================
// 入口
// ============================================================

type ActionHandler = (
  db: Db,
  actor: ContentActor,
  body: Record<string, unknown>,
) => Promise<unknown>;

/** 每個 action 對應的權限（PRD §11：寫入前一律重算，不信任前端） */
const ACTION_PERMISSIONS: Record<string, ContentAction> = {
  list: "view",
  create_event: "write",
  generate_now: "write",
  review: "approve",
  mark: "write",
  // 半自動交付頁：只讀，不改狀態；標記已發仍走 mark
  delivery: "view",
  save_credential: "write",
  clear_credential: "write",
  diagnose_credentials: "write",
  // M4-03：各平台 OAuth 登入（state 讀取 view；發起與回呼寫入 write）
  oauth_providers: "view",
  oauth_start: "write",
  oauth_callback: "write",
  // M4-04：熱點匯入是資料寫入（copywriter 以上）
  import_events: "write",
  // M4-07：改標題／正文與排期都算定稿動作，跟批准同一級（chief_editor 以上）
  update_post: "approve",
  // M4-07：單一帳號的導流文案屬一般編輯
  update_target: "write",
  // M4-08：排期會決定「什麼時候發出去」，視同批准
  schedule_post: "approve",
  // M4-09：發佈包是對外交付物，視同批准
  social_package: "approve",
  // 自動營運總開關：讀取 view、切換只有管理層
  autopilot_status: "view",
  set_autopilot: "manage_settings",
};

const ACTION_HANDLERS: Record<string, ActionHandler> = {
  list: (db, _actor, body) => handleList(db, body),
  create_event: (db, _actor, body) => handleCreateEvent(db, body),
  generate_now: (db, _actor, body) => handleGenerateNow(db, body),
  review: (db, actor, body) => handleReview(db, actor, body),
  mark: (db, _actor, body) => handleMark(db, body),
  delivery: (db, _actor, body) => handleDelivery(db, body),
  save_credential: (db, _actor, body) => handleSaveCredential(db, body),
  clear_credential: (db, _actor, body) => handleClearCredential(db, body),
  diagnose_credentials: (db, _actor, body) => handleDiagnoseCredentials(db, body),
  oauth_providers: () => handleOAuthProviders(),
  oauth_start: (db, actor, body) => handleOAuthStart(db, actor, body),
  oauth_callback: (db, actor, body) => handleOAuthCallback(db, actor, body),
  import_events: (db, _actor, body) => handleImportEvents(db, body),
  update_post: (db, _actor, body) => handleUpdatePost(db, body),
  update_target: (db, _actor, body) => handleUpdateTarget(db, body),
  schedule_post: (db, _actor, body) => handleSchedulePost(db, body),
  social_package: (db, actor, body) => handleSocialPackage(db, actor, body),
  autopilot_status: (db) => handleAutopilotStatus(db),
  set_autopilot: (db, _actor, body) => handleSetAutopilot(db, body),
  auto_tick: (db) => handleAutoTick(db),
  dedupe_cleanup: (db, _actor, body) => handleDedupeCleanup(db, body),
  llm_check: (_db, _actor, body) => handleLlmCheck(body),
};

/**
 * action 來源：前端一律放 body.action；
 * cron（migration 20261126120000 的 content-social-tick）是 `?action=auto_tick` 且 body 為空，
 * 所以 query 優先，body 兜底。
 */
function readAction(req: Request, body: Record<string, unknown>): string {
  const fromQuery = new URL(req.url).searchParams.get("action");
  const action = asTrimmedString(fromQuery) ?? asTrimmedString(body.action);
  if (!action) fail(400, "unknown_action", "缺少 action");
  return action;
}

/** 只認白名單自己的鍵，避免 'constructor' / 'toString' 之類的原型屬性被當成 action */
function ownEntry<T>(map: Record<string, T>, key: string): T | null {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

Deno.serve(async (req: Request) => {
  const methodGuard = guardMethod(req);
  if (methodGuard) return methodGuard;

  // 1) 身分：cron 帶 service_role bearer，其餘為登入使用者 JWT
  let actor: ContentActor | null = null;
  try {
    const actorResult = await requireActor(req);
    if (actorResult.response) return actorResult.response;
    actor = actorResult.actor ?? null;
  } catch (error) {
    return failJson(401, "invalid_session", errorMessage(error));
  }
  if (!actor) return failJson(401, "invalid_session", "Invalid session");

  const body = await readBody<Record<string, unknown>>(req);

  let db: Db;
  try {
    db = serviceClient();
  } catch (error) {
    return failJson(500, "config_missing", errorMessage(error));
  }

  try {
    const action = readAction(req, body);

    const handler = ownEntry(ACTION_HANDLERS, action);
    if (!handler) fail(400, "unknown_action", `未知的動作：${action}`);

    // 2) 權限：auto_tick 只准 service_role；其餘依 action 查角色權限
    if (SERVICE_ACTIONS.has(action)) {
      const denied = requireServiceRole(req);
      if (denied) return denied;
    } else {
      const permission = ownEntry(ACTION_PERMISSIONS, action);
      if (!permission) fail(400, "unknown_action", `未知的動作：${action}`);
      const denied = requireAction(actor, permission);
      if (denied) return denied;
    }

    const data = await handler(db, actor, body);
    return okJson(data);
  } catch (error) {
    if (error instanceof SocialHttpError) {
      return failJson(error.status, error.code, error.message, error.details);
    }
    // 外部／DB 錯誤一律收斂成 5xx，不得拋未捕捉
    console.error("[content-social] unhandled error:", error);
    return failJson(500, "internal_error", "處理請求時發生未預期的錯誤");
  }
});
