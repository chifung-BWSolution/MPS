import {
  HOTSPOT_CHUNK_SIZE,
  HOTSPOT_MEDIAN_SAMPLE_CAP,
  HOTSPOT_MEDIAN_WINDOW_DAYS,
  buildItemPayload,
  computeItemComputed,
  computeMedian,
  engagementOf,
  estimateCostUsd,
  type HotspotItemDraft,
  type HotspotKind,
  type HotspotPlatform,
} from '../../../src/lib/hotspotRadar.ts';
import { serviceClient } from '../_shared/contentAuth.ts';

/**
 * 熱點雷達 · 寫入
 *
 * 兩個容易出錯的點，刻意集中在這裡：
 *   1. `items_new` 用「寫入前查差集」算，不用 PostgREST upsert 的回傳猜（它不區分 insert/update）
 *   2. upsert payload 不含 first_seen_at / captured_at，也不碰 favorites
 */

type Db = ReturnType<typeof serviceClient>;

export interface HotspotUpsertResult {
  inserted: number;
  upserted: number;
  costUsd: number;
}

export interface MonthRunRow {
  started_at: string;
  cost_usd: number;
  items_new: number;
}

function dedupeDrafts(drafts: readonly HotspotItemDraft[]): HotspotItemDraft[] {
  const seen = new Set<string>();
  const unique: HotspotItemDraft[] = [];
  for (const draft of drafts) {
    if (!draft.external_id) continue;
    if (seen.has(draft.external_id)) continue;
    seen.add(draft.external_id);
    unique.push(draft);
  }
  return unique;
}

async function loadExistingExternalIds(
  db: Db,
  platform: HotspotPlatform,
  externalIds: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (let start = 0; start < externalIds.length; start += HOTSPOT_CHUNK_SIZE) {
    const chunk = externalIds.slice(start, start + HOTSPOT_CHUNK_SIZE);
    const { data, error } = await db
      .from('hotspot_items')
      .select('external_id')
      .eq('platform', platform)
      .in('external_id', chunk as string[]);
    if (error) throw error;
    for (const row of (data ?? []) as { external_id: string }[]) found.add(row.external_id);
  }
  return found;
}

interface AccountSampleRow {
  external_id: string;
  engagement: number | string | null;
}

async function loadRecentAccountSamples(db: Db, targetId: string): Promise<AccountSampleRow[]> {
  const cutoff = new Date(
    Date.now() - HOTSPOT_MEDIAN_WINDOW_DAYS * 86_400_000,
  ).toISOString();

  const { data, error } = await db
    .from('hotspot_items')
    .select('external_id,engagement')
    .eq('target_id', targetId)
    .eq('source_kind', 'account')
    .not('posted_at', 'is', null)
    .gte('posted_at', cutoff)
    .order('posted_at', { ascending: false })
    .limit(HOTSPOT_MEDIAN_SAMPLE_CAP);

  if (error) throw error;
  return (data ?? []) as AccountSampleRow[];
}

/**
 * 寫入一批抓回來的內容。
 *
 * 中位數的樣本＝「資料庫近 30 天既有列」∪「本批」：
 * 只用既有列的話，第一次抓新帳號時所有 relative_heat 都會是 NULL（基線不存在），
 * 使用者會以為功能壞了；把本批算進去，第一次就有合理基線。
 */
export async function upsertItems(
  db: Db,
  target: { id: string; kind: HotspotKind; platform: HotspotPlatform },
  drafts: readonly HotspotItemDraft[],
  unitPricePer1000: number,
): Promise<HotspotUpsertResult> {
  const unique = dedupeDrafts(drafts);
  if (unique.length === 0) return { inserted: 0, upserted: 0, costUsd: 0 };

  const existing = await loadExistingExternalIds(
    db,
    target.platform,
    unique.map((draft) => draft.external_id),
  );
  const inserted = unique.filter((draft) => !existing.has(draft.external_id)).length;

  let median: number | null = null;
  let sample = 0;

  if (target.kind === 'account') {
    const rows = await loadRecentAccountSamples(db, target.id);
    const byExternalId = new Map<string, number>();
    for (const row of rows) {
      byExternalId.set(row.external_id, Math.max(0, Number(row.engagement) || 0));
    }
    for (const draft of unique) {
      byExternalId.set(draft.external_id, engagementOf(draft.likes, draft.comments));
    }
    const values = [...byExternalId.values()].slice(0, HOTSPOT_MEDIAN_SAMPLE_CAP);
    median = computeMedian(values);
    sample = values.length;
  }

  const payloads = unique.map((draft) =>
    buildItemPayload(draft, computeItemComputed(draft, median, sample), target.id),
  );

  const { error } = await db
    .from('hotspot_items')
    .upsert(payloads, { onConflict: 'platform,external_id' });
  if (error) throw error;

  return {
    inserted,
    upserted: unique.length,
    costUsd: estimateCostUsd(unique.length, unitPricePer1000),
  };
}

// ============================================================
// Run 紀錄
// ============================================================

export async function startRun(
  db: Db,
  trigger: 'manual' | 'cron',
  meta: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await db
    .from('hotspot_runs')
    .insert({ trigger, status: 'running', meta })
    .select('id')
    .single();

  if (error) throw error;
  return String((data as { id: string }).id);
}

export interface RunFinishPatch {
  status: 'success' | 'error';
  targets_fetched?: number;
  items_new?: number;
  items_upserted?: number;
  api_calls?: number;
  cost_usd?: number;
  error_message?: string | null;
  meta?: Record<string, unknown>;
}

export async function finishRun(db: Db, runId: string, patch: RunFinishPatch): Promise<void> {
  const { error } = await db
    .from('hotspot_runs')
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw error;
}

/** 10 分鐘內有 running run → 視為抓取中（崩潰留下的舊 run 不會永久鎖住） */
export async function hasRunningRun(db: Db, sinceIso: string): Promise<boolean> {
  const { data, error } = await db
    .from('hotspot_runs')
    .select('id')
    .eq('status', 'running')
    .gte('started_at', sinceIso)
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

// ============================================================
// 用量與保留清理
// ============================================================

export async function loadMonthRuns(db: Db, sinceIso: string): Promise<MonthRunRow[]> {
  const { data, error } = await db
    .from('hotspot_runs')
    .select('started_at,cost_usd,items_new')
    .gte('started_at', sinceIso)
    .order('started_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as MonthRunRow[];
}

/**
 * 刪掉 120 天以上、且**沒有收藏列**的內容。
 * 兩段式查詢（先找候選、再排除收藏）是因為 PostgREST 無法表達 NOT EXISTS；
 * 這樣也保證「只要有人收藏過就永遠不刪」。
 */
export async function pruneOldItems(db: Db, retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();

  const { data, error } = await db
    .from('hotspot_items')
    .select('id')
    .lt('last_seen_at', cutoff)
    .limit(500);
  if (error) throw error;

  const candidateIds = ((data ?? []) as { id: string }[]).map((row) => String(row.id));
  if (candidateIds.length === 0) return 0;

  const { data: favoriteRows, error: favoriteError } = await db
    .from('hotspot_favorites')
    .select('item_id')
    .in('item_id', candidateIds);
  if (favoriteError) throw favoriteError;

  const favorited = new Set(
    ((favoriteRows ?? []) as { item_id: string }[]).map((row) => String(row.item_id)),
  );
  const deletable = candidateIds.filter((id) => !favorited.has(id));
  if (deletable.length === 0) return 0;

  const { error: deleteError } = await db.from('hotspot_items').delete().in('id', deletable);
  if (deleteError) throw deleteError;

  return deletable.length;
}
