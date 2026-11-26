import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
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
import { fetchSuggestions } from "../_shared/google-suggest.ts";
import { loadGscMetrics } from "./gsc-aggregate.ts";
import {
  RADAR_GSC_BUDGET,
  RADAR_MANUAL_BUDGET_MS,
  RADAR_MANUAL_SITE_LIMIT,
  RADAR_MAX_IDEAS,
  RADAR_SCAN_BUDGET_MS,
  RADAR_SITE_LIMIT,
  RADAR_SUGGEST_LOW_CONFIDENCE_LIMIT,
  RADAR_WINDOW_DAYS,
  buildSuggestIdeas,
  buildSuggestSeeds,
  clampLimit,
  mergeScanResults,
  radarWindowStart,
  selectGscIdeas,
} from "../../../src/lib/seoRadar.ts";
import type { RadarIdeaDraft } from "../../../src/lib/seoRadar.ts";
import {
  detectMarket,
  isRadarMarketCode,
  marketForCode,
} from "../../../src/lib/seoRadarMarket.ts";
import type { RadarMarket } from "../../../src/lib/seoRadarMarket.ts";

/**
 * SEO 雷達 Edge Function（PRD §6）
 *
 * actions：
 *   scan      { website_profile_id, market_override?, limit? }  需 write
 *   adopt     { website_profile_id, idea_ids[], enqueue? }      需 write
 *   ignore    { idea_ids[] }                                    需 write
 *   cron_scan （service_role 且無 action）                      只限 service_role
 *
 * 契約沿用 content-*：`{ ok, data }` / `{ ok: false, code, error }`；
 * 每次寫入前重算權限，不信任前端。
 */

const SITE_COLUMNS = "id, website_name, domain_url, brand, status, gsc_site_url";
const MAX_IDEA_IDS = 200;
const CHUNK_SIZE = 100;
const CRON_IDEA_LOOKBACK_DAYS = 30;
/** cron 一次最多跑多久（留 buffer 給平台 150s 上限） */
const CRON_TIME_BUDGET_MS = 90_000;

type Db = ReturnType<typeof serviceClient>;

interface SiteRow {
  id: string;
  website_name: string | null;
  domain_url: string | null;
  brand: string | null;
  status: string | null;
  gsc_site_url: string | null;
}

interface IdeaRow {
  id: string;
  website_profile_id: string;
  keyword: string;
  normalized_keyword: string;
  source: "gsc" | "suggest";
  impressions: number | string | null;
  avg_position: number | string | null;
  status: "new" | "adopted" | "ignored";
}

interface ScanSiteResult {
  market: RadarMarket;
  gsc_terms: number;
  suggest_terms: number;
  ideas: RadarIdeaDraft[];
  warnings: string[];
}

class RadarHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "RadarHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ============================================================
// 輸入驗證
// ============================================================

function fail(status: number, code: string, message: string): never {
  throw new RadarHttpError(status, code, message);
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size) as T[]);
  }
  return chunks;
}

function requireSiteId(body: Record<string, unknown>): string {
  const raw = typeof body.website_profile_id === "string" ? body.website_profile_id.trim() : "";
  if (!raw) fail(400, "invalid_request", "缺少 website_profile_id");
  return raw;
}

function parseIdeaIds(value: unknown): string[] {
  if (!Array.isArray(value)) fail(400, "invalid_request", "idea_ids 必須是陣列");
  const ids = [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  ];
  if (ids.length === 0) fail(400, "invalid_request", "idea_ids 不可為空");
  if (ids.length > MAX_IDEA_IDS) {
    fail(400, "invalid_request", `一次最多採納 ${MAX_IDEA_IDS} 個詞`);
  }
  return ids;
}

