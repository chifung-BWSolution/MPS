import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
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
import {
  HOTSPOT_MAX_NOTE_LENGTH,
  HOTSPOT_MAX_TARGETS_PER_RUN,
  HOTSPOT_MONTHLY_BUDGET_USD,
  HOTSPOT_MIN_ENGAGEMENT,
  HOTSPOT_RETENTION_DAYS,
  HOTSPOT_RUNNING_STALE_MS,
  HOTSPOT_TEST_TARGET_PREVIEW,
  HOTSPOT_TIME_BUDGET_MS,
  budgetPercent,
  computeTargetsRemaining,
  estimateCostUsd,
  isHotspotKind,
  itemsForKind,
  monthSpend,
  normalizeTarget,
  planBudget,
  roundTo,
  toFiniteNumber,
  type HotspotFavoriteStatus,
  type HotspotItemDraft,
  type HotspotKind,
  type HotspotRunRow,
  type HotspotSettings,
} from "../../../src/lib/hotspotRadar.ts";
import { fetchTargetItems, HotspotProviderError, resolveProvider } from "./providers/index.ts";
import {
  countActiveTargets,
  listCandidateTargets,
  listTargetsByIds,
  markTargetFailed,
  markTargetFetched,
  type HotspotTargetRecord,
} from "./targets.ts";
import {
  finishRun,
  hasRunningRun,
  loadMonthRuns,
  pruneOldItems,
  startRun,
  upsertItems,
} from "./persist.ts";

/**
 * 熱點雷達 Edge Function（PRD §6）
 *
 * actions：
 *   scan            { target_ids?: string[] }                         write
 *   scan_all        {}                                                write
 *   test_target     { kind, value }                                   write
 *   favorite        { item_id, status?, note? }                       write
 *   unfavorite      { item_id }                                       write
 *   settings        {}                                                view
 *   update_settings { auto_daily?, monthly_budget_usd?, … }           manage_settings
 *   set_daily       { enabled: boolean }                              manage_settings
 *   create_target   { kind, value, label?, brand_id?, notes?, active? } manage_settings
 *   update_target   { id, label?, brand_id?, notes?, active? }        manage_settings
 *   delete_target   { id }                                            manage_settings
 *   cron_scan       無 action + service_role                           service_role
 *
 * 契約沿用 content-*：`{ ok, data }` / `{ ok: false, code, error }`；
 * 每次寫入前重算權限，不信任前端。
 */

type Db = ReturnType<typeof serviceClient>;

const ACTION_ADMIN_ONLY = new Set([
  "update_settings",
  "set_daily",
  "create_target",
  "update_target",
  "delete_target",
]);

/** 只讀動作：任何已登入者都可以看設定與用量（PRD §9） */
const ACTION_VIEW_ONLY = new Set(["settings"]);

const FAVORITE_STATUSES: readonly HotspotFavoriteStatus[] = ["saved", "used", "dropped"];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HotspotHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HotspotHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new HotspotHttpError(status, code, message, details);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const shape = error as { message?: string; details?: string; hint?: string };
  return (
    [shape?.message, shape?.details, shape?.hint].filter(Boolean).join(" · ") ||
    String(error ?? "未知錯誤")
  );
}

function isMissingSchema(message: string): boolean {
  return /42P01|PGRST205|schema cache|could not find the table|relation .* does not exist/i.test(
    message,
  );
}

function requireUuid(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(text)) fail(400, "invalid_request", `${field} 必須是 uuid`);
  return text;
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireUuid(value, field);
}

function optionalText(value: unknown, maxLength: number, field: string): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > maxLength) {
    fail(400, "invalid_request", `${field} 最多 ${maxLength} 字`);
  }
  return text;
}

function parseTargetIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) fail(400, "invalid_request", "target_ids 必須是陣列");

  const ids: string[] = [];
  for (const item of value) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text) continue;
    if (!UUID_PATTERN.test(text)) fail(400, "invalid_request", "target_ids 內含非 uuid 值");
    if (!ids.includes(text)) ids.push(text);
  }

  if (ids.length === 0) fail(400, "invalid_request", "target_ids 不可為空");
  if (ids.length > HOTSPOT_MAX_TARGETS_PER_RUN) {
    fail(400, "invalid_request", `一次最多 ${HOTSPOT_MAX_TARGETS_PER_RUN} 個目標`);
  }
  return ids;
}

