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
} from "../_shared/contentAuth.ts";
import {
  dedupeKey,
  heatScore,
  pickCanonicalPost,
} from "../../../src/lib/contentSocialDedupe.ts";
import {
  duplicateVerdict,
  findSimilarEvents,
} from "../../../src/lib/contentSocialCluster.ts";
import {
  grokConfigured,
  judgeEventRelation,
  SAME_EVENT_MIN_CONFIDENCE,
  SAME_EVENT_RELATIONS,
} from "../_shared/contentSocialLlm.ts";
import { estimateLlmCostUsd } from "../../../src/lib/contentFormat.ts";

/** 呼叫 Grok 判斷兩則報導的關係，並把 token 用量寫進 content_llm_usage（use_case=social_dedupe） */
async function judgeWithUsage(
  db: Db,
  input: {
    titleA: string;
    summaryA?: string | null;
    titleB: string;
    summaryB?: string | null;
    pass?: "first" | "review";
    timeoutMs?: number;
  },
): Promise<{ relation: string; confidence: number; reason: string } | null> {
  const verdict = await judgeEventRelation(input);
  if (!verdict) return null;
  await db.from("content_llm_usage").insert({
    site_id: null,
    article_id: null,
    job_id: null,
    model: verdict.usage.model,
    use_case: "social_dedupe",
    tokens_in: verdict.usage.tokens_in,
    tokens_out: verdict.usage.tokens_out,
    cost_usd: estimateLlmCostUsd(
      verdict.usage.model,
      verdict.usage.tokens_in,
      verdict.usage.tokens_out,
    ),
  });
  return { relation: verdict.relation, confidence: verdict.confidence, reason: verdict.reason };
}

/** 模型的四種關係收斂成「是否同一件事」 */
function verdictSaysSame(
  verdict: { relation: string; confidence: number } | null,
  minConfidence = SAME_EVENT_MIN_CONFIDENCE,
): boolean {
  if (!verdict) return false;
  return (
    (SAME_EVENT_RELATIONS as readonly string[]).includes(verdict.relation) &&
    verdict.confidence >= minConfidence
  );
}

/**
 * content-sources｜M5-02 熱點自動抓取（P4b）＋ M5-04 營運健康
 *
 * actions：
 *   fetch_sources  service  抓取到期來源的 RSS → 去重、評分 → 寫 content_hot_events(open)
 *   health         view     回傳營運告警（憑證失效／待審逾期／job dead／發布失敗／來源異常）
 *
 * 設計原則：
 *   - 不引入 RSS 套件：RSS 2.0 的 <item> 結構用 regex 足夠，減少 Deno 依賴與冷啟動
 *   - 去重鍵與 CSV 匯入共用 `dedupeKey()`（有 URL 用正規化 URL，否則 simhash）
 *   - 事情層聚簇借用 AIHOT：用「標題＋摘要」召回前 3 個候選 → 四種關係＋信心度判斷
 *     （≥0.66 直接合併、0.32–0.66 問模型、信心 <0.9 再覆核），重複報導掛進
 *     `content_hot_items`，不新增第二個事件
 *   - 單一來源失敗不影響其他來源；每次抓取都有 90 秒預算
 *   - 抓到的熱點只寫成 open，實際產稿交給 content-social 的 cron（既有鏈路）
 */

const FETCH_TIMEOUT_MS = 20_000;
const TICK_BUDGET_MS = 90_000;
const MAX_ITEMS_PER_SOURCE = 40;
/** 只收 48 小時內的新聞；Google News 搜尋會回傳很久以前的文章 */
const MAX_AGE_HOURS = 48;
/** 每輪最多用模型判斷幾個「疑似同一事件」的候選，控制延遲與成本 */
const MAX_LLM_CHECKS = 6;

interface RecentEvent {
  id: string;
  title: string;
  summary: string | null;
  item_ids: string[] | null;
  heat: number;
  status?: string;
  duplicate_of?: string | null;
}
const USER_AGENT = "MPS-ContentBot/1.0 (+https://bwteam-marketing.com)";

type Db = ReturnType<typeof serviceClient>;

