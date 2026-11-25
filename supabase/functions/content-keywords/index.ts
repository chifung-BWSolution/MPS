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
  CONTENT_NOT_ENABLED_MESSAGE,
  type ContentKeyword,
  type ContentKeywordImportError,
  type ContentKeywordImportResult,
  type ContentKeywordImportRow,
  type ContentKeywordIntent,
  type ContentKeywordPipelineStatus,
} from "../../../src/lib/contentTypes.ts";
import { normalizeKeywordPhrase } from "../../../src/lib/contentFormat.ts";
import { isGscOpportunity } from "../../../src/lib/contentGenerate.ts";

/**
 * content-keywords｜CSV 匯入、GSC 機會詞掃描、候選詞查詢
 * （PRD §6.2.2、§9.2.3；實作契約 §6、M1-13／M1-14）
 *
 * 硬規則：
 *   - 匯入時才由本函式「明確」寫入 pipeline_status（預設 backlog）；
 *     seo_keywords 新欄沒有 DEFAULT，歷史詞保持 NULL，既有詞一律不 update。
 *   - 逐行驗證，單行錯誤不整批失敗。
 *   - GSC 機會詞以 isGscOpportunity 判定，on conflict do nothing，不覆蓋人工資料。
 *
 * 權限：import / scan_gsc = write；list_candidates = view。
 * 回應格式一律 okJson / failJson。
 */

type ContentDb = ReturnType<typeof serviceClient>;

// ============================================================
// 常數
// ============================================================

const INTENTS: readonly ContentKeywordIntent[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
];
const PIPELINE_STATUSES: readonly ContentKeywordPipelineStatus[] = [
  "backlog",
  "planned",
  "generating",
  "in_review",
  "published",
  "rejected",
  "parked",
];
const DEFAULT_PIPELINE_STATUS: ContentKeywordPipelineStatus = "backlog";
const KEYWORD_LEVELS: ReadonlySet<string> = new Set(["level_1", "level_2", "level_3"]);
const KEYWORD_STATUSES: ReadonlySet<string> = new Set([
  "monitoring",
  "optimizing",
  "achieved",
  "paused",
]);
const KEYWORD_SOURCES: ReadonlySet<string> = new Set(["manual", "gsc", "ads", "import"]);

/** 單次匯入上限（CSV 一次貼上 2000 行已遠超 M1 的「100 詞去重」驗收） */
const MAX_IMPORT_ROWS = 2_000;
const INSERT_CHUNK = 500;
/** 關鍵字可能很長，in.(...) 走 URL query，50 個一批最安全 */
const EXISTING_LOOKUP_CHUNK = 50;
const LIST_LIMIT = 1_000;

const GSC_SCAN_DAYS = 28;
const GSC_PAGE_SIZE = 1_000;
/** 單次掃描最多翻 40 頁（4 萬列），避免異常資料量把函式拖到 timeout */
const GSC_MAX_PAGES = 40;

const VIEW_ACTIONS: ReadonlySet<string> = new Set(["list_candidates"]);

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

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requireSiteId(body: Record<string, unknown>): string {
  const siteId = asTrimmedString(body.site_id);
  if (!siteId) fail(400, "invalid_site_id", "缺少有效的 site_id");
  return siteId;
}

/** 選填文字：undefined / null / 空白一律視為 null；數字（CSV 解析結果）轉字串 */
function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim() || null;
  }
  return null;
}

interface PriorityParse {
  value: number | null;
  invalid: boolean;
}

function parseOptionalPriority(value: unknown): PriorityParse {
  if (value === undefined || value === null) return { value: null, invalid: false };
  if (typeof value === "string" && value.trim() === "") return { value: null, invalid: false };
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { value: null, invalid: true };
  }
  // Postgres integer 範圍，避免 overflow 讓整批寫入失敗
  if (parsed < -2_147_483_648 || parsed > 2_147_483_647) {
    return { value: null, invalid: true };
  }
  return { value: parsed, invalid: false };
}