// ============================================================
// 設定與用量
// ============================================================

interface SettingsRow {
  id?: string;
  auto_daily?: boolean | null;
  monthly_budget_usd?: number | string | null;
  min_engagement?: number | string | null;
  items_per_target?: number | string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

const FALLBACK_SETTINGS: HotspotSettings = {
  id: "default",
  auto_daily: true,
  monthly_budget_usd: HOTSPOT_MONTHLY_BUDGET_USD,
  min_engagement: HOTSPOT_MIN_ENGAGEMENT,
  items_per_target: 20,
  updated_by: null,
  updated_at: new Date(0).toISOString(),
};

function mapSettings(row: SettingsRow | null): HotspotSettings {
  if (!row) return { ...FALLBACK_SETTINGS };
  return {
    id: String(row.id ?? "default"),
    auto_daily: row.auto_daily !== false,
    monthly_budget_usd: Math.max(0, toFiniteNumber(row.monthly_budget_usd ?? HOTSPOT_MONTHLY_BUDGET_USD)),
    min_engagement: Math.max(0, Math.floor(toFiniteNumber(row.min_engagement ?? HOTSPOT_MIN_ENGAGEMENT))),
    items_per_target: Math.min(
      50,
      Math.max(1, Math.floor(toFiniteNumber(row.items_per_target ?? 20))),
    ),
    updated_by: row.updated_by == null ? null : String(row.updated_by),
    updated_at: String(row.updated_at ?? new Date(0).toISOString()),
  };
}

async function loadSettings(db: Db): Promise<HotspotSettings> {
  const { data, error } = await db
    .from("hotspot_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  return mapSettings((data ?? null) as SettingsRow | null);
}

/** 香港時區的「本月起點」對應的 UTC 時間 */
function hongKongMonthStartIso(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 3_600_000);
  const monthStartUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
  return new Date(monthStartUtc - 8 * 3_600_000).toISOString();
}

interface UsageSnapshot {
  month_spend_usd: number;
  month_items: number;
  budget_pct: number;
}

async function loadUsage(db: Db, settings: HotspotSettings): Promise<UsageSnapshot> {
  const runs = await loadMonthRuns(db, hongKongMonthStartIso());
  const monthSpendUsd = monthSpend(runs);
  const monthItems = runs.reduce((sum, run) => sum + Math.max(0, toFiniteNumber(run.items_new)), 0);
  return {
    month_spend_usd: monthSpendUsd,
    month_items: monthItems,
    budget_pct: budgetPercent(monthSpendUsd, settings.monthly_budget_usd),
  };
}

async function readDailyStatus(db: Db): Promise<{
  enabled: boolean;
  schedule: string | null;
  jobname: string | null;
}> {
  const { data, error } = await db.rpc("hotspot_radar_daily_status");
  if (error) {
    // migration 尚未套用時不讓整個設定頁壞掉
    return { enabled: false, schedule: null, jobname: null };
  }
  const value = (data ?? null) as { enabled?: boolean; schedule?: string | null; jobname?: string | null } | null;
  return {
    enabled: value?.enabled === true,
    schedule: value?.schedule == null ? null : String(value.schedule),
    jobname: value?.jobname == null ? null : String(value.jobname),
  };
}

async function settingsPayload(db: Db): Promise<{
  settings: HotspotSettings;
  usage: UsageSnapshot;
  daily: { enabled: boolean; schedule: string | null; jobname: string | null };
}> {
  const settings = await loadSettings(db);
  const [usage, daily] = await Promise.all([loadUsage(db, settings), readDailyStatus(db)]);
  return { settings, usage, daily };
}

function mapRunRow(row: Record<string, unknown> | null): HotspotRunRow | null {
  if (!row) return null;
  const trigger = row.trigger === "cron" ? "cron" : "manual";
  const status =
    row.status === "success" || row.status === "error" ? row.status : ("running" as const);
  return {
    id: String(row.id),
    trigger,
    status,
    targets_fetched: Math.max(0, Math.floor(toFiniteNumber(row.targets_fetched))),
    items_new: Math.max(0, Math.floor(toFiniteNumber(row.items_new))),
    items_upserted: Math.max(0, Math.floor(toFiniteNumber(row.items_upserted))),
    api_calls: Math.max(0, Math.floor(toFiniteNumber(row.api_calls))),
    cost_usd: Math.max(0, toFiniteNumber(row.cost_usd)),
    error_message: row.error_message == null ? null : String(row.error_message),
    meta: (row.meta as Record<string, unknown> | null) ?? null,
    started_at: String(row.started_at ?? ""),
    finished_at: row.finished_at == null ? null : String(row.finished_at),
  };
}

async function loadRun(db: Db, runId: string): Promise<HotspotRunRow | null> {
  const { data, error } = await db.from("hotspot_runs").select("*").eq("id", runId).maybeSingle();
  if (error) throw error;
  return mapRunRow((data ?? null) as Record<string, unknown> | null);
}

// ============================================================
// 抓取
// ============================================================

interface ScanCounters {
  fetched: number;
  itemsNew: number;
  upserted: number;
  apiCalls: number;
  costUsd: number;
}

function emptyScan(warning: string) {
  return {
    run: null,
    targets_fetched: 0,
    targets_remaining: 0,
    items_new: 0,
    items_upserted: 0,
    cost_usd: 0,
    warnings: [warning],
  };
}

async function assertNoRunningScan(db: Db): Promise<void> {
  const since = new Date(Date.now() - HOTSPOT_RUNNING_STALE_MS).toISOString();
  if (await hasRunningRun(db, since)) {
    fail(409, "scan_in_progress", "上一次抓取還在進行中，請稍後再試");
  }
}

async function runScan(options: {
  body: Record<string, unknown>;
  trigger: "manual" | "cron";
}): Promise<{
  run: HotspotRunRow | null;
  targets_fetched: number;
  targets_remaining: number;
  items_new: number;
  items_upserted: number;
  cost_usd: number;
  warnings: string[];
}> {
  const db = serviceClient();
  const settings = await loadSettings(db);
  const usage = await loadUsage(db, settings);

  if (usage.month_spend_usd >= settings.monthly_budget_usd) {
    fail(
      402,
      "budget_blocked",
      `本月已花費 US$${usage.month_spend_usd}，達上限 US$${settings.monthly_budget_usd}，已停止抓取`,
      { month_spend_usd: usage.month_spend_usd, budget_usd: settings.monthly_budget_usd },
    );
  }

  await assertNoRunningScan(db);

  const provider = resolveProvider();
  const requestedIds = parseTargetIds(options.body.target_ids);

  const targets = requestedIds
    ? await listTargetsByIds(db, requestedIds)
    : await listCandidateTargets(db, HOTSPOT_MAX_TARGETS_PER_RUN);

  if (requestedIds && targets.length === 0) {
    fail(404, "target_not_found", "找不到指定的監測目標（可能已被刪除）");
  }
  if (targets.length === 0) {
    return emptyScan("no_targets");
  }

  const totalActive = await countActiveTargets(db);
  const prices = {
    standardUsd: provider.unitPricePer1000("account"),
    adsUsd: provider.unitPricePer1000("ad_keyword"),
  };
  const plan = planBudget({
    kinds: targets.map((target) => target.kind),
    itemsPerTarget: settings.items_per_target,
    spentUsd: usage.month_spend_usd,
    budgetUsd: settings.monthly_budget_usd,
    prices,
  });

  if (plan.blocked) {
    fail(
      402,
      "budget_blocked",
      "剩餘預算不足，已停止抓取（可提高月上限或減少目標）",
      { month_spend_usd: usage.month_spend_usd, budget_usd: settings.monthly_budget_usd },
    );
  }

  const selected = targets.slice(0, plan.allowed);
  const warnings: string[] = [];
  if (plan.trimmed > 0) warnings.push(`budget_trimmed:${plan.trimmed}`);

  const runId = await startRun(db, options.trigger, {
    provider: provider.name,
    scope: requestedIds ? "selected" : "all",
    targets: selected.length,
    estimated_usd: plan.estimatedUsd,
    trimmed: plan.trimmed,
  });

  const counters: ScanCounters = { fetched: 0, itemsNew: 0, upserted: 0, apiCalls: 0, costUsd: 0 };
  const deadline = Date.now() + HOTSPOT_TIME_BUDGET_MS;

  try {
    for (const target of selected) {
      if (Date.now() > deadline) {
        warnings.push("time_budget_exhausted");
        break;
      }

      // 免費 RSS 渠道只支援帳號；hashtag／廣告要由其他來源補，跳過而不是讓整批失敗
      if (provider.supports && !provider.supports(target.kind)) {
        warnings.push(`unsupported_source:${target.kind}`);
        continue;
      }

      try {
        const limit = itemsForKind(target.kind, settings.items_per_target);
        const drafts = await fetchTargetItems(provider, target, limit);
        counters.apiCalls += 1;

        const result = await upsertItems(
          db,
          target,
          drafts,
          provider.unitPricePer1000(target.kind),
        );
        counters.fetched += 1;
        counters.itemsNew += result.inserted;
        counters.upserted += result.upserted;
        counters.costUsd += result.costUsd;

        await markTargetFetched(db, target.id);
      } catch (error) {
        warnings.push(`target_failed:${target.value}`.slice(0, 120));
        await markTargetFailed(db, target.id, errorMessage(error));

        // 供應商層級錯誤（token 壞、被限流）不該繼續打其他目標
        if (error instanceof HotspotProviderError && !error.retryable) throw error;
      }
    }

    const remaining = computeTargetsRemaining({
      scope: requestedIds ? "selected" : "all",
      totalActive,
      selected: selected.length,
      fetched: counters.fetched,
    });
    const costUsd = roundTo(counters.costUsd, 4);

    await finishRun(db, runId, {
      status: "success",
      targets_fetched: counters.fetched,
      items_new: counters.itemsNew,
      items_upserted: counters.upserted,
      api_calls: counters.apiCalls,
      cost_usd: costUsd,
      error_message: warnings.length > 0 ? warnings.join(" · ").slice(0, 500) : null,
      meta: {
        provider: provider.name,
        scope: requestedIds ? "selected" : "all",
        trimmed: plan.trimmed,
        remaining,
        warnings,
      },
    });

    return {
      run: await loadRun(db, runId),
      targets_fetched: counters.fetched,
      targets_remaining: remaining,
      items_new: counters.itemsNew,
      items_upserted: counters.upserted,
      cost_usd: costUsd,
      warnings,
    };
  } catch (error) {
    await finishRun(db, runId, {
      status: "error",
      targets_fetched: counters.fetched,
      items_new: counters.itemsNew,
      items_upserted: counters.upserted,
      api_calls: counters.apiCalls,
      cost_usd: roundTo(counters.costUsd, 4),
      error_message: errorMessage(error).slice(0, 500),
    }).catch(() => undefined);
    throw error;
  }
}

async function handleScan(body: Record<string, unknown>) {
  return runScan({ body, trigger: "manual" });
}

async function handleScanAll(_body: Record<string, unknown>) {
  return runScan({ body: {}, trigger: "manual" });
}

async function handleCronScan() {
  const db = serviceClient();
  const settings = await loadSettings(db);

  if (!settings.auto_daily) {
    const runId = await startRun(db, "cron", { skipped: "auto_daily_off" });
    await finishRun(db, runId, {
      status: "success",
      meta: { skipped: "auto_daily_off" },
    });
    return emptyScan("auto_daily_off");
  }

  const result = await runScan({ body: {}, trigger: "cron" });

  // 保留清理失敗不影響本次抓取結果
  let pruned = 0;
  try {
    pruned = await pruneOldItems(db, HOTSPOT_RETENTION_DAYS);
  } catch (error) {
    console.error("[hotspot-radar] prune failed:", errorMessage(error));
  }

  return { ...result, pruned };
}

async function handleTestTarget(body: Record<string, unknown>) {
  const kindRaw = body.kind;
  if (!isHotspotKind(kindRaw)) fail(400, "invalid_request", "kind 不合法");

  const kind = kindRaw as HotspotKind;
  const normalized = normalizeTarget(kind, body.value);
  if (!normalized.valid) {
    return {
      valid: false,
      normalized: "",
      preview_count: 0,
      cost_usd: 0,
      run_id: null,
    };
  }

  const db = serviceClient();
  const settings = await loadSettings(db);
  const usage = await loadUsage(db, settings);

  if (usage.month_spend_usd >= settings.monthly_budget_usd) {
    fail(402, "budget_blocked", "本月已達上限，無法再測試目標", {
      month_spend_usd: usage.month_spend_usd,
      budget_usd: settings.monthly_budget_usd,
    });
  }

  const provider = resolveProvider();
  if (provider.supports && !provider.supports(kind)) {
    const label = kind === "hashtag" ? "Hashtag" : kind === "ad_keyword" ? "廣告" : kind;
    fail(
      400,
      "unsupported_source",
      `目前供應商（${provider.name}）不支援${label}目標：IG RSS 只支援帳號；Hashtag／廣告需要其他來源`,
    );
  }
  const drafts: HotspotItemDraft[] = await fetchTargetItems(
    provider,
    { kind, value: normalized.value },
    HOTSPOT_TEST_TARGET_PREVIEW,
  );

  const costUsd = estimateCostUsd(drafts.length, provider.unitPricePer1000(kind));
  const runId = await startRun(db, "manual", { kind: "test", provider: provider.name });
  await finishRun(db, runId, {
    status: "success",
    targets_fetched: 0,
    items_new: 0,
    items_upserted: 0,
    api_calls: 1,
    cost_usd: costUsd,
    meta: { kind: "test", normalized: normalized.value },
  });

  return {
    valid: true,
    normalized: normalized.value,
    preview_count: drafts.length,
    cost_usd: costUsd,
    run_id: runId,
  };
}

// ============================================================
// 收藏
// ============================================================

async function handleFavorite(body: Record<string, unknown>, actor: ContentActor) {
  const itemId = requireUuid(body.item_id, "item_id");
  const statusRaw = typeof body.status === "string" ? body.status.trim() : "saved";
  const status = (FAVORITE_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as HotspotFavoriteStatus)
    : null;
  if (!status) fail(400, "invalid_request", "status 只接受 saved / used / dropped");

  const noteProvided = Object.prototype.hasOwnProperty.call(body, "note");
  let note: string | null = null;
  if (noteProvided) {
    note = body.note === null || body.note === undefined ? null : String(body.note).trim() || null;
    if (note && note.length > HOTSPOT_MAX_NOTE_LENGTH) {
      fail(400, "invalid_request", `備註最多 ${HOTSPOT_MAX_NOTE_LENGTH} 字`);
    }
  }

  const db = serviceClient();
  const { data: item, error: itemError } = await db
    .from("hotspot_items")
    .select("id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) fail(404, "item_not_found", "找不到這則內容（可能已被清理）");

  const now = new Date().toISOString();
  const { data: existing, error: findError } = await db
    .from("hotspot_favorites")
    .select("id,status,note")
    .eq("item_id", itemId)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const patch: Record<string, unknown> = {
      status,
      updated_at: now,
      ...(noteProvided ? { note } : {}),
    };
    const { error } = await db
      .from("hotspot_favorites")
      .update(patch)
      .eq("item_id", itemId);
    if (error) throw error;
  } else {
    const { error } = await db.from("hotspot_favorites").insert({
      item_id: itemId,
      status,
      note,
      created_by: actor.userId,
    });
    if (error) {
      // 兩個人同時收藏同一則內容時，先查再插會撞唯一鍵；改成重試 update，
      // 而不是把使用者的操作變成錯誤。
      if (/duplicate key|23505/i.test(errorMessage(error))) {
        const { error: retryError } = await db
          .from("hotspot_favorites")
          .update({ status, note, updated_at: now })
          .eq("item_id", itemId);
        if (retryError) throw retryError;
      } else {
        throw error;
      }
    }
  }

  const { data: favorite, error: reloadError } = await db
    .from("hotspot_favorites")
    .select("*")
    .eq("item_id", itemId)
    .single();
  if (reloadError) throw reloadError;

  return { favorite };
}

async function handleUnfavorite(body: Record<string, unknown>) {
  const itemId = requireUuid(body.item_id, "item_id");
  const db = serviceClient();
  const { error } = await db.from("hotspot_favorites").delete().eq("item_id", itemId);
  if (error) throw error;
  return { removed: true, item_id: itemId };
}

// ============================================================
// 設定
// ============================================================

async function handleSettings() {
  return settingsPayload(serviceClient());
}

async function handleUpdateSettings(body: Record<string, unknown>, actor: ContentActor) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, "auto_daily")) {
    if (typeof body.auto_daily !== "boolean") {
      fail(400, "invalid_request", "auto_daily 必須是 boolean");
    }
    patch.auto_daily = body.auto_daily;
  }
  if (Object.prototype.hasOwnProperty.call(body, "monthly_budget_usd")) {
    const value = toFiniteNumber(body.monthly_budget_usd);
    if (value < 0 || value > 100_000) fail(400, "invalid_request", "月上限需在 0–100000 之間");
    patch.monthly_budget_usd = roundTo(value, 2);
  }
  if (Object.prototype.hasOwnProperty.call(body, "min_engagement")) {
    const value = Math.floor(toFiniteNumber(body.min_engagement));
    if (value < 0 || value > 1_000_000) fail(400, "invalid_request", "最低互動需在 0–1000000 之間");
    patch.min_engagement = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, "items_per_target")) {
    const value = Math.floor(toFiniteNumber(body.items_per_target));
    if (value < 1 || value > 50) fail(400, "invalid_request", "每目標筆數需在 1–50 之間");
    patch.items_per_target = value;
  }

  if (Object.keys(patch).length <= 1) fail(400, "invalid_request", "沒有可更新的設定欄位");

  patch.updated_by = actor.userId;

  const db = serviceClient();
  const { error } = await db.from("hotspot_settings").update(patch).eq("id", "default");
  if (error) throw error;

  return settingsPayload(db);
}