interface SourceRow {
  id: string;
  name: string;
  kind: string;
  url: string;
  tier: number;
  enabled: boolean;
  fetch_interval_minutes: number;
  last_fetched_at: string | null;
  consecutive_empty: number;
  last_error: string | null;
}

interface RssItem {
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const shape = error as { message?: string; code?: string; details?: string };
    return [shape.message, shape.code, shape.details].filter(Boolean).join(" · ") || JSON.stringify(error);
  }
  return String(error);
}

// ============================================================
// RSS 解析（RSS 2.0 / Atom 兼容的最小實作）
// ============================================================

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function pickTag(block: string, tags: string[]): string {
  for (const tag of tags) {
    const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
    if (match) return decodeEntities(match[1]).trim();
  }
  return "";
}

/** 抓 <item> 與 Atom <entry>；解析失敗回空陣列（由呼叫端標記來源錯誤） */
export function parseFeed(xml: string): RssItem[] {
  const blocks = [
    ...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
  ].map((match) => match[1]);

  const items: RssItem[] = [];
  for (const block of blocks) {
    const rawTitle = stripHtml(pickTag(block, ["title"]));
    // Google News 會在標題尾加「 - 來源」，去掉比較好去重與顯示
    const title = rawTitle.replace(/\s+-\s+[^-]{1,40}$/, "").trim();
    let url = pickTag(block, ["link"]).trim();
    if (!url) {
      const href = /<link\b[^>]*href="([^"]+)"/i.exec(block);
      if (href) url = href[1].trim();
    }
    if (!url) {
      const guid = pickTag(block, ["guid", "id"]).trim();
      if (/^https?:\/\//i.test(guid)) url = guid;
    }
    if (!title || title.length < 6) continue;
    if (!/^https?:\/\//i.test(url)) continue;

    const summaryRaw = stripHtml(pickTag(block, ["description", "summary", "content"]));
    const publishedRaw = pickTag(block, ["pubDate", "published", "updated", "dc:date"]);
    const published = publishedRaw ? new Date(publishedRaw) : null;

    items.push({
      title: title.slice(0, 200),
      url,
      summary: summaryRaw ? summaryRaw.slice(0, 400) : null,
      publishedAt:
        published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
    });
  }
  return items;
}

// ============================================================
// fetch_sources
// ============================================================

function isDue(source: SourceRow, now: number): boolean {
  if (!source.enabled) return false;
  if (!source.last_fetched_at) return true;
  const last = new Date(source.last_fetched_at).getTime();
  const interval = Math.max(15, Number(source.fetch_interval_minutes) || 60) * 60_000;
  return now - last >= interval;
}

async function loadExistingKeys(db: Db, keys: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  // Google News 的連結很長（~300 字元），批次太大會超過 PostgREST 的 URL 長度
  for (let index = 0; index < keys.length; index += 10) {
    const chunk = keys.slice(index, index + 10);
    const { data, error } = await db
      .from("content_hot_events")
      .select("dedupe_key")
      .in("dedupe_key", chunk);
    if (error) throw new Error(`查詢既有去重鍵失敗：${errorMessage(error)}`);
    for (const row of (data ?? []) as { dedupe_key: string | null }[]) {
      if (row.dedupe_key) existing.add(row.dedupe_key);
    }
  }
  return existing;
}

async function loadRecentEvents(db: Db, days = 14): Promise<RecentEvent[]> {
  const since = new Date(Date.now() - days * 24 * 3_600_000).toISOString();
  const { data, error } = await db
    .from("content_hot_events")
    .select("id, title, summary, item_ids, heat, status, duplicate_of")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    // duplicate_of 的 migration 未推（部署順序顛倒）→ 退回不含該欄的查詢
    if (String((error as { code?: string }).code) === "PGRST204") {
      const fallback = await db
        .from("content_hot_events")
        .select("id, title, summary, item_ids, heat, status")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300);
      if (fallback.error) throw new Error(`查詢近期熱點失敗：${errorMessage(fallback.error)}`);
      return ((fallback.data ?? []) as RecentEvent[]).filter(
        (row) => Boolean(row.title) && row.status !== "ignored",
      );
    }
    throw new Error(`查詢近期熱點失敗：${errorMessage(error)}`);
  }
  // 已忽略／已合併的事件不能再當聚簇目標，否則新報導會掛到一個讀者看不到的事件
  return ((data ?? []) as RecentEvent[]).filter(
    (row) => Boolean(row.title) && row.status !== "ignored" && !row.duplicate_of,
  );
}