/** 42P01 / PGRST205 / PGRST204 → 表未建立，前端要顯示「功能尚未啟用」 */
function throwDb(error: unknown, context: string): void {
  if (!error) return;
  const shape = error as { code?: string; message?: string; details?: string; hint?: string };
  const code = String(shape.code ?? "");
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") {
    throw new RadarHttpError(
      500,
      "schema_missing",
      "SEO 雷達的資料表尚未建立，請先推送本次 migration",
      code,
    );
  }
  throw new RadarHttpError(500, "db_error", `${context}：${dbError(error)}`, code);
}

// ============================================================
// 站點與 GSC 對映
// ============================================================

async function loadSite(db: Db, siteId: string): Promise<SiteRow> {
  const { data, error } = await db
    .from("webandsystem_list")
    .select(SITE_COLUMNS)
    .eq("id", siteId)
    .maybeSingle();
  throwDb(error, "讀取站點失敗");
  if (!data) fail(404, "site_not_found", "找不到這個站點");
  return data as SiteRow;
}

async function resolveGscSiteUrls(db: Db, site: SiteRow): Promise<string[]> {
  const urls = new Set<string>();
  const direct = (site.gsc_site_url ?? "").trim();
  if (direct) urls.add(direct);

  const { data, error } = await db
    .from("gsc_sites")
    .select("site_url")
    .eq("website_profile_id", site.id);
  throwDb(error, "讀取 GSC 站點對映失敗");

  for (const row of (data ?? []) as { site_url: string | null }[]) {
    const siteUrl = (row.site_url ?? "").trim();
    if (siteUrl) urls.add(siteUrl);
  }

  return [...urls];
}

// ============================================================
// 抓取
// ============================================================

async function startRun(
  db: Db,
  trigger: "manual" | "cron",
  meta?: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await db
    .from("seo_radar_runs")
    .insert({ trigger, status: "running", ...(meta ? { meta } : {}) })
    .select("id")
    .single();
  throwDb(error, "建立抓取紀錄失敗");
  return (data as { id: string }).id;
}

/**
 * 避免兩個「全站抓取」同時跑（會重複打 Google 建議、浪費額度）。
 * 只看 10 分鐘內、scope='all' 的 running run；崩潰留下的舊 run 不會永久擋住。
 */
async function assertNoRunningFullScan(db: Db): Promise<void> {
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data, error } = await db
    .from("seo_radar_runs")
    .select("id")
    .eq("status", "running")
    .eq("meta->>scope", "all")
    .gte("started_at", since)
    .limit(1);
  throwDb(error, "檢查進行中的全站抓取失敗");
  if ((data ?? []).length > 0) {
    throw new RadarHttpError(409, "scan_in_progress", "全站抓取正在進行中，請稍後再試");
  }
}

async function finishRun(
  db: Db,
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from("seo_radar_runs")
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) {
    // 收尾失敗不應蓋掉主流程結果，只記錄
    console.error("[seo-radar] finishRun failed:", dbError(error));
  }
}

async function scanSite(
  db: Db,
  site: SiteRow,
  marketOverride: unknown,
  limit: number,
): Promise<ScanSiteResult> {
  const market = isRadarMarketCode(marketOverride)
    ? marketForCode(marketOverride)
    : detectMarket(site.domain_url);

  const warnings: string[] = [];
  const siteUrls = await resolveGscSiteUrls(db, site);

  let gscIdeas: RadarIdeaDraft[] = [];
  if (siteUrls.length === 0) {
    warnings.push("gsc_not_linked");
  } else {
    const rows = await loadGscMetrics(db, siteUrls, radarWindowStart(RADAR_WINDOW_DAYS));
    gscIdeas = selectGscIdeas(rows, Math.min(RADAR_GSC_BUDGET, limit));
    if (gscIdeas.length === 0) warnings.push("gsc_no_terms");
  }

  const seeds = buildSuggestSeeds({
    gscTop: gscIdeas.map((idea) => idea.keyword),
    websiteName: site.website_name,
    brand: site.brand,
    domainUrl: site.domain_url,
  });

  const suggest = await fetchSuggestions(
    seeds.map((seed) => seed.phrase),
    {
      hl: market.hl,
      gl: market.gl,
      deadline: Date.now() + RADAR_SCAN_BUDGET_MS,
    },
  );
  if (suggest.errors.length > 0) warnings.push("suggest_unavailable");

  const seedImpressions = new Map<string, number>(
    gscIdeas.map((idea) => [idea.normalized_keyword, idea.impressions] as [string, number]),
  );
  const suggestIdeas = buildSuggestIdeas({
    suggestions: suggest.terms,
    seeds,
    seedImpressions,
  });

  // 低信度模式：GSC 完全沒有資料時只靠站名／域名／品牌推測，寧可少取
  const effectiveLimit =
    gscIdeas.length === 0
      ? Math.min(limit, RADAR_SUGGEST_LOW_CONFIDENCE_LIMIT)
      : limit;
  const ideas = mergeScanResults({ gscIdeas, suggestIdeas, limit: effectiveLimit });
  if (ideas.length === 0) warnings.push("ideas_empty");

  return {
    market,
    gsc_terms: gscIdeas.length,
    suggest_terms: suggestIdeas.length,
    ideas,
    warnings,
  };
}