async function handleSetDaily(body: Record<string, unknown>) {
  const enabled = body.enabled === true;
  const db = serviceClient();
  const { data, error } = await db.rpc("hotspot_radar_set_daily", { p_enabled: enabled });
  if (error) throw error;

  if (data && (data as { ok?: boolean }).ok === false) {
    fail(409, "job_missing", "每日自動抓取尚未建立，請先完成部署（cron migration）");
  }
  return { daily: data };
}

// ============================================================
// 目標 CRUD
// ============================================================

async function handleCreateTarget(body: Record<string, unknown>, actor: ContentActor) {
  const kindRaw = body.kind;
  if (!isHotspotKind(kindRaw)) fail(400, "invalid_request", "kind 不合法");

  const kind = kindRaw as HotspotKind;
  const normalized = normalizeTarget(kind, body.value);
  if (!normalized.valid) {
    fail(
      400,
      "invalid_request",
      kind === "account"
        ? "Instagram 帳號格式不正確（只接受英數、點、底線，最多 30 字）"
        : kind === "hashtag"
          ? "Hashtag 格式不正確（不可含空白，最多 50 字）"
          : "廣告關鍵字格式不正確（2–80 字，需含文字或數字）",
    );
  }

  const label = optionalText(body.label, 80, "label");
  const notes = optionalText(body.notes, 500, "notes");
  const brandId = optionalUuid(body.brand_id, "brand_id");
  const active = body.active === undefined ? true : body.active === true;

  const db = serviceClient();
  const { data, error } = await db
    .from("hotspot_targets")
    .insert({
      kind,
      platform: normalized.platform,
      value: normalized.value,
      value_normalized: normalized.value_normalized,
      label,
      brand_id: brandId,
      notes,
      active,
      created_by: actor.userId,
    })
    .select("*")
    .single();

  if (error) {
    if (/duplicate key|23505/i.test(errorMessage(error))) {
      // 只有 targets 的 23505 才是「目標已存在」；其他表撞唯一鍵不該用這句文案
      if (/hotspot_targets/i.test(errorMessage(error))) {
        fail(409, "target_exists", "這個目標已經存在，不需要重複新增");
      }
      fail(409, "conflict", "資料剛被其他人更新，請重試");
    }
    throw error;
  }

  return { target: data };
}