// ============================================================
// 匯入：逐行驗證（單行錯誤不整批失敗）
// ============================================================

interface NormalizedImportRow {
  line: number;
  phrase: string;
  normalized: string;
  intent: ContentKeywordIntent | null;
  priority: number | null;
  cluster: string | null;
  targetPage: string | null;
  pipelineStatus: ContentKeywordPipelineStatus;
}

function importError(line: number, phrase: string, reason: string): ContentKeywordImportError {
  return { line, phrase, reason };
}

type ParsedImportRow =
  | { ok: true; row: NormalizedImportRow }
  | { ok: false; error: ContentKeywordImportError };

function parseImportRow(raw: unknown, line: number): ParsedImportRow {
  if (!isRecord(raw)) {
    return { ok: false, error: importError(line, "", "資料列格式不正確") };
  }
  const source = raw as Partial<ContentKeywordImportRow> & Record<string, unknown>;

  // phrase 必填，入庫時保留原樣（trim）；比對用正規化字串
  const phrase = typeof source.phrase === "string" ? source.phrase.trim() : "";
  if (!phrase) return { ok: false, error: importError(line, "", "缺少關鍵字（phrase）") };

  const normalized = normalizeKeywordPhrase(phrase);
  if (!normalized) {
    return { ok: false, error: importError(line, phrase, "關鍵字正規化後為空") };
  }

  // intent：只能是 4 值或留空
  const intentText = optionalText(source.intent);
  let intent: ContentKeywordIntent | null = null;
  if (intentText !== null) {
    if (!INTENTS.includes(intentText as ContentKeywordIntent)) {
      return {
        ok: false,
        error: importError(line, phrase, `意圖必須是 ${INTENTS.join(" / ")}`),
      };
    }
    intent = intentText as ContentKeywordIntent;
  }

  // priority：必須是整數或留空
  const priority = parseOptionalPriority(source.priority);
  if (priority.invalid) {
    return { ok: false, error: importError(line, phrase, "優先級必須是整數") };
  }

  // pipeline_status：只能是 7 值或省略；本函式是唯一明確設定它的地方
  const pipelineText = optionalText(source.pipeline_status);
  if (pipelineText !== null && !PIPELINE_STATUSES.includes(pipelineText as ContentKeywordPipelineStatus)) {
    return {
      ok: false,
      error: importError(line, phrase, `管線狀態必須是 ${PIPELINE_STATUSES.join(" / ")}`),
    };
  }

  return {
    ok: true,
    row: {
      line,
      phrase,
      normalized,
      intent,
      priority: priority.value,
      cluster: optionalText(source.cluster),
      targetPage: optionalText(source.target_url),
      pipelineStatus:
        (pipelineText as ContentKeywordPipelineStatus | null) ?? DEFAULT_PIPELINE_STATUS,
    },
  };
}

async function requireWebsiteProfile(db: ContentDb, siteId: string): Promise<void> {
  const { data, error } = await db
    .from("webandsystem_list")
    .select("id")
    .eq("id", siteId)
    .maybeSingle();
  throwDb(error, "讀取站點主檔失敗");
  if (!data) fail(404, "site_not_found", "找不到此站點主檔（webandsystem_list）");
}

/** 分批查既有 normalized_keyword，避免 PostgREST URL 過長 */
async function findExistingKeywords(
  db: ContentDb,
  siteId: string,
  normalizedKeys: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let index = 0; index < normalizedKeys.length; index += EXISTING_LOOKUP_CHUNK) {
    const chunk = normalizedKeys.slice(index, index + EXISTING_LOOKUP_CHUNK);
    const { data, error } = await db
      .from("seo_keywords")
      .select("normalized_keyword")
      .eq("website_profile_id", siteId)
      .in("normalized_keyword", chunk);
    throwDb(error, "查詢既有關鍵字失敗");
    for (const row of (data ?? []) as { normalized_keyword: string | null }[]) {
      if (row.normalized_keyword) existing.add(row.normalized_keyword);
    }
  }
  return existing;
}