async function persistIdeas(
  db: Db,
  siteId: string,
  market: RadarMarket,
  runId: string,
  ideas: readonly RadarIdeaDraft[],
): Promise<{ inserted: number; updated: number }> {
  if (ideas.length === 0) return { inserted: 0, updated: 0 };

  const normalizedList = ideas.map((idea) => idea.normalized_keyword);
  const existing = new Set<string>();

  for (const chunk of chunkArray(normalizedList, CHUNK_SIZE)) {
    const { data, error } = await db
      .from("seo_keyword_ideas")
      .select("normalized_keyword")
      .eq("website_profile_id", siteId)
      .eq("market_code", market.code)
      .in("normalized_keyword", chunk);
    throwDb(error, "讀取既有候選詞失敗");
    for (const row of (data ?? []) as { normalized_keyword: string }[]) {
      existing.add(row.normalized_keyword);
    }
  }

  const seenAt = new Date().toISOString();
  const payload = ideas.map((idea) => ({
    website_profile_id: siteId,
    keyword: idea.keyword,
    normalized_keyword: idea.normalized_keyword,
    source: idea.source,
    market_code: market.code,
    language_code: market.hl,
    impressions: Math.round(idea.impressions),
    clicks: Math.round(idea.clicks),
    ctr: idea.ctr,
    avg_position: idea.avg_position,
    seed_keyword: idea.seed_keyword,
    score: idea.score,
    run_id: runId,
    last_seen_at: seenAt,
  }));

  // 注意：payload 刻意不含 status / first_seen_at
  // → 新列走 DEFAULT 'new'，既有 adopted / ignored 不會被覆蓋。
  const { error } = await db
    .from("seo_keyword_ideas")
    .upsert(payload, { onConflict: "website_profile_id,market_code,normalized_keyword" });
  throwDb(error, "寫入候選詞失敗");

  const inserted = payload.filter((row) => !existing.has(row.normalized_keyword)).length;
  return { inserted, updated: payload.length - inserted };
}

async function handleScan(body: Record<string, unknown>) {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  const limit = clampLimit(body.limit, RADAR_MAX_IDEAS);
  const site = await loadSite(db, siteId);
  const runId = await startRun(db, "manual");

  try {
    const result = await scanSite(db, site, body.market_override, limit);
    const { inserted, updated } = await persistIdeas(
      db,
      siteId,
      result.market,
      runId,
      result.ideas,
    );

    await finishRun(db, runId, {
      status: "success",
      sites_scanned: 1,
      ideas_upserted: inserted + updated,
      gsc_terms: result.gsc_terms,
      suggest_terms: result.suggest_terms,
      meta: {
        site_id: siteId,
        market: result.market.code,
        language: result.market.hl,
        inserted,
        updated,
        warnings: result.warnings,
      },
    });

    return {
      run: await loadRun(db, runId),
      gsc_terms: result.gsc_terms,
      suggest_terms: result.suggest_terms,
      inserted,
      updated,
      warnings: result.warnings,
    };
  } catch (error) {
    await finishRun(db, runId, {
      status: "error",
      error_message: error instanceof Error ? error.message.slice(0, 500) : String(error),
    });
    throw error;
  }
}

