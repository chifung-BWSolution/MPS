/**
 * SEO 雷達 · 型別（PRD §5）
 *
 * 只放型別，沒有執行期程式碼：Edge Function 與前端都可安全 import。
 */

export type RadarMarketCode = 'hk' | 'tw' | 'sg' | 'my' | 'us';

export type SeoRadarIdeaSource = 'gsc' | 'suggest';

export type SeoRadarIdeaStatus = 'new' | 'adopted' | 'ignored';

/** `public.seo_keyword_ideas` 的一列 */
export interface SeoRadarIdeaRow {
  id: string;
  website_profile_id: string;
  keyword: string;
  normalized_keyword: string;
  source: SeoRadarIdeaSource;
  market_code: RadarMarketCode;
  language_code: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  avg_position: number | null;
  seed_keyword: string | null;
  score: number;
  status: SeoRadarIdeaStatus;
  adopted_keyword_id: string | null;
  run_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export type SeoRadarRunTrigger = 'manual' | 'cron';
export type SeoRadarRunStatus = 'running' | 'success' | 'error';

/** `public.seo_radar_runs` 的一列 */
export interface SeoRadarRunRow {
  id: string;
  trigger: SeoRadarRunTrigger;
  status: SeoRadarRunStatus;
  sites_scanned: number;
  ideas_upserted: number;
  gsc_terms: number;
  suggest_terms: number;
  error_message: string | null;
  meta: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
}

/** 站點下拉用（不經 content_sites，避免未配置站點消失） */
export interface SeoRadarSite {
  id: string;
  websiteName: string;
  domainUrl: string | null;
  brand: string | null;
  status: string;
  gscConnected: boolean;
}

/** `action: 'scan'` 的回應 */
export interface RadarScanResponse {
  run: SeoRadarRunRow | null;
  gsc_terms: number;
  suggest_terms: number;
  inserted: number;
  updated: number;
  warnings: string[];
}

/** `action: 'adopt'` 的回應 */
export interface RadarAdoptResponse {
  adopted: number;
  skipped: number;
  enqueued: number;
  keyword_ids: string[];
}

/** `action: 'ignore'` 的回應 */
export interface RadarIgnoreResponse {
  updated: number;
}