/**
 * import（PRD §6.2.2 配套規則 4、M1-13）：
 *   - 只 insert 新詞；既有詞不 update（歷史 NULL 不會被回填）
 *   - pipeline_status 在此明確設定：預設 backlog，前端指定則用指定值
 *   - 同站重複（DB 既有 + 本批重複）計入 skipped，不報錯
 */
async function handleImport(body: Record<string, unknown>): Promise<ContentKeywordImportResult> {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  await requireWebsiteProfile(db, siteId);

  const rawRows = body.rows;
  if (!Array.isArray(rawRows)) fail(400, "invalid_rows", "rows 必須是陣列");
  if (rawRows.length > MAX_IMPORT_ROWS) {
    fail(400, "rows_too_many", `單次最多匯入 ${MAX_IMPORT_ROWS} 行`);
  }

  const errors: ContentKeywordImportError[] = [];
  const candidates: NormalizedImportRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  rawRows.forEach((raw, index) => {
    const parsed = parseImportRow(raw, index + 1);
    if (!parsed.ok) {
      errors.push(parsed.error);
      return;
    }
    // 本批去重：同批同詞只留第一筆
    if (seen.has(parsed.row.normalized)) {
      skipped += 1;
      return;
    }
    seen.add(parsed.row.normalized);
    candidates.push(parsed.row);
  });

  if (candidates.length === 0) return { inserted: 0, skipped, errors };

  // 站內既有詞（跨批去重）
  const existing = await findExistingKeywords(
    db,
    siteId,
    candidates.map((candidate) => candidate.normalized),
  );
  const toInsert = candidates.filter((candidate) => {
    if (!existing.has(candidate.normalized)) return true;
    skipped += 1;
    return false;
  });

  let inserted = 0;
  for (let index = 0; index < toInsert.length; index += INSERT_CHUNK) {
    const chunk = toInsert.slice(index, index + INSERT_CHUNK);
    const payload = chunk.map((row) => ({
      website_profile_id: siteId,
      // 原樣 trim 後入庫；normalized_keyword 只供比對
      keyword: row.phrase,
      normalized_keyword: row.normalized,
      intent: row.intent,
      priority: row.priority,
      cluster: row.cluster,
      pipeline_status: row.pipelineStatus,
      source: "import",
      level: "level_3",
      status: "monitoring",
      target_page: row.targetPage,
    }));

    // ignoreDuplicates = on conflict do nothing：只寫新詞，絕不覆蓋既有列
    const { data, error } = await db
      .from("seo_keywords")
      .upsert(payload, {
        onConflict: "website_profile_id,normalized_keyword",
        ignoreDuplicates: true,
      })
      .select("id");
    throwDb(error, "寫入關鍵字失敗");
    inserted += (data ?? []).length;
  }

  // 併發造成的衝突（insert 時剛好被別人寫入）也算 skipped
  skipped += Math.max(0, toInsert.length - inserted);

  return { inserted, skipped, errors };
}

// ============================================================
// GSC 機會詞掃描（PRD §9.2.3、M1-14）
// ============================================================

interface GscMetricRow {
  site_url: string;
  query: string;
  impressions: number | string | null;
  clicks: number | string | null;
  position: number | string | null;
}