async function loadRun(db: Db, runId: string): Promise<unknown> {
  const { data } = await db.from("seo_radar_runs").select("*").eq("id", runId).maybeSingle();
  return data ?? null;
}

// ============================================================
// 採納 / 忽略
// ============================================================

async function handleAdopt(body: Record<string, unknown>) {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  const ideaIds = parseIdeaIds(body.idea_ids);
  const enqueue = body.enqueue === true;

  const { data, error } = await db
    .from("seo_keyword_ideas")
    .select("id, website_profile_id, keyword, normalized_keyword, source, impressions, avg_position, status")
    .eq("website_profile_id", siteId)
    .in("id", ideaIds);
  throwDb(error, "讀取候選詞失敗");

  const ideas = (data ?? []) as IdeaRow[];
  // 表格的可勾選範圍是 new / ignored（見 isSelectable），採納必須一致；
  // 舊版 'ignored' 是軟隱藏留下的狀態，使用者既然勾了就是要採納。
  if (ideas.length === 0) {
    return { adopted: 0, skipped: ideaIds.length, enqueued: 0, keyword_ids: [] };
  }

  const adoptable = ideas;
  const skippedCount = ideaIds.length - ideas.length;

  // source：GSC → gsc；建議詞 → import（不擴充 seo_keywords.source 的 CHECK）
  const payload = adoptable.map((idea) => ({
    website_profile_id: siteId,
    keyword: idea.keyword,
    normalized_keyword: idea.normalized_keyword,
    level: "level_3",
    search_volume: Math.round(Number(idea.impressions) || 0),
    current_ranking: idea.avg_position == null ? null : Number(idea.avg_position),
    target_ranking: null,
    target_page: null,
    difficulty_score: null,
    status: "monitoring",
    ai_generated: false,
    source: idea.source === "gsc" ? "gsc" : "import",
  }));

  // 已存在的詞不覆寫（ignoreDuplicates → ON CONFLICT DO NOTHING）
  for (const chunk of chunkArray(payload, CHUNK_SIZE)) {
    const { error: upsertError } = await db.from("seo_keywords").upsert(chunk, {
      onConflict: "website_profile_id,normalized_keyword",
      ignoreDuplicates: true,
    });
    throwDb(upsertError, "寫入關鍵字庫失敗");
  }

  const normalizedList = [...new Set(adoptable.map((idea) => idea.normalized_keyword))];
  const keywordIdByNormalized = new Map<string, string>();
  for (const chunk of chunkArray(normalizedList, CHUNK_SIZE)) {
    const { data: keywordRows, error: keywordError } = await db
      .from("seo_keywords")
      .select("id, normalized_keyword")
      .eq("website_profile_id", siteId)
      .in("normalized_keyword", chunk);
    throwDb(keywordError, "回查關鍵字失敗");
    for (const row of (keywordRows ?? []) as { id: string; normalized_keyword: string }[]) {
      keywordIdByNormalized.set(row.normalized_keyword, row.id);
    }
  }

  const ideaIdsByKeyword = new Map<string, string[]>();
  for (const idea of adoptable) {
    const keywordId = keywordIdByNormalized.get(idea.normalized_keyword);
    if (!keywordId) continue;
    const list = ideaIdsByKeyword.get(keywordId) ?? [];
    list.push(idea.id);
    ideaIdsByKeyword.set(keywordId, list);
  }

  const adoptedAt = new Date().toISOString();
  const updateResults = await Promise.all(
    [...ideaIdsByKeyword.entries()].map(([keywordId, ids]) =>
      db
        .from("seo_keyword_ideas")
        .update({ status: "adopted", adopted_keyword_id: keywordId, last_seen_at: adoptedAt })
        .in("id", ids),
    ),
  );
  for (const result of updateResults) {
    throwDb(result.error, "更新候選詞狀態失敗");
  }

  const keywordIds = [...ideaIdsByKeyword.keys()];
  let enqueued = 0;

  if (enqueue && keywordIds.length > 0) {
    // H2：只補 NULL / 已是 backlog 的列，已 in_progress / published 的一律不動
    for (const chunk of chunkArray(keywordIds, CHUNK_SIZE)) {
      const { data: updatedRows, error: enqueueError } = await db
        .from("seo_keywords")
        .update({ pipeline_status: "backlog", updated_at: adoptedAt })
        .in("id", chunk)
        .or("pipeline_status.is.null,pipeline_status.eq.backlog")
        .select("id");
      throwDb(enqueueError, "加入自動生成佇列失敗");
      enqueued += (updatedRows ?? []).length;
    }
  }

  return {
    adopted: adoptable.filter((idea) => keywordIdByNormalized.has(idea.normalized_keyword)).length,
    skipped: skippedCount,
    enqueued,
    keyword_ids: keywordIds,
  };
}

