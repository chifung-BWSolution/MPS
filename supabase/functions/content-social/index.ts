import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
import {
  composeLongform,
  composeSocial,
  nextPublishAtHkt,
  platformOrder,
  type ComposedLongform,
} from "../../../src/lib/contentSocialGenerate.ts";
import {
  composeWithGrok,
  grokConfigured,
  grokModel,
  listGrokModels,
  type SocialLlmResult,
} from "../_shared/contentSocialLlm.ts";
import {
  CONTENT_NOT_ENABLED_MESSAGE,
  type ContentAction,
} from "../../../src/lib/contentTypes.ts";

/**
 * content-social｜社媒自動營運 v0（熱點 → 1 篇長文 + 每平台每帳號一條導流）
 *
 * 這一版把最小鏈路打通：熱點 → 產稿 → 審核 → 排期／標記已發，並自動推進。
 * 文案預設用 **Grok（xAI）** 生成；沒有 key、超時或格式錯誤時自動退回模板，
 * 所以「模型壞了」不會讓整條自動化停擺（稿件會標 generator 區分來源）。
 *
 * actions（全部 POST JSON body；回應一律 { ok, data } / { ok:false, code, error }）：
 *   list          view     今日看板：統計 + 熱點 + 稿件（含各帳號導流）+ 組 + 帳號
 *   create_event  write    貼一個熱點 → 立即為所有 active 組產批次（1 長文 + N 導流）
 *   generate_now  write    對指定熱點補產「還缺批次」的組
 *   review        approve  decision=approve → approved + scheduled_at；decision=reject → changes_requested
 *   mark          write    標記某條導流（或整批）已發佈，並自動推進稿件狀態
 *   auto_tick     service  cron 每 2 分鐘：推進到期稿件 + 自動掃描 7 天內新熱點產稿
 *
 * 業務規則（對應 PRD §10、migration 20261126120000）：
 *   - 同一熱點 × 同一品牌組只產一批（DB 唯一索引 event_id + group_id 是冪等鍵）
 *   - 每組至少 1 個未歸檔帳號才產；同平台多帳號共用同一份導流文案（不重複生成）
 *   - 熱點至少產出一批 → status 轉 used（不再被自動掃描重複處理）
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
const AUTO_SCAN_LIMIT = 20;
const AUTO_TICK_EVENT_LIMIT = 3;
const AUTO_EVENT_WINDOW_DAYS = 7;
const CHUNK_SIZE = 100;

const MIN_TITLE_LENGTH = 2;
const MAX_TITLE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 1_000;
const MAX_URL_LENGTH = 2_000;

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

const SERVICE_ACTIONS = new Set(["auto_tick", "llm_check"]);

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
  "id, event_id, group_id, title, body_md, status, scheduled_at, approved_at, created_at, generator";
const GROUP_COLUMNS = "id, name, archived";
const ACCOUNT_COLUMNS = "id, platform, handle, display_name, login_status, archived";

async function listHotEvents(db: Db): Promise<HotEventRow[]> {
  const { data, error } = await db
    .from("content_hot_events")
    .select(HOT_EVENT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(EVENT_LIST_LIMIT);
  throwDb(error, "讀取熱點失敗");
  return (data ?? []) as HotEventRow[];
}

async function listSocialPosts(db: Db): Promise<SocialPostRow[]> {
  const { data, error } = await db
    .from("content_social_posts")
    // 刻意不取 body_html：列表只需要 Markdown 原文，少搬一份 HTML 讓看板更快
    .select(POST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(POST_LIST_LIMIT);
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

/** 某個熱點已有哪些組的批次（冪等鍵：event_id + group_id） */
async function loadEventGroupIds(db: Db, eventId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from("content_social_posts")
    .select("group_id")
    .eq("event_id", eventId);
  throwDb(error, "讀取既有批次失敗");
  const groupIds = new Set<string>();
  for (const row of (data ?? []) as { group_id: string | null }[]) {
    if (row.group_id) groupIds.add(row.group_id);
  }
  return groupIds;
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
// generateForEvent：熱點 → 每組「1 長文 + 每帳號一導流」
// ============================================================

/**
 * 為單一熱點補產仍缺批次的組。
 *
 * - 只處理 archived=false 的組、且該組至少 1 個未歸檔帳號
 * - (event_id, group_id) 已有批次就跳過（冪等；也靠 DB 唯一索引兜底）
 * - 長文每組一份（組名會寫進文章），導流文案「同平台共用一份」
 * - 至少產出一批 → 熱點標記 used
 *
 * 回傳「本次新建」的稿件（含 targets），既有的批次不回傳。
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

  const existingGroupIds = await loadEventGroupIds(db, event.id);

  const groupsById = new Map(
    groupsWithAccounts.map((entry): [string, SocialGroupRow] => [entry.group.id, entry.group]),
  );
  const accountsById = new Map(
    groupsWithAccounts
      .flatMap((entry) => entry.accounts)
      .map((account): [string, SocialAccountRow] => [account.id, account]),
  );
  const eventsById = new Map<string, HotEventRow>([[event.id, event]]);

  const created: SocialPostView[] = [];
  const failures: unknown[] = [];

  for (const entry of eligible) {
    // 同一熱點同一組只產一批：這條規則同時是自動掃描與手動生成的冪等保證
    if (existingGroupIds.has(entry.group.id)) continue;

    try {
      // 每個組要出的平台（同平台多帳號共用一份文案）
      const platforms = [...new Set(entry.accounts.map((account) => account.platform || "other"))];
      const llm = await tryComposeWithLlm(event, entry.group.name, platforms);
      const longform =
        llm?.longform ??
        composeLongform({
          eventTitle: event.title,
          eventSummary: event.summary,
          groupName: entry.group.name,
        });
      const copiesByPlatform = llm ? new Map(Object.entries(llm.copies)) : undefined;

      const { data: postData, error: postError } = await db
        .from("content_social_posts")
        .insert({
          event_id: event.id,
          group_id: entry.group.id,
          title: longform.title,
          body_md: longform.body_md,
          // HTML 由共用渲染器產生，前端不用再解析 Markdown
          body_html: renderMarkdownToHtml(longform.body_md),
          // 一律先進待審：自動化只負責產稿，批准仍由真人決定
          status: "pending_review",
          // template｜grok：UI 會標示來源，模板 fallback 不會被誤認成 AI
          generator: llm ? "grok" : "template",
        })
        .select("*")
        .single();

      if (postError) {
        if (isUniqueViolation(postError)) {
          // 併發（tick 與手動同時跑）時可能撞唯一索引：視為已存在並跳過
          console.warn(
            `[content-social] 熱點 ${event.id} × 組 ${entry.group.id} 已有批次，略過`,
          );
          continue;
        }
        throwDb(postError, "新增社媒稿失敗");
      }
      if (!postData) continue;

      const post = postData as SocialPostRow;
      const targetRows = await insertTargets(db, post.id, entry, longform, event, copiesByPlatform);

      // 用量與成本：只有真的呼叫 Grok 才記（成本欄位留 0，之後可依牌價補）
      if (llm) await recordSocialUsage(db, post.id, llm.usage);

      // 只貼標題的熱點：用生成出的摘要回填，讓看板卡片有「標題 + 註釋」
      if (!event.summary) await fillEventSummary(db, event, longform.excerpt);

      created.push(toPostView(post, groupsById, eventsById, accountsById, targetRows));
    } catch (error) {
      // 單一組失敗不該拖累其他組；全部失敗時才把錯誤往上拋（見下方）
      failures.push(error);
      console.warn(
        `[content-social] 產稿失敗（event ${event.id} × 組 ${entry.group.id}）：${errorMessage(error)}`,
      );
    }
  }

  // 一組都沒成功 → 讓呼叫端看到真正的錯誤（不要回一個假的空成功）
  if (created.length === 0 && failures.length > 0) {
    throw failures[0];
  }

  // 產出至少一批（或該熱點本來就有批次）→ 熱點標 used，避免永遠掛在「待處理」
  if (created.length > 0 || existingGroupIds.size > 0) {
    await markEventUsed(db, event);
  }

  return created;
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
    // Grok 牌價未納入估算表；先記 0，之後可依帳單補
    cost_usd: 0,
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
 * 逐帳號建立導流目標。
 *
 * 同平台多帳號**共用一份文案**（PRD §10）：先用 Map 快取 platform → caption，
 * 第二個同平台帳號直接拿快取，不重複生成、也保證文案一致。
 */
async function insertTargets(
  db: Db,
  postId: string,
  entry: GroupWithAccounts,
  longform: ComposedLongform,
  event: HotEventRow,
  copiesByPlatform?: Map<string, string>,
): Promise<SocialTargetRow[]> {
  const captionByPlatform = new Map<string, string>();
  const rows: SocialTargetRow[] = [];

  for (const account of entry.accounts) {
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
        groupName: entry.group.name,
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
// 動作：list（今日看板）
// ============================================================

async function handleList(db: Db): Promise<SocialOverview> {
  const dayStart = hktDayStartIso();

  const [events, posts, groups, accounts] = await Promise.all([
    listHotEvents(db),
    listSocialPosts(db),
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
): Promise<{ event: SocialEventView; posts: SocialPostView[] }> {
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

  const { data, error } = await db
    .from("content_hot_events")
    .insert({
      title,
      summary: trimmedSummary,
      url,
      heat,
      source: "manual",
      status: "open",
    })
    .select("*")
    .single();
  throwDb(error, "新增熱點失敗");
  if (!data) fail(500, "db_error", "新增熱點後沒有回傳資料");

  const event = data as HotEventRow;
  // 插入後立即產稿：使用者貼完就馬上看得到待審批次（今天上線就要看到效果）
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
): Promise<{ posts: SocialPostView[] }> {
  const eventId = requireUuid(body.event_id, "invalid_event_id", "缺少有效的 event_id");
  const event = await fetchHotEventRow(db, eventId);
  if (!event) fail(404, "event_not_found", "找不到此熱點");

  const posts = await generateForEvent(db, event);
  return { posts };
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
): Promise<{ advanced: number; generated: number; events: string[] }> {
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

  const roster = await loadRoster(db);
  if (!roster.some((entry) => entry.accounts.length > 0)) {
    // 沒有任何可用帳號時不用掃描，避免每 2 分鐘白跑一輪查詢
    return { advanced, generated, events: generatedEventIds };
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
  if (candidates.length === 0) return { advanced, generated, events: generatedEventIds };

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

  return { advanced, generated, events: generatedEventIds };
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
};

const ACTION_HANDLERS: Record<string, ActionHandler> = {
  list: (db) => handleList(db),
  create_event: (db, _actor, body) => handleCreateEvent(db, body),
  generate_now: (db, _actor, body) => handleGenerateNow(db, body),
  review: (db, actor, body) => handleReview(db, actor, body),
  mark: (db, _actor, body) => handleMark(db, body),
  auto_tick: (db) => handleAutoTick(db),
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
