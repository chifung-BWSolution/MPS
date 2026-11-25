import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { GscMetricRow } from "../../../src/lib/seoRadar.ts";

/**
 * GSC 逐日 metric 讀取（給 seo-radar 的 28 天聚合用）
 *
 * 分頁寫法與 content-keywords 一致：
 *   - 依主鍵順序 order(site_url, query, metric_date)
 *   - 用實際回傳列數推進 offset（PostgREST max-rows=1000 也翻得完）
 *   - 硬上限 40 頁（40k 列）避免極端站點把函數打爆
 */

const PAGE_SIZE = 1_000;
const MAX_PAGES = 40;

export async function loadGscMetrics(
  db: SupabaseClient,
  siteUrls: readonly string[],
  sinceDate: string,
): Promise<GscMetricRow[]> {
  if (siteUrls.length === 0) return [];

  const rows: GscMetricRow[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await db
      .from("gsc_query_daily_metrics")
      .select("query, impressions, clicks, position, metric_date")
      .in("site_url", siteUrls as string[])
      .gte("metric_date", sinceDate)
      .order("site_url", { ascending: true })
      .order("query", { ascending: true })
      .order("metric_date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`讀取 GSC 數據失敗：${error.message}`);
    }

    const batch = (data ?? []) as GscMetricRow[];
    rows.push(...batch);
    offset += batch.length;

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}