/** 保留給舊版前端（軟隱藏）；新 UI 已改用 delete */
async function handleIgnore(body: Record<string, unknown>) {
  const db = serviceClient();
  const ideaIds = parseIdeaIds(body.idea_ids);
  // 可選但前端一定會帶：限定站點，避免跨站誤改別人的候選詞
  const siteId =
    typeof body.website_profile_id === "string" ? body.website_profile_id.trim() : "";

  let query = db
    .from("seo_keyword_ideas")
    .update({ status: "ignored" })
    .in("id", ideaIds)
    .eq("status", "new");
  if (siteId) query = query.eq("website_profile_id", siteId);

  const { data, error } = await query.select("id");
  throwDb(error, "標記忽略失敗");

  return { updated: (data ?? []).length };
}

/**
 * 真的刪除候選詞（UI 的「刪除」）。
 *
 * 安全規則：
 *   - 一律帶 website_profile_id，避免跨站誤刪
 *   - 只刪 status 為 'new' 或 'ignored'：已採納的是歷史證據，不准刪
 *     （'ignored' 是舊版軟隱藏留下的，必須能一併清掉，否則那些詞會永遠卡住）
 *   - 刪掉的詞下次抓取若仍有曝光／建議，會重新長回來
 */
async function handleDelete(body: Record<string, unknown>) {
  const db = serviceClient();
  const siteId = requireSiteId(body);
  const ideaIds = parseIdeaIds(body.idea_ids);

  const { data, error } = await db
    .from("seo_keyword_ideas")
    .delete()
    .eq("website_profile_id", siteId)
    .in("id", ideaIds)
    .in("status", ["new", "ignored"])
    .select("id");
  throwDb(error, "刪除候選詞失敗");

  return { deleted: (data ?? []).length };
}

// ============================================================
// cron：掃描最久沒更新的站點
// ============================================================