async function handleUpdateTarget(body: Record<string, unknown>) {
  const id = requireUuid(body.id, "id");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (Object.prototype.hasOwnProperty.call(body, "label")) {
    patch.label = optionalText(body.label, 80, "label");
  }
  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    patch.notes = optionalText(body.notes, 500, "notes");
  }
  if (Object.prototype.hasOwnProperty.call(body, "brand_id")) {
    patch.brand_id = optionalUuid(body.brand_id, "brand_id");
  }
  if (Object.prototype.hasOwnProperty.call(body, "active")) {
    if (typeof body.active !== "boolean") fail(400, "invalid_request", "active 必須是 boolean");
    patch.active = body.active;
  }

  if (Object.keys(patch).length <= 1) fail(400, "invalid_request", "沒有可更新的欄位");

  const db = serviceClient();
  const { data, error } = await db
    .from("hotspot_targets")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) fail(404, "target_not_found", "找不到這個監測目標");
  return { target: data };
}

async function handleDeleteTarget(body: Record<string, unknown>) {
  const id = requireUuid(body.id, "id");
  const db = serviceClient();
  const { error } = await db.from("hotspot_targets").delete().eq("id", id);
  if (error) throw error;
  return { deleted: true, id };
}

// ============================================================
// 入口
// ============================================================