/**
 * 把重複報導掛到既有事件（AIHOT 的 event_items 概念）：
 * 新增一筆 content_hot_items，並把 id 追加到 event.item_ids；熱度小幅累加。
 */
async function attachToEvent(
  db: Db,
  event: RecentEvent,
  item: RssItem,
  source: SourceRow,
): Promise<boolean> {
  const { data: itemRow, error: itemError } = await db
    .from("content_hot_items")
    .insert({
      title: item.title,
      url: item.url,
      summary: item.summary,
      source: source.kind === "rss" ? "rss" : source.kind,
      heat: Math.round(heatScore(source.tier, 0)),
    })
    .select("id")
    .single();
  if (itemError || !itemRow) {
    console.warn(`[content-sources] 寫入事件來源失敗：${dbError(itemError)}`);
    return false;
  }
  const nextIds = [...(event.item_ids ?? []), (itemRow as { id: string }).id];
  const { error: updateError } = await db
    .from("content_hot_events")
    .update({ item_ids: nextIds, heat: Math.min(100, Number(event.heat ?? 0) + 3) })
    .eq("id", event.id);
  if (updateError) {
    console.warn(`[content-sources] 更新事件聚簇失敗：${dbError(updateError)}`);
    return false;
  }
  event.item_ids = nextIds;
  event.heat = Math.min(100, Number(event.heat ?? 0) + 3);
  return true;
}