async function listCandidateSites(db: Db): Promise<SiteRow[]> {
  const { data: siteRows, error: siteError } = await db
    .from("webandsystem_list")
    .select(SITE_COLUMNS)
    .in("status", ["live", "maintenance"]);
  throwDb(siteError, "讀取站點失敗");

  const { data: gscRows } = await db
    .from("gsc_sites")
    .select("website_profile_id")
    .not("website_profile_id", "is", null);
  const gscLinked = new Set(
    ((gscRows ?? []) as { website_profile_id: string | null }[])
      .map((row) => row.website_profile_id ?? "")
      .filter(Boolean),
  );

  const since = new Date(Date.now() - CRON_IDEA_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: ideaRows } = await db
    .from("seo_keyword_ideas")
    .select("website_profile_id, last_seen_at")
    .gte("last_seen_at", since);

  const lastSeenBySite = new Map<string, string>();
  for (const row of (ideaRows ?? []) as { website_profile_id: string; last_seen_at: string }[]) {
    const previous = lastSeenBySite.get(row.website_profile_id) ?? "";
    if (row.last_seen_at > previous) lastSeenBySite.set(row.website_profile_id, row.last_seen_at);
  }

  // 有 gsc_sites 對映、有 webandsystem_list.gsc_site_url、或 30 天內抓過的站點，
  // 都要排進 cron 候選（只認 gsc_sites 會漏掉直接寫 gsc_site_url 的站點）。
  const candidates = ((siteRows ?? []) as SiteRow[]).filter(
    (site) =>
      gscLinked.has(site.id) ||
      Boolean((site.gsc_site_url ?? "").trim()) ||
      lastSeenBySite.has(site.id),
  );

  // 最久沒抓的排前面（從未抓過 = 空字串）
  candidates.sort((a, b) => {
    const left = lastSeenBySite.get(a.id) ?? "";
    const right = lastSeenBySite.get(b.id) ?? "";
    return left.localeCompare(right) || a.id.localeCompare(b.id);
  });

  return candidates;
}

interface SiteBatchResult {
  sites_scanned: number;
  ideas_upserted: number;
  gsc_terms: number;
  suggest_terms: number;
  skipped: string[];
  site_ids: string[];
}

