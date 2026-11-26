/**
 * ALT Pilot · 型別（DB row、Edge Function payload、UI view model）
 *
 * 命名刻意跟 Postgres 欄位一致（snake_case），避免在 API 邊界來回轉換
 * 時漏欄位；顯示層的 camelCase 只出現在 `AltRow`。
 */

export type AltRisk = 'low' | 'medium' | 'high';
export type AltRunStatus = 'analyzed' | 'generating' | 'ready' | 'exported' | 'failed' | 'archived';
export type AltSuggestionStatus = 'pending' | 'approved' | 'rejected' | 'exported' | 'failed';
export type AltImageLocation = 'header' | 'main' | 'footer' | 'unknown';

export interface AltPageContext {
  url: string;
  host: string;
  title: string;
  description: string;
  lang: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  h1: string;
  h2s: string[];
  h3s: string[];
  paragraphs: string[];
  wordCount: number;
  summary: string;
  imageCount: number;
  skippedImageCount: number;
  backgroundImageCount: number;
  truncated: boolean;
}

export interface AltImageCandidate {
  url: string;
  filename: string;
  location: AltImageLocation;
  currentAlt: string;
  hasAltAttr: boolean;
  width: number | null;
  height: number | null;
  ariaHidden: boolean;
  role: string;
  decorative: boolean;
  skipReason: string | null;
  nearbyHeading: string;
  nearbyCaption: string;
  nearbyParagraph: string;
}

export interface AltPageAnalysis {
  page: AltPageContext;
  images: AltImageCandidate[];
}

/** 模型回傳並通過解析的草稿（尚未寫入 DB）。 */
export interface AltSuggestionDraft {
  alt: string;
  short_alt: string;
  alternatives: string[];
  rationale: string;
  confidence: number;
  risk: AltRisk;
  decorative: boolean;
  issues: string[];
}

export interface AltRunRow {
  id: string;
  site_id: string | null;
  page_url: string;
  page_host: string;
  page_title: string;
  page_lang: string;
  page_hash: string;
  context_summary: string;
  keyword: string;
  status: AltRunStatus;
  image_count: number;
  generated_count: number;
  approved_count: number;
  model: string;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AltSuggestionRow {
  id: string;
  run_id: string;
  image_url: string;
  image_host: string;
  image_hash: string | null;
  filename: string;
  location: AltImageLocation;
  current_alt: string;
  context_excerpt: string;
  suggested_alt: string;
  short_alt: string;
  alternatives: string[];
  rationale: string;
  keyword: string;
  confidence: number;
  risk: AltRisk;
  issues: AltIssue[];
  decorative: boolean;
  provider: string;
  status: AltSuggestionStatus;
  final_alt: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AltIssue {
  id: string;
  severity: 'hard' | 'soft';
  message: string;
}

export interface AltSettingsRow {
  id: string;
  enabled: boolean;
  model: string;
  fallback_model: string;
  daily_call_limit: number;
  max_images_per_run: number;
  max_images_per_call: number;
  created_at: string;
  updated_at: string;
}

export interface AltUsageRow {
  id: string;
  run_id: string | null;
  suggestion_id: string | null;
  model: string;
  provider: string;
  use_case: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  created_at: string;
}

export interface AltKeywordOption {
  id: string;
  keyword: string;
  level: string;
  search_volume: number | null;
  target_page: string | null;
}

export interface AltUsageSummary {
  today: number;
  limit: number;
  /** 今日建立的 alt_runs 數量（頁面分析次數）。 */
  analyses?: number;
}

export interface AltVerifyResult {
  checked: number;
  matched: number;
  missing: Array<{ image_url: string; expected: string; actual: string }>;
}

/** UI view model：一張圖 + 它目前的建議（可能尚未生成）。 */
export interface AltRow {
  image: AltImageCandidate;
  suggestion: AltSuggestionRow | null;
}

export interface AltGenerateResponse {
  suggestions: AltSuggestionRow[];
  errors: Array<{ image_url: string; code: string; error: string }>;
  usage: AltUsageSummary;
}

export interface AltAnalyzeResponse {
  run: AltRunRow;
  page: AltPageContext;
  images: AltImageCandidate[];
  usage: AltUsageSummary;
}

export interface AltDiscoverResult {
  sitemap_url: string;
  kind: 'urlset' | 'sitemapindex';
  sitemap_count: number;
  pages: Array<{ url: string }>;
  truncated: boolean;
  warnings: string[];
}

export interface AltRegenerateResponse {
  suggestion: AltSuggestionRow;
  usage: AltUsageSummary;
}

export const ALT_FUNCTION_NAME = 'alt-pilot';
export const ALT_MIGRATION_FILE = '20261125183000_alt_pilot.sql';
export const ALT_SCHEMA_MISSING_MESSAGE =
  `ALT Pilot 功能尚未啟用，請先執行 migration（${ALT_MIGRATION_FILE}）。`;

export const ALT_RUN_STATUS_LABELS: Record<AltRunStatus, string> = {
  analyzed: '已分析',
  generating: '生成中',
  ready: '待審批',
  exported: '已匯出',
  failed: '失敗',
  archived: '已歸檔',
};

export const ALT_SUGGESTION_STATUS_LABELS: Record<AltSuggestionStatus, string> = {
  pending: '待批准',
  approved: '已批准',
  rejected: '已略過',
  exported: '已匯出',
  failed: '生成失敗',
};

export const ALT_RISK_LABELS: Record<AltRisk, string> = {
  low: '低風險',
  medium: '中風險',
  high: '高風險',
};

export const ALT_LOCATION_LABELS: Record<AltImageLocation, string> = {
  header: '頁首',
  main: '主文',
  footer: '頁尾',
  unknown: '未定位',
};

export const DEFAULT_ALT_SETTINGS: AltSettingsRow = {
  id: 'default',
  enabled: false,
  model: 'grok-4.5',
  fallback_model: 'gemini-2.5-flash',
  daily_call_limit: 0,
  max_images_per_run: 40,
  max_images_per_call: 6,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};