async function fetchSource(db: Db, source: SourceRow): Promise<{
  name: string;
  fetched: number;
  inserted: number;
  clustered?: number;
  skipped: number;
  stale?: number;
  llmChecks?: number;
  error?: string;
}> {
  let response: Response;
  try {
    response = await fetch(source.url, {
      headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    await markSourceFailed(db, source, errorMessage(error));
    return { name: source.name, fetched: 0, inserted: 0, skipped: 0, error: errorMessage(error) };
  }

  if (!response.ok) {
    const message = `HTTP ${response.status}`;
    await markSourceFailed(db, source, message);
    return { name: source.name, fetched: 0, inserted: 0, skipped: 0, error: message };
  }

  const xml = await response.text();
  const parsedItems = parseFeed(xml);
  // 只留新鮮內容；沒有 pubDate 的保守保留（有些 feed 不提供）
  const items = parsedItems
    .filter((item) => {
      if (!item.publishedAt) return true;
      const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
      return ageHours <= MAX_AGE_HOURS;
    })
    .slice(0, MAX_ITEMS_PER_SOURCE);
  const staleCount = parsedItems.length - items.length;
  if (items.length === 0) {
    // 可能是空 feed，也可能格式不合；不當成錯誤，只累計 consecutive_empty
    await db
      .from("content_sources")
      .update({ last_fetched_at: nowIso(), consecutive_empty: source.consecutive_empty + 1 })
      .eq("id", source.id);
    return { name: source.name, fetched: 0, inserted: 0, skipped: 0 };
  }

  const seen = new Set<string>();
  const candidates = items
    .map((item) => ({ ...item, key: dedupeKey(item.url, item.title) }))
    .filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });

  const existing = await loadExistingKeys(db, candidates.map((item) => item.key));
  // AIHOT 式聚簇：先按「標題＋摘要」召回最像的既有事件；
  // 夠像的直接掛上去，不夠像的再讓模型判斷，模型說同一件事但信心不夠高時再覆核一次。
  const recentEvents = await loadRecentEvents(db);
  let inserted = 0;
  let clustered = 0;
  let skipped = staleCount;
  let llmChecks = 0;

  for (const item of candidates) {
    if (existing.has(item.key)) {
      skipped += 1;
      continue;
    }

    const similar = findSimilarEvents(item, recentEvents, (event) => event, 3);
    let matched: RecentEvent | null = null;
    for (const candidate of similar) {
      const verdict = duplicateVerdict(candidate.score);
      if (verdict === "distinct") break;
      if (verdict === "duplicate") {
        matched = candidate.item;
        break;
      }
      // 召回只是「可疑」，交給模型判斷；沒有 key 或預算用完就保守當新事件
      if (!grokConfigured() || llmChecks >= MAX_LLM_CHECKS) break;
      llmChecks += 1;
      const first = await judgeWithUsage(db, {
        titleA: item.title,
        summaryA: item.summary,
        titleB: candidate.item.title,
        summaryB: candidate.item.summary,
        timeoutMs: 12_000,
      });
      if (!verdictSaysSame(first)) continue;
      if ((first?.confidence ?? 0) >= 0.9) {
        matched = candidate.item;
        break;
      }
      // 寫入前覆核（AIHOT 的 groupReview）：召回分數不高時，兩次都同意才合併
      if (llmChecks >= MAX_LLM_CHECKS) break;
      llmChecks += 1;
      const review = await judgeWithUsage(db, {
        titleA: item.title,
        summaryA: item.summary,
        titleB: candidate.item.title,
        summaryB: candidate.item.summary,
        pass: "review",
        timeoutMs: 12_000,
      });
      if (verdictSaysSame(review)) {
        matched = candidate.item;
        break;
      }
    }

    if (matched) {
      if (await attachToEvent(db, matched, item, source)) {
        clustered += 1;
        continue;
      }
    }

    const ageHours = item.publishedAt
      ? Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000)
      : 0;
    const heat = Math.round(heatScore(source.tier, ageHours));
    const { data, error } = await db
      .from("content_hot_events")
      .insert({
        title: item.title,
        summary: item.summary,
        url: item.url,
        heat,
        source: source.kind === "rss" ? "rss" : source.kind,
        status: "open",
        dedupe_key: item.key,
      })
      .select("id, title, summary, item_ids, heat")
      .single();
    if (error) {
      // 23505＝同時被抓到（cron 與手動），視為重複
      if (String((error as { code?: string }).code) === "23505") {
        skipped += 1;
        continue;
      }
      console.warn(`[content-sources] 寫入熱點失敗（${source.name}）：${dbError(error)}`);
      continue;
    }
    if (data) {
      recentEvents.unshift({
        id: (data as { id: string }).id,
        title: item.title,
        summary: item.summary,
        item_ids: [],
        heat,
      });
    }
    inserted += 1;
  }

  await db
    .from("content_sources")
    .update({ last_fetched_at: nowIso(), consecutive_empty: 0, last_error: null })
    .eq("id", source.id);

  return {
    name: source.name,
    fetched: parsedItems.length,
    inserted,
    clustered,
    skipped,
    stale: staleCount,
    llmChecks,
  };
}

async function markSourceFailed(db: Db, source: SourceRow, message: string): Promise<void> {
  await db
    .from("content_sources")
    .update({
      last_fetched_at: nowIso(),
      consecutive_empty: source.consecutive_empty + 1,
      last_error: message.slice(0, 500),
    })
    .eq("id", source.id);
}

async function handleFetchSources(db: Db): Promise<unknown> {
  // 總開關關閉時不抓取；避免暫停後仍持續產生新熱點
  const { data: settingsRow } = await db
    .from("content_settings")
    .select("feature_flags")
    .eq("id", "default")
    .maybeSingle();
  const flags = (settingsRow?.feature_flags ?? {}) as Record<string, unknown>;
  if (flags.social_autopilot === false) {
    return { disabled: true, sourcesProcessed: 0, fetched: 0, inserted: 0, skipped: 0, stale: 0, sources: [] };
  }

  const startedAt = Date.now();
  const { data, error } = await db.from("content_sources").select("*").eq("enabled", true);
  if (error) throw new Error(dbError(error));

  const now = Date.now();
  const due = ((data ?? []) as SourceRow[]).filter((source) => isDue(source, now));

  const results: Awaited<ReturnType<typeof fetchSource>>[] = [];
  for (const source of due) {
    if (Date.now() - startedAt > TICK_BUDGET_MS) {
      results.push({ name: source.name, fetched: 0, inserted: 0, skipped: 0, error: "時間預算用盡，留待下一輪" });
      continue;
    }
    results.push(await fetchSource(db, source));
  }

  return {
    sourcesProcessed: results.length,
    fetched: results.reduce((sum, item) => sum + item.fetched, 0),
    inserted: results.reduce((sum, item) => sum + item.inserted, 0),
    clustered: results.reduce((sum, item) => sum + (item.clustered ?? 0), 0),
    skipped: results.reduce((sum, item) => sum + item.skipped, 0),
    stale: results.reduce((sum, item) => sum + (item.stale ?? 0), 0),
    llmChecks: results.reduce((sum, item) => sum + (item.llmChecks ?? 0), 0),
    sources: results,
  };
}