/** 逐站掃描；超過時間預算就停手，剩下的留給下一次（每日 cron 會補上） */
async function runSiteBatch(
  db: Db,
  sites: readonly SiteRow[],
  runId: string,
  deadline: number,
): Promise<SiteBatchResult> {
  let sitesScanned = 0;
  let ideasUpserted = 0;
  let gscTerms = 0;
  let suggestTerms = 0;
  const skipped: string[] = [];
  const siteIds: string[] = [];

  for (let index = 0; index < sites.length; index += 1) {
    const site = sites[index];

    if (sitesScanned > 0 && Date.now() >= deadline) {
      // 只記一條，避免 skipped 陣列被幾十個站點灌爆
      skipped.push(`time_budget_reached: ${sites.length - index} sites left`);
      break;
    }

    try {
      const result = await scanSite(db, site, null, RADAR_MAX_IDEAS);
      const { inserted, updated } = await persistIdeas(
        db,
        site.id,
        result.market,
        runId,
        result.ideas,
      );
      sitesScanned += 1;
      ideasUpserted += inserted + updated;
      gscTerms += result.gsc_terms;
      suggestTerms += result.suggest_terms;
      siteIds.push(site.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipped.push(`${site.id}: ${message.slice(0, 160)}`);
    }
  }

  return {
    sites_scanned: sitesScanned,
    ideas_upserted: ideasUpserted,
    gsc_terms: gscTerms,
    suggest_terms: suggestTerms,
    skipped,
    site_ids: siteIds,
  };
}

async function handleCronScan() {
  const db = serviceClient();
  const runId = await startRun(db, "cron");
  const sites = (await listCandidateSites(db)).slice(0, RADAR_SITE_LIMIT);
  const batch = await runSiteBatch(db, sites, runId, Date.now() + CRON_TIME_BUDGET_MS);

  await finishRun(db, runId, {
    status: batch.skipped.length > 0 && batch.sites_scanned === 0 ? "error" : "success",
    sites_scanned: batch.sites_scanned,
    ideas_upserted: batch.ideas_upserted,
    gsc_terms: batch.gsc_terms,
    suggest_terms: batch.suggest_terms,
    error_message: batch.skipped.length > 0 ? batch.skipped.join(" · ").slice(0, 500) : null,
    meta: { site_ids: batch.site_ids, skipped: batch.skipped },
  });

  return {
    sites_scanned: batch.sites_scanned,
    ideas_upserted: batch.ideas_upserted,
    skipped: batch.skipped,
  };
}

/**
 * 使用者按「全站自動抓取」：手動跑一次，處理最久沒更新的 N 個站點。
 * 站點總數可能遠超一次能處理的數量，剩下的交給每日 cron。
 */
async function handleScanAll() {
  const db = serviceClient();
  await assertNoRunningFullScan(db);
  const all = await listCandidateSites(db);
  const sites = all.slice(0, RADAR_MANUAL_SITE_LIMIT);
  const runId = await startRun(db, "manual", { scope: "all" });
  const batch = await runSiteBatch(db, sites, runId, Date.now() + RADAR_MANUAL_BUDGET_MS);
  // 用「實際完成數」算剩下多少，而不是切片長度（時間預算可能提早收工）
  const remaining = Math.max(0, all.length - batch.sites_scanned);

  await finishRun(db, runId, {
    status: batch.skipped.length > 0 && batch.sites_scanned === 0 ? "error" : "success",
    sites_scanned: batch.sites_scanned,
    ideas_upserted: batch.ideas_upserted,
    gsc_terms: batch.gsc_terms,
    suggest_terms: batch.suggest_terms,
    error_message: batch.skipped.length > 0 ? batch.skipped.join(" · ").slice(0, 500) : null,
    meta: { scope: "all", site_ids: batch.site_ids, remaining, skipped: batch.skipped },
  });

  return {
    sites_scanned: batch.sites_scanned,
    sites_remaining: remaining,
    ideas_upserted: batch.ideas_upserted,
    skipped: batch.skipped,
  };
}

// ============================================================
// 每日自動抓取：狀態與開關（經 RPC，cron schema 不對外）
// ============================================================

async function handleCronStatus() {
  const db = serviceClient();
  const { data, error } = await db.rpc("seo_radar_daily_status");
  throwDb(error, "讀取每日自動抓取狀態失敗");
  return data ?? { enabled: false, schedule: null, jobname: null };
}

async function handleSetDaily(body: Record<string, unknown>) {
  const enabled = body.enabled === true;
  const db = serviceClient();
  const { data, error } = await db.rpc("seo_radar_set_daily", { p_enabled: enabled });
  throwDb(error, "切換每日自動抓取失敗");

  if (data && (data as { ok?: boolean }).ok === false) {
    throw new RadarHttpError(409, "job_missing", "每日自動抓取尚未建立，請先完成部署");
  }

  return data;
}

// ============================================================
// 入口
// ============================================================

type ActionHandler = (body: Record<string, unknown>) => Promise<unknown>;

const ACTION_HANDLERS: Record<string, ActionHandler> = {
  scan: handleScan,
  scan_all: handleScanAll,
  adopt: handleAdopt,
  delete: handleDelete,
  ignore: handleIgnore,
  cron_status: handleCronStatus,
  set_daily: handleSetDaily,
};

/** 只有管理層可以切換「每日自動抓取」（影響全域排程） */
const ADMIN_ONLY_ACTIONS = new Set(["set_daily"]);

function readAction(body: Record<string, unknown>, actor: ContentActor): string {
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action) return action;
  // cron 以 service_role 呼叫且不帶 body → 視為 cron_scan
  if (actor.kind === "service") return "cron_scan";
  return fail(400, "unknown_action", "缺少 action");
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
    const action = readAction(body, actor);

    if (action === "cron_scan") {
      const denied = requireServiceRole(req);
      if (denied) return denied;
      return okJson(await handleCronScan());
    }

    const permission = ADMIN_ONLY_ACTIONS.has(action) ? "manage_settings" : "write";
    const forbidden = requireAction(actor, permission);
    if (forbidden) return forbidden;

    const handler = ACTION_HANDLERS[action];
    if (!handler) return failJson(400, "unknown_action", `未知的動作：${action}`);

    return okJson(await handler(body));
  } catch (error) {
    if (error instanceof RadarHttpError) {
      return failJson(error.status, error.code, error.message, error.details);
    }
    console.error("[seo-radar] unhandled error:", error);
    return failJson(500, "internal_error", "處理請求時發生未預期的錯誤");
  }
});