type ActionHandler = (body: Record<string, unknown>, actor: ContentActor) => Promise<unknown>;

const ACTION_HANDLERS: Record<string, ActionHandler> = {
  scan: (body) => handleScan(body),
  scan_all: () => handleScanAll({}),
  test_target: (body) => handleTestTarget(body),
  favorite: (body, actor) => handleFavorite(body, actor),
  unfavorite: (body) => handleUnfavorite(body),
  settings: () => handleSettings(),
  update_settings: (body, actor) => handleUpdateSettings(body, actor),
  set_daily: (body) => handleSetDaily(body),
  create_target: (body, actor) => handleCreateTarget(body, actor),
  update_target: (body) => handleUpdateTarget(body),
  delete_target: (body) => handleDeleteTarget(body),
};

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

    const permission = ACTION_ADMIN_ONLY.has(action)
      ? "manage_settings"
      : ACTION_VIEW_ONLY.has(action)
        ? "view"
        : "write";
    const forbidden = requireAction(actor, permission);
    if (forbidden) return forbidden;

    const handler = ACTION_HANDLERS[action];
    if (!handler) return failJson(400, "unknown_action", `未知的動作：${action}`);

    return okJson(await handler(body, actor));
  } catch (error) {
    if (error instanceof HotspotHttpError) {
      return failJson(error.status, error.code, error.message, error.details);
    }
    if (error instanceof HotspotProviderError) {
      return failJson(error.status, error.code, error.message);
    }

    const message = errorMessage(error);
    if (isMissingSchema(message)) {
      return failJson(500, "schema_missing", "熱點雷達資料表尚未建立，請先套用 migration");
    }
    if (/duplicate key|23505/i.test(message)) {
      if (/hotspot_targets/i.test(message)) {
        return failJson(409, "target_exists", "這個目標已經存在，不需要重複新增");
      }
      if (/hotspot_favorites/i.test(message)) {
        return failJson(409, "favorite_conflict", "這則內容的收藏狀態剛被其他人更新，請重試");
      }
      return failJson(409, "conflict", "資料剛被其他人更新，請重試");
    }

    console.error("[hotspot-radar] unhandled error:", message);
    return failJson(500, "internal_error", "處理請求時發生未預期的錯誤");
  }
});