async function handleDedupeBackfill(db: Db, maxChecks = 4): Promise<unknown> {
  const since = new Date(Date.now() - 14 * 24 * 3_600_000).toISOString();
  const { data, error } = await db
    .from("content_hot_events")
    .select("id, title, summary, url, item_ids, heat, status, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(dbError(error));
  const rows = (data ?? []) as (RecentEvent & {
    url: string | null;
    status: string;
    created_at: string;
  })[];

  const keepers: RecentEvent[] = [];
  let merged = 0;
  let llmChecks = 0;
  const MAX_CHECKS = Math.min(6, Math.max(1, Math.floor(maxChecks)));

  for (const row of rows) {
    if (row.status === "ignored") continue;
    const top = findSimilarEvents(row, keepers, (event) => event, 3);
    let matched: RecentEvent | null = null;
    for (const candidate of top) {
      const verdict = duplicateVerdict(candidate.score);
      if (verdict === "distinct") break;
      if (verdict === "duplicate") {
        matched = candidate.item;
        break;
      }
      if (!grokConfigured() || llmChecks >= MAX_CHECKS) break;
      llmChecks += 1;
      const judged = await judgeWithUsage(db, {
        titleA: row.title,
        summaryA: row.summary,
        titleB: candidate.item.title,
        summaryB: candidate.item.summary,
        timeoutMs: 8_000,
      });
      if (!verdictSaysSame(judged)) continue;
      if ((judged?.confidence ?? 0) >= 0.9) {
        matched = candidate.item;
        break;
      }
      if (llmChecks >= MAX_CHECKS) break;
      llmChecks += 1;
      const review = await judgeWithUsage(db, {
        titleA: row.title,
        summaryA: row.summary,
        titleB: candidate.item.title,
        summaryB: candidate.item.summary,
        pass: "review",
        timeoutMs: 8_000,
      });
      if (verdictSaysSame(review)) {
        matched = candidate.item;
        break;
      }
    }

    if (!matched) {
      keepers.push({ id: row.id, title: row.title, summary: row.summary, item_ids: row.item_ids, heat: row.heat });
      continue;
    }

    if (await mergeEvents(db, matched.id, row.id)) {
      matched.heat = Math.min(100, Number(matched.heat ?? 0) + 3);
      merged += 1;
    }
  }

  return { events: rows.length, merged, llmChecks };
}

/**
 * 把 drop 併進 keep：報導掛到 keep 的 item_ids、熱度累加、**所有成稿改掛 keep 並去重**，
 * 最後把 drop 標成 ignored + duplicate_of。
 *
 * 成稿處理（2026-11-26 去重改動）：一個事件只留一篇稿，所以不能只把 event_id 改過去
 * ——keep 已有稿時，直接把 drop 的導流目標搬過去再刪掉 drop 的稿，否則會出現兩篇同事件稿。
 */
async function mergeEvents(db: Db, keepId: string, dropId: string): Promise<boolean> {
  if (!keepId || !dropId || keepId === dropId) return false;
  const { data: drop, error: dropError } = await db
    .from("content_hot_events")
    .select("id, title, summary, url, item_ids, heat")
    .eq("id", dropId)
    .maybeSingle();
  if (dropError || !drop) return false;
  const { data: keep, error: keepError } = await db
    .from("content_hot_events")
    .select("id, title, summary, item_ids, heat")
    .eq("id", keepId)
    .maybeSingle();
  if (keepError || !keep) return false;

  const { data: itemRow } = await db
    .from("content_hot_items")
    .insert({
      title: (drop as { title: string }).title,
      url: (drop as { url: string | null }).url,
      summary: (drop as { summary: string | null }).summary,
      source: "rss",
      heat: (drop as { heat: number }).heat,
    })
    .select("id")
    .single();
  const nextIds = [
    ...(((keep as { item_ids: string[] | null }).item_ids ?? []) as string[]),
    (itemRow as { id: string } | null)?.id,
  ].filter((value): value is string => Boolean(value));
  const nextHeat = Math.min(100, Number((keep as { heat: number }).heat ?? 0) + 3);
  const { error: updateError } = await db
    .from("content_hot_events")
    .update({ item_ids: nextIds, heat: nextHeat })
    .eq("id", keepId);
  if (updateError) return false;

  // 稿件：兩邊的稿一起挑最值得留的一篇，其餘搬走導流後刪除
  const allPosts = [
    ...(await loadEventPosts(db, keepId)),
    ...(await loadEventPosts(db, dropId)),
  ];
  const keeper = pickCanonicalPost(allPosts);
  if (keeper) {
    const keeperFromDrop = keeper.event_id === dropId;
    const others = allPosts.filter((post) => post.id !== keeper.id);
    if (keeperFromDrop) {
      // 先把 keep 的舊稿併進 keeper（keeper 此時仍在 drop 事件下，不會撞 event_id 唯一鍵）
      for (const post of others) {
        if (post.event_id === keepId) await absorbPost(db, keeper.id, post.id);
      }
      const { error: moveError } = await db
        .from("content_social_posts")
        .update({ event_id: keepId, group_id: null })
        .eq("id", keeper.id);
      if (moveError) {
        console.warn(`[content-sources] 改掛保留稿失敗，暫不合併事件：${dbError(moveError)}`);
        return false;
      }
      for (const post of others) {
        if (post.event_id === dropId) await absorbPost(db, keeper.id, post.id);
      }
    } else {
      for (const post of others) await absorbPost(db, keeper.id, post.id);
    }

    // 搬移失敗就不要標記 ignored，否則稿會掛在讀者看不到的事件上
    const leftovers = await loadEventPosts(db, dropId);
    if (leftovers.length > 0) {
      console.warn(`[content-sources] drop 事件仍有 ${leftovers.length} 篇稿未合併，暫不合併`);
      return false;
    }
  }

  const { error: ignoredError } = await db
    .from("content_hot_events")
    .update({ status: "ignored", duplicate_of: keepId })
    .eq("id", dropId);
  if (ignoredError) {
    // duplicate_of 的 migration 未推時退化成只改狀態，不讓整個合併白做
    await db.from("content_hot_events").update({ status: "ignored" }).eq("id", dropId);
  }
  return true;
}

/** 兩個事件底下的稿件（含導流數）：合併時用來挑「留哪一篇」 */
async function loadEventPosts(
  db: Db,
  eventId: string,
): Promise<
  {
    id: string;
    event_id: string | null;
    status: string;
    generator?: string | null;
    created_at: string;
    target_count: number;
  }[]
> {
  const { data, error } = await db
    .from("content_social_posts")
    .select("id, event_id, status, generator, created_at")
    .eq("event_id", eventId);
  if (error) {
    console.warn(`[content-sources] 讀取事件稿件失敗：${dbError(error)}`);
    return [];
  }
  const rows = (data ?? []) as {
    id: string;
    event_id: string | null;
    status: string;
    generator?: string | null;
    created_at: string;
  }[];
  if (rows.length === 0) return [];
  const counts = new Map<string, number>();
  const { data: targetRows } = await db
    .from("content_social_targets")
    .select("post_id")
    .in(
      "post_id",
      rows.map((row) => row.id),
    );
  for (const row of (targetRows ?? []) as { post_id: string }[]) {
    counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1);
  }
  return rows.map((row) => ({ ...row, target_count: counts.get(row.id) ?? 0 }));
}

