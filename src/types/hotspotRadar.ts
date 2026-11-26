/**
 * 熱點雷達 · 型別（PRD §5）
 *
 * 只放型別，沒有執行期程式碼：Edge Function 與前端都可安全 import。
 */

export type HotspotKind = 'account' | 'hashtag' | 'ad_keyword';

export type HotspotPlatform = 'instagram' | 'facebook';

export type HotspotMediaType = 'reel' | 'video' | 'image' | 'carousel' | 'ad' | 'unknown';

export type HotspotFavoriteStatus = 'saved' | 'used' | 'dropped';

export type HotspotSortKey = 'composite' | 'engagement' | 'relative' | 'newest' | 'ad_days';

export type HotspotRunTrigger = 'manual' | 'cron';
export type HotspotRunStatus = 'running' | 'success' | 'error';

/** `public.hotspot_targets` 的一列 */
export interface HotspotTargetRow {
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
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 新增／更新目標的輸入（前端表單 → Edge Function） */
export interface HotspotTargetInput {
  kind: HotspotKind;
  value: string;
  label?: string | null;
  brand_id?: string | null;
  notes?: string | null;
  active?: boolean;
}

/** `public.hotspot_items` 的一列 */
export interface HotspotItemRow {
  id: string;
  platform: HotspotPlatform;
  source_kind: HotspotKind;
  target_id: string | null;
  external_id: string;
  url: string;
  media_type: HotspotMediaType;
  caption: string | null;
  thumbnail_url: string | null;
  author_handle: string | null;
  author_name: string | null;
  author_followers: number | null;
  posted_at: string | null;
  likes: number;
  comments: number;
  plays: number | null;
  engagement: number;
  account_median_engagement: number | null;
  relative_heat: number | null;
  sample_size: number;
  low_sample: boolean;
  ad_started_at: string | null;
  ad_active_days: number | null;
  ad_status: string | null;
  first_seen_at: string;
  last_seen_at: string;
  captured_at: string;
  /** 供應商原始資料（含 provider、engagement_available 等旗標） */
  raw?: Record<string, unknown> | null;
}

/** `public.hotspot_favorites` 的一列 */
export interface HotspotFavoriteRow {
  id: string;
  item_id: string;
  status: HotspotFavoriteStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** `public.hotspot_runs` 的一列 */
export interface HotspotRunRow {
  id: string;
  trigger: HotspotRunTrigger;
  status: HotspotRunStatus;
  targets_fetched: number;
  items_new: number;
  items_upserted: number;
  api_calls: number;
  cost_usd: number;
  error_message: string | null;
  meta: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
}

/** `public.hotspot_settings` 的一列 */
export interface HotspotSettings {
  id: string;
  auto_daily: boolean;
  monthly_budget_usd: number;
  min_engagement: number;
  items_per_target: number;
  updated_by: string | null;
  updated_at: string;
}

/** 用量摘要（`settings` / `update_settings` 的回傳） */
export interface HotspotUsage {
  month_spend_usd: number;
  month_items: number;
  budget_pct: number;
}

/** `action: 'scan'` / `'scan_all'` / cron 的回應 */
export interface HotspotScanResponse {
  run: HotspotRunRow | null;
  targets_fetched: number;
  targets_remaining: number;
  items_new: number;
  items_upserted: number;
  cost_usd: number;
  warnings: string[];
}

/** `action: 'test_target'` 的回應 */
export interface HotspotTestTargetResponse {
  valid: boolean;
  normalized: string;
  preview_count: number;
  cost_usd: number;
  run_id: string | null;
}

export interface HotspotFavoriteResponse {
  favorite: HotspotFavoriteRow;
}

export interface HotspotUnfavoriteResponse {
  removed: boolean;
  item_id: string;
}

/** cron job 開關狀態（經 RPC `hotspot_radar_daily_status`） */
export interface HotspotDailyStatus {
  enabled: boolean;
  schedule: string | null;
  jobname: string | null;
}

export interface HotspotSettingsResponse {
  settings: HotspotSettings;
  usage: HotspotUsage;
  daily: HotspotDailyStatus;
}

export interface HotspotTargetResponse {
  target: HotspotTargetRow;
}

/** 前端用來組卡片／排序的合併列（item + 收藏狀態） */
export interface HotspotFeedItem extends HotspotItemRow {
  favorite: HotspotFavoriteRow | null;
}
