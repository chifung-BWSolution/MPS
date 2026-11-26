import type { HotspotKind, HotspotPlatform } from '../../../src/lib/hotspotRadar.ts';
import { serviceClient } from '../_shared/contentAuth.ts';

/**
 * 熱點雷達 · 監測目標讀取
 *
 * 只做 read / 狀態回寫；目標的 CRUD 在 index.ts（需要權限重算）。
 */

type Db = ReturnType<typeof serviceClient>;

export interface HotspotTargetRecord {
  id: string;
  kind: HotspotKind;
  platform: HotspotPlatform;
  value: string;
  value_normalized: string;
  label: string | null;
  brand_id: string | null;
  active: boolean;
  notes: string | null;
  last_fetched_at: string | null;
  last_error: string | null;
}

const TARGET_COLUMNS =
  'id,kind,platform,value,value_normalized,label,brand_id,active,notes,last_fetched_at,last_error';

/** cron／全站抓取候選：啟用中，最久沒抓的先做 */
export async function listCandidateTargets(
  db: Db,
  limit: number,
): Promise<HotspotTargetRecord[]> {
  const { data, error } = await db
    .from('hotspot_targets')
    .select(TARGET_COLUMNS)
    .eq('active', true)
    .order('last_fetched_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as HotspotTargetRecord[];
}

/** 指定 id 的目標（保留呼叫端給的順序，因為預算裁剪照該順序） */
export async function listTargetsByIds(
  db: Db,
  ids: readonly string[],
): Promise<HotspotTargetRecord[]> {
  if (ids.length === 0) return [];

  const { data, error } = await db
    .from('hotspot_targets')
    .select(TARGET_COLUMNS)
    .in('id', ids as string[]);

  if (error) throw error;

  const byId = new Map<string, HotspotTargetRecord>();
  for (const row of (data ?? []) as HotspotTargetRecord[]) byId.set(row.id, row);
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is HotspotTargetRecord => Boolean(row));
}

export async function countActiveTargets(db: Db): Promise<number> {
  const { count, error } = await db
    .from('hotspot_targets')
    .select('id', { count: 'exact', head: true })
    .eq('active', true);

  if (error) throw error;
  return count ?? 0;
}

export async function markTargetFetched(db: Db, targetId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db
    .from('hotspot_targets')
    .update({ last_fetched_at: now, last_error: null, updated_at: now })
    .eq('id', targetId);
  if (error) throw error;
}

export async function markTargetFailed(
  db: Db,
  targetId: string,
  message: string,
): Promise<void> {
  const { error } = await db
    .from('hotspot_targets')
    .update({
      last_error: String(message || '抓取失敗').slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetId);
  if (error) throw error;
}