/** 搬走導流目標後刪掉重複稿 */
async function absorbPost(db: Db, keeperPostId: string, loserPostId: string): Promise<void> {
  await absorbTargets(db, keeperPostId, loserPostId);
  const { error } = await db.from("content_social_posts").delete().eq("id", loserPostId);
  if (error) console.warn(`[content-sources] 刪除重複稿失敗：${dbError(error)}`);
}

/** 把重複稿的導流目標搬到保留稿（同帳號只留一份，已發佈狀態優先） */
async function absorbTargets(db: Db, keeperPostId: string, loserPostId: string): Promise<void> {
  const { data: rows } = await db
    .from("content_social_targets")
    .select("account_id, copy_text, status, published_url, published_at")
    .eq("post_id", loserPostId);
  for (const row of (rows ?? []) as {
    account_id: string;
    copy_text: string | null;
    status: string;
    published_url: string | null;
    published_at: string | null;
  }[]) {
    const { error } = await db.from("content_social_targets").insert({
      post_id: keeperPostId,
      account_id: row.account_id,
      copy_text: row.copy_text,
      status: row.status,
      published_url: row.published_url,
      published_at: row.published_at,
    });
    if (error && String((error as { code?: string }).code) !== "23505") {
      console.warn(`[content-sources] 搬移導流目標失敗：${dbError(error)}`);
      continue;
    }
    // 同一帳號已在保留稿：已發佈狀態優先，不要把發佈紀錄留在被刪的稿上
    if (error && row.status === "published") {
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
}

// ============================================================
// health（M5-04）
// ============================================================

interface Alert {
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  count: number;
}

async function countOf(
  db: Db,
  table: string,
  apply: (query: any) => any,
): Promise<number> {
  const { count, error } = await apply(
    db.from(table).select("id", { count: "exact", head: true }),
  );
  if (error) throw error;
  return count ?? 0;
}

async function handleHealth(db: Db): Promise<unknown> {
  const alerts: Alert[] = [];
  const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const since48h = new Date(Date.now() - 48 * 3_600_000).toISOString();

  const { data: settingsRow } = await db
    .from("content_settings")
    .select("feature_flags")
    .eq("id", "default")
    .maybeSingle();
  const flags = (settingsRow?.feature_flags ?? {}) as Record<string, unknown>;
  const paused = flags.social_autopilot === false;

  const [credentialsInvalid, reviewOverdue, deadJobs, failedTargets, failedPosts] =
    await Promise.all([
      countOf(db, "content_site_credentials", (query) => query.eq("status", "invalid")),
      countOf(db, "content_social_posts", (query) =>
        query.eq("status", "pending_review").lt("created_at", since48h),
      ),
      countOf(db, "content_jobs", (query) => query.eq("status", "dead")),
      countOf(db, "content_social_targets", (query) =>
        query.eq("status", "failed").gte("updated_at", since24h),
      ),
      countOf(db, "content_social_posts", (query) => query.eq("status", "publish_failed")),
    ]);

  if (credentialsInvalid > 0) {
    alerts.push({
      kind: "credential_invalid",
      severity: "critical",
      title: "站點憑證失效",
      detail: `${credentialsInvalid} 個站點憑證無法解密或已失效，相關排程會保留不發。`,
      count: credentialsInvalid,
    });
  }
  if (reviewOverdue > 0) {
    alerts.push({
      kind: "review_overdue",
      severity: "warning",
      title: "社媒稿待審超過 48 小時",
      detail: `${reviewOverdue} 篇稿件仍未審核，請到審核工作室處理。`,
      count: reviewOverdue,
    });
  }
  if (deadJobs > 0) {
    alerts.push({
      kind: "job_dead",
      severity: "critical",
      title: "背景工作已放棄",
      detail: `${deadJobs} 個 job 重試耗盡，請看排程表或日報的待處理。`,
      count: deadJobs,
    });
  }
  const failedTotal = failedTargets + failedPosts;
  if (failedTotal > 0) {
    alerts.push({
      kind: "publish_failed_24h",
      severity: "warning",
      title: "近 24 小時有發布失敗",
      detail: `${failedTargets} 則導流標記失敗、${failedPosts} 篇批次發布失敗，可重試或改人工交付。`,
      count: failedTotal,
    });
  }

  if (paused) {
    alerts.push({
      kind: "autopilot_paused",
      severity: "info",
      title: "自動營運已暫停",
      detail: "RSS 抓取與 cron 自動產稿已停止；手動「立即生成」仍可用。",
      count: 1,
    });
    // 暫停期間來源本來就不會更新，不該誤報「抓取異常」
    return { generatedAt: nowIso(), alerts };
  }

  const { data: sources, error: sourceError } = await db
    .from("content_sources")
    .select("id, name, enabled, fetch_interval_minutes, last_fetched_at, consecutive_empty, last_error")
    .eq("enabled", true);
  if (sourceError) throw new Error(dbError(sourceError));

  const now = Date.now();
  const failing = ((sources ?? []) as SourceRow[]).filter((source) => {
    if (source.last_error) return true;
    if (!source.last_fetched_at) return false;
    const interval = Math.max(15, Number(source.fetch_interval_minutes) || 60) * 60_000;
    return now - new Date(source.last_fetched_at).getTime() > interval * 2;
  });
  if (failing.length > 0) {
    alerts.push({
      kind: "source_failing",
      severity: "warning",
      title: "熱點來源抓取異常",
      detail:
        failing
          .slice(0, 3)
          .map((source) => `${source.name}：${source.last_error || "超過兩個週期未更新"}`)
          .join("；") + (failing.length > 3 ? `；另有 ${failing.length - 3} 個` : ""),
      count: failing.length,
    });
  }

  const emptySources = ((sources ?? []) as SourceRow[]).filter(
    (source) => source.consecutive_empty >= 3,
  );
  if (emptySources.length > 0) {
    alerts.push({
      kind: "source_empty",
      severity: "info",
      title: "來源連續沒有新內容",
      detail: `${emptySources.length} 個來源連續 3 次以上沒有抓到新項目，可能關鍵字太窄或來源停止更新。`,
      count: emptySources.length,
    });
  }

  return { generatedAt: nowIso(), alerts };
}

// ============================================================
// 入口
// ============================================================

Deno.serve(async (req: Request) => {
  const methodGuard = guardMethod(req);
  if (methodGuard) return methodGuard;

  let db: Db;
  try {
    db = serviceClient();
  } catch (error) {
    return failJson(500, "config_missing", errorMessage(error));
  }

  const actorResult = await requireActor(req);
  if (actorResult.response) return actorResult.response;
  const actor = actorResult.actor!;

  const body = await readBody<Record<string, unknown>>(req);
  const action = new URL(req.url).searchParams.get("action") || String(body.action || "");

  try {
    if (action === "fetch_sources") {
      const denied = requireServiceRole(req);
      if (denied) return denied;
      return okJson(await handleFetchSources(db));
    }

    if (action === "dedupe_backfill") {
      const denied = requireServiceRole(req);
      if (denied) return denied;
      return okJson(await handleDedupeBackfill(db, Number(body.max_checks) || 4));
    }

    if (action === "judge_check") {
      const denied = requireServiceRole(req);
      if (denied) return denied;
      const verdict = await judgeWithUsage(db, {
        titleA: String(body.titleA ?? ""),
        summaryA: body.summaryA ? String(body.summaryA) : null,
        titleB: String(body.titleB ?? ""),
        summaryB: body.summaryB ? String(body.summaryB) : null,
        timeoutMs: 15_000,
      });
      return okJson({ verdict, configured: grokConfigured() });
    }

    if (action === "merge_events") {
      const denied = requireServiceRole(req);
      if (denied) return denied;
      const merged = await mergeEvents(db, String(body.keep_id ?? ""), String(body.drop_id ?? ""));
      return okJson({ merged });
    }

    if (action === "health") {
      const denied = requireAction(actor, "view");
      if (denied) return denied;
      return okJson(await handleHealth(db));
    }

    return failJson(400, "unknown_action", `未知的動作：${action || "(空白)"}`);
  } catch (error) {
    console.error("[content-sources] unhandled error:", error);
    return failJson(500, "internal_error", `處理請求時發生錯誤：${errorMessage(error)}`);
  }
});