interface QueryAggregate {
  display: string;
  impressions: number;
  clicks: number;
  positionWeighted: number;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 聚合最近 28 天：sum(impressions) / sum(clicks) / 曝光加權平均 position */
async function aggregateGscQueries(
  db: ContentDb,
  siteUrls: string[],
  sinceDate: string,
): Promise<Map<string, QueryAggregate>> {
  const byQuery = new Map<string, QueryAggregate>();
  let offset = 0;

  for (let page = 0; page < GSC_MAX_PAGES; page += 1) {
    const { data, error } = await db
      .from("gsc_query_daily_metrics")
      .select("site_url, query, impressions, clicks, position")
      .in("site_url", siteUrls)
      .gte("metric_date", sinceDate)
      // 依主鍵順序分頁，避免 offset 分頁跳列／重複
      .order("site_url", { ascending: true })
      .order("query", { ascending: true })
      .order("metric_date", { ascending: true })
      .range(offset, offset + GSC_PAGE_SIZE - 1);
    throwDb(error, "讀取 GSC 查詢數據失敗");

    const rows = (data ?? []) as GscMetricRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const display = String(row.query ?? "").trim();
      const normalized = normalizeKeywordPhrase(display);
      if (!normalized) continue;

      const impressions = toNumber(row.impressions);
      const previous = byQuery.get(normalized) ?? {
        display,
        impressions: 0,
        clicks: 0,
        positionWeighted: 0,
      };
      previous.impressions += impressions;
      previous.clicks += toNumber(row.clicks);
      previous.positionWeighted += toNumber(row.position) * impressions;
      if (!previous.display) previous.display = display;
      byQuery.set(normalized, previous);
    }

    // 用實際回傳列數推進：即使 PostgREST max-rows 小於 PAGE_SIZE 也能翻完
    offset += rows.length;
    if (rows.length < GSC_PAGE_SIZE) break;
  }

  return byQuery;
}

/**
 * scan_gsc（M1-14）：
 *   - 以 gsc_sites.website_profile_id 找回 GSC property
 *   - 對聚合後的查詢詞跑 isGscOpportunity（高曝光低點擊 / 排名 5–20）
 *   - 通過者 insert seo_keywords：source='gsc'、pipeline_status='backlog'、intent=null、level='level_3'
 *   - on conflict (website_profile_id, normalized_keyword) do nothing
 */
async function handleScanGsc(
  body: Record<string, unknown>,
): Promise<{ inserted: number; scanned: number }> {
  const db = serviceClient();
  const siteId = requireSiteId(body);

  const { data: gscRows, error: gscError } = await db
    .from("gsc_sites")
    .select("site_url")
    .eq("website_profile_id", siteId);
  throwDb(gscError, "讀取 GSC 站點失敗");

  const siteUrls = ((gscRows ?? []) as { site_url: string | null }[])
    .map((row) => row.site_url)
    .filter((url): url is string => Boolean(url));
  if (siteUrls.length === 0) {
    fail(404, "gsc_not_linked", "此站點尚未綁定 Google Search Console");
  }

  const sinceDate = new Date(Date.now() - (GSC_SCAN_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const aggregates = await aggregateGscQueries(db, siteUrls, sinceDate);

  const opportunities: Array<{ keyword: string; normalized: string }> = [];
  for (const [normalized, aggregate] of aggregates) {
    if (aggregate.impressions <= 0) continue;
    const position = aggregate.positionWeighted / aggregate.impressions;
    const verdict = isGscOpportunity({
      impressions: aggregate.impressions,
      clicks: aggregate.clicks,
      position,
    });
    if (verdict.opportunity) {
      opportunities.push({ keyword: aggregate.display, normalized });
    }
  }

  let inserted = 0;
  for (let index = 0; index < opportunities.length; index += INSERT_CHUNK) {
    const chunk = opportunities.slice(index, index + INSERT_CHUNK);
    const payload = chunk.map((candidate) => ({
      website_profile_id: siteId,
      keyword: candidate.keyword,
      normalized_keyword: candidate.normalized,
      intent: null,
      source: "gsc",
      level: "level_3",
      pipeline_status: DEFAULT_PIPELINE_STATUS,
    }));

    const { data, error } = await db
      .from("seo_keywords")
      .upsert(payload, {
        onConflict: "website_profile_id,normalized_keyword",
        ignoreDuplicates: true,
      })
      .select("id");
    throwDb(error, "寫入 GSC 機會詞失敗");
    inserted += (data ?? []).length;
  }

  return { inserted, scanned: aggregates.size };
}

// ============================================================
// 動作：list_candidates（只回 backlog，供 planner／UI 說明用）
// ============================================================

interface KeywordRow {
  id: string;
  website_profile_id: string;
  keyword: string;
  normalized_keyword: string;
  level: string;
  search_volume: number | null;
  current_ranking: number | string | null;
  target_ranking: number | null;
  target_page: string | null;
  difficulty_score: number | null;
  status: string;
  ai_generated: boolean;
  source: string;
  gsc_site_url: string | null;
  last_gsc_sync_at: string | null;
  intent: string | null;
  priority: number | null;
  cluster: string | null;
  pipeline_status: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

function toIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toContentKeyword(row: KeywordRow): ContentKeyword {
  return {
    id: row.id,
    website_profile_id: row.website_profile_id,
    keyword: row.keyword,
    normalized_keyword: row.normalized_keyword,
    level: (KEYWORD_LEVELS.has(row.level) ? row.level : "level_3") as ContentKeyword["level"],
    search_volume: toIntegerOrNull(row.search_volume),
    current_ranking: toNumberOrNull(row.current_ranking),
    target_ranking: toIntegerOrNull(row.target_ranking),
    target_page: row.target_page ?? null,
    difficulty_score: toIntegerOrNull(row.difficulty_score),
    status: (KEYWORD_STATUSES.has(row.status) ? row.status : "monitoring") as ContentKeyword["status"],
    ai_generated: Boolean(row.ai_generated),
    source: (KEYWORD_SOURCES.has(row.source) ? row.source : "manual") as ContentKeyword["source"],
    gsc_site_url: row.gsc_site_url ?? null,
    last_gsc_sync_at: row.last_gsc_sync_at ?? null,
    intent: INTENTS.includes(row.intent as ContentKeywordIntent)
      ? (row.intent as ContentKeywordIntent)
      : null,
    priority: toIntegerOrNull(row.priority),
    cluster: row.cluster ?? null,
    pipeline_status: PIPELINE_STATUSES.includes(row.pipeline_status as ContentKeywordPipelineStatus)
      ? (row.pipeline_status as ContentKeywordPipelineStatus)
      : null,
    last_used_at: row.last_used_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * list_candidates（契約 §6）：
 *   pipeline_status='backlog' 才回；NULL（歷史詞）一律不出現。
 *   排序 priority desc nulls last → created_at asc（PRD §6.2.2 配套規則 3）。
 */
async function handleListCandidates(body: Record<string, unknown>): Promise<ContentKeyword[]> {
  const db = serviceClient();
  const siteId = requireSiteId(body);

  const { data, error } = await db
    .from("seo_keywords")
    .select("*")
    .eq("website_profile_id", siteId)
    .eq("pipeline_status", "backlog")
    .order("priority", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(LIST_LIMIT);
  throwDb(error, "讀取候選關鍵字失敗");

  return ((data ?? []) as KeywordRow[]).map(toContentKeyword);
}

// ============================================================
// 入口
// ============================================================

type ActionHandler = (body: Record<string, unknown>) => Promise<unknown>;

const ACTION_HANDLERS: Record<string, ActionHandler> = {
  import: handleImport,
  scan_gsc: handleScanGsc,
  list_candidates: handleListCandidates,
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

    // PRD §11：每次寫入前重算角色權限（import／scan_gsc 需要 write）
    const denied = requireAction(actor, VIEW_ACTIONS.has(action) ? "view" : "write");
    if (denied) return denied;

    const data = await handler(body);
    return okJson(data);
  } catch (error) {
    if (error instanceof ContentHttpError) {
      return failJson(error.status, error.code, error.message, error.details);
    }
    console.error("[content-keywords] unhandled error:", error);
    return failJson(500, "internal_error", "處理請求時發生未預期的錯誤");
  }
});
