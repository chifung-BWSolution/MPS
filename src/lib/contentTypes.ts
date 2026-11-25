/**
 * 社媒自動化營運 · 共用型別契約
 *
 * 這裡是 DB 欄位 ↔ 前端／Edge Function 的唯一真實來源（single source of truth）。
 * 命名一律 snake_case，與 Postgres 欄位一一對應；UI 專用欄位另以 `xxx?:` 標註。
 *
 * 本檔同時被 Vite（src）與 Deno（supabase/functions）載入，
 * 因此不得引入任何瀏覽器或 Node API。
 */

// ============================================================
// 路由
// ============================================================

export type ContentZone = 'social' | 'seo';

export type SocialPage =
  | 'overview'
  | 'queue'
  | 'studio'
  | 'radar'
  | 'calendar'
  | 'library'
  | 'accounts'
  | 'usage'
  | 'settings';

export type SeoPage =
  | 'sites'
  | 'site'
  | 'keywords'
  | 'plan'
  | 'articles'
  | 'studio'
  | 'publish'
  | 'digest'
  | 'usage'
  | 'settings';

export type ContentPage = SocialPage | SeoPage;

export interface ContentRoute {
  zone: ContentZone;
  page: ContentPage;
  id: string | null;
}

// ============================================================
// 站點
// ============================================================

export type ContentTier = 'A1' | 'A2' | 'B';

export type ContentAdapterName =
  | 'manual'
  | 'next_custom'
  | 'shopify'
  | 'wordpress'
  | 'webflow'
  | 'beauty100';

export type ContentPublishMode = 'manual' | 'draft' | 'direct';

export type ContentSiteHealth = 'untested' | 'ok' | 'degraded' | 'down';

export type ContentSiteStatus = 'active' | 'paused' | 'archived';

export type ContentCadenceFrequency =
  | 'daily'
  | 'every_2_days'
  | 'twice_weekly'
  | 'weekly'
  | 'custom';

/** ISO 週日：1 = 週一 … 7 = 週日（與 Intl / Date.getDay 映射見 contentFormat） */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ContentCadence {
  frequency: ContentCadenceFrequency;
  weekdays: number[];
  /** 站點時區的當地時間 HH:mm */
  publish_time: string;
  lead_time_hours: number;
  review_cutoff_hours: number;
  max_articles_per_day: number;
  /** YYYY-MM-DD（站點時區），不排程的日期 */
  blackout_dates: string[];
}

export type ContentJsonLdType = 'BlogPosting' | 'Article';

export interface ContentSeoDefaults {
  locale: string;
  titleTemplate: string;
  metaTemplate: string;
  slugRule: string;
  canonicalBase: string;
  author: string;
  publisher: string;
  ogImage: string;
  jsonLdType: ContentJsonLdType;
  categoryMap: Record<string, string>;
  robotsDraft: string;
  robotsLive: string;
  wordCountMin: number;
  wordCountMax: number;
  internalLinksMin: number;
  internalLinksMax: number;
  bannedWords: string[];
}

export interface ContentBrandVoice {
  tone: string;
  audience: string;
  cta: string;
  bannedWords: string[];
  factBoundaries: string;
  allowAiImages: boolean;
}

export interface ContentSite {
  website_profile_id: string;
  tier: ContentTier;
  adapter: ContentAdapterName;
  publish_mode: ContentPublishMode;
  locale: string;
  timezone: string;
  cadence: ContentCadence;
  seo_defaults: ContentSeoDefaults;
  brand_voice: ContentBrandVoice;
  health: ContentSiteHealth;
  last_verified_at: string | null;
  status: ContentSiteStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** webandsystem_list 的站點主檔（站點身份唯一真實來源） */
export interface ContentSiteProfile {
  id: string;
  website_name: string;
  domain_url: string | null;
  platform: string | null;
  brand: string | null;
  status: string | null;
  level: number | null;
}

/** 站點設定 + 主檔（joined view model） */
export interface ContentSiteWithProfile extends ContentSite {
  profile: ContentSiteProfile | null;
}

export type ContentSectionType = 'article' | 'post' | 'page';

export interface ContentSiteSection {
  id: string;
  site_id: string;
  name: string;
  external_id: string | null;
  slug: string;
  content_type: ContentSectionType;
  mapping: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ContentSitePage {
  id: string;
  site_id: string;
  url: string;
  title: string | null;
  source: 'sitemap' | 'manual';
  last_seen_at: string | null;
  created_at: string;
}

export type ContentSiteCheckKind = 'settings' | 'domain' | 'sitemap' | 'credential';

export interface ContentSiteCheck {
  id: string;
  site_id: string;
  checked_at: string;
  kind: ContentSiteCheckKind;
  ok: boolean;
  detail: Record<string, unknown>;
}

export interface ContentCheckResult {
  kind: ContentSiteCheckKind;
  label: string;
  ok: boolean;
  /** 阻擋排程的失敗（sitemap 失敗只記警告） */
  blocking: boolean;
  detail: string;
}

export interface ContentConnectionTestResult {
  health: ContentSiteHealth;
  checks: ContentCheckResult[];
  testedAt: string;
}

export type ContentCredentialKind =
  | 'http_bearer'
  | 'http_hmac'
  | 'wp_app_password'
  | 'shopify_admin'
  | 'webflow_token';

export interface ContentCredentialMeta {
  kind: ContentCredentialKind;
  fingerprint: string | null;
  status: 'active' | 'invalid' | 'untested';
  expires_at: string | null;
  last_verified_at: string | null;
}

// ============================================================
// 素材
// ============================================================

export type ContentAssetSource = 'upload' | 'ai_generated' | 'vector';

export interface ContentAsset {
  id: string;
  site_id: string | null;
  bucket: string;
  storage_path: string;
  filename: string | null;
  mime_type: string | null;
  bytes: number | null;
  source: ContentAssetSource;
  tags: string[];
  alt: string | null;
  license_info: string | null;
  width: number | null;
  height: number | null;
  created_by: string | null;
  created_at: string;
}

// ============================================================
// 關鍵字（複用 seo_keywords，只加 pipeline 5 欄）
// ============================================================

export type ContentKeywordIntent =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'navigational';

export type ContentKeywordPipelineStatus =
  | 'backlog'
  | 'planned'
  | 'generating'
  | 'in_review'
  | 'published'
  | 'rejected'
  | 'parked';

export interface ContentKeyword {
  id: string;
  website_profile_id: string;
  keyword: string;
  normalized_keyword: string;
  level: 'level_1' | 'level_2' | 'level_3';
  search_volume: number | null;
  current_ranking: number | null;
  target_ranking: number | null;
  target_page: string | null;
  difficulty_score: number | null;
  /** 既有 SEO 監控狀態，語義不動 */
  status: 'monitoring' | 'optimizing' | 'achieved' | 'paused';
  ai_generated: boolean;
  source: 'manual' | 'gsc' | 'ads' | 'import';
  gsc_site_url: string | null;
  last_gsc_sync_at: string | null;
  /** 以下 5 欄為 content automation 新增；NULL = 未分級／未啟用 */
  intent: ContentKeywordIntent | null;
  priority: number | null;
  cluster: string | null;
  pipeline_status: ContentKeywordPipelineStatus | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentKeywordImportRow {
  phrase: string;
  intent?: ContentKeywordIntent | null;
  priority?: number | null;
  cluster?: string | null;
  target_url?: string | null;
  notes?: string | null;
  pipeline_status?: ContentKeywordPipelineStatus | null;
}

export interface ContentKeywordImportError {
  line: number;
  phrase: string;
  reason: string;
}

export interface ContentKeywordImportResult {
  inserted: number;
  skipped: number;
  errors: ContentKeywordImportError[];
}

/** planner 挑詞排序權重（人工 pin > GSC 機會詞 > volume/難度綜合） */
export interface ContentKeywordCandidate {
  keyword: ContentKeyword;
  score: number;
}

// ============================================================
// 排程格
// ============================================================

export type ContentSlotStatus =
  | 'planned'
  | 'generating'
  | 'draft_ready'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'held'
  | 'skipped';

export interface ContentSlot {
  id: string;
  site_id: string;
  keyword_id: string | null;
  publish_at: string;
  generate_at: string;
  status: ContentSlotStatus;
  article_id: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

/** planner 純函式輸出：尚未落庫的 slot 草稿 */
export interface ContentPlannedSlot {
  site_id: string;
  publish_at: string;
  generate_at: string;
  dedupe_key: string;
  weekday: IsoWeekday;
}

// ============================================================
// 文章
// ============================================================

export type ContentArticleStatus =
  | 'draft'
  | 'pending_review'
  | 'changes_requested'
  | 'held'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'updating'
  | 'publish_failed'
  | 'cancelled'
  | 'manual_done'
  | 'draft_published'
  | 'verify_failed';

export interface ContentArticle {
  id: string;
  site_id: string;
  section_id: string | null;
  keyword_id: string | null;
  slot_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  body_md: string | null;
  body_html: string | null;
  cover_asset_id: string | null;
  image_asset_ids: string[];
  meta_title: string | null;
  meta_description: string | null;
  canonical: string | null;
  og: Record<string, unknown>;
  json_ld: Record<string, unknown> | null;
  language: string;
  status: ContentArticleStatus;
  version: number;
  author_id: string | null;
  reviewer_id: string | null;
  approved_at: string | null;
  scheduled_publish_at: string | null;
  published_at: string | null;
  external_id: string | null;
  live_url: string | null;
  manual_url: string | null;
  package_path: string | null;
  checks: ContentQaSnapshot;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentArticleRevision {
  id: string;
  article_id: string;
  version: number;
  snapshot: Partial<ContentArticle>;
  actor_id: string | null;
  created_at: string;
}

export interface ContentQaSnapshot {
  report?: ContentQaReport;
  verifiedAt?: string;
  verify?: ContentVerifyReport;
  [key: string]: unknown;
}

/** 文章列表／佇列用的 view model */
export interface ContentArticleListItem {
  article: ContentArticle;
  keyword: ContentKeyword | null;
  site: ContentSiteProfile | null;
  waitingHours: number | null;
}

/** 審核工作室的完整資料 */
export interface ContentArticleDetail {
  article: ContentArticle;
  site: ContentSiteWithProfile | null;
  section: ContentSiteSection | null;
  keyword: ContentKeyword | null;
  slot: ContentSlot | null;
  coverAsset: ContentAsset | null;
  imageAssets: ContentAsset[];
  revisions: ContentArticleRevision[];
  publishLogs: ContentPublishLog[];
}

// ============================================================
// SEO QA（frontend 面板與 generate_article job 共用）
// ============================================================

export type ContentQaSeverity = 'hard' | 'soft';

export interface ContentQaCheck {
  id: string;
  label: string;
  severity: ContentQaSeverity;
  passed: boolean;
  detail: string;
}

export interface ContentQaReport {
  hard: ContentQaCheck[];
  soft: ContentQaCheck[];
  hardPassed: boolean;
  softScore: number;
  wordCount: number;
  checkedAt: string;
}

export interface ContentQaInput {
  article: Pick<
    ContentArticle,
    | 'title'
    | 'slug'
    | 'excerpt'
    | 'body_md'
    | 'body_html'
    | 'meta_title'
    | 'meta_description'
    | 'canonical'
  > & { keyword?: string | null };
  seoDefaults: ContentSeoDefaults;
  brandVoice: ContentBrandVoice;
  section?: ContentSiteSection | null;
  /** 同站既有 slug（排除自己），用於唯一性檢查 */
  existingSlugs?: string[];
  /** 同站既有頁面 URL，用於內鏈檢查 */
  sitePages?: Pick<ContentSitePage, 'url' | 'title'>[];
  /** 內文中實際引用的內部連結 */
  internalLinks?: string[];
  isDraft?: boolean;
}

export interface ContentVerifyReport {
  ok: boolean;
  httpStatus: number | null;
  checkedAt: string;
  items: ContentQaCheck[];
}

// ============================================================
// 內容包（PRD §9.3.5）
// ============================================================

export interface ContentPackageMeta {
  title: string;
  description: string;
  slug: string;
  canonical: string;
  og: Record<string, unknown>;
  keywords: string[];
  language: string;
  site: { id: string; name: string; domain: string };
  section: { name: string; external_id: string | null } | null;
  publishAt: string | null;
  mode: ContentPublishMode;
}

export interface ContentPackageFile {
  path: string;
  content: string | Uint8Array;
  contentType: string;
}

export interface ContentPackagePlan {
  filename: string;
  files: ContentPackageFile[];
  meta: ContentPackageMeta;
}

// ============================================================
// Job
// ============================================================

export type ContentJobType =
  | 'plan_slots'
  | 'generate_article'
  | 'publish_article'
  | 'verify_publish'
  | 'refresh_site_pages'
  | 'site_health'
  | 'send_digest'
  | 'generate_social';

export type ContentJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'dead';

export interface ContentJob {
  id: string;
  type: ContentJobType;
  payload: Record<string, unknown>;
  run_at: string;
  status: ContentJobStatus;
  attempts: number;
  max_attempts: number;
  locked_by: string | null;
  locked_until: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface ContentJobPayloads {
  plan_slots: { site_id?: string; horizon_days?: number; dedupe_key?: string };
  generate_article: { slot_id: string; article_id?: string; dedupe_key?: string };
  publish_article: { article_id: string; dedupe_key?: string };
  verify_publish: { article_id: string; dedupe_key?: string };
  refresh_site_pages: { site_id: string; dedupe_key?: string };
  site_health: { site_id: string; dedupe_key?: string };
  send_digest: { date: string; dedupe_key?: string; resend?: boolean };
  generate_social: { event_id: string; dedupe_key?: string };
}

export interface ContentLlmUsage {
  id: string;
  site_id: string | null;
  article_id: string | null;
  job_id: string | null;
  model: string;
  use_case: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  created_at: string;
}

// ============================================================
// 發布回執
// ============================================================

export type ContentPublishAction =
  | 'package'
  | 'manual_done'
  | 'publish'
  | 'retry'
  | 'verify'
  | 'approve'
  | 'reject'
  | 'confirm'
  | 'schedule'
  | 'restore';

export interface ContentPublishLog {
  id: string;
  site_id: string | null;
  article_id: string | null;
  action: ContentPublishAction;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  external_id: string | null;
  url: string | null;
  http_status: number | null;
  duration_ms: number | null;
  idempotency_key: string | null;
  actor_id: string | null;
  created_at: string;
  /** joined for UI */
  articleTitle?: string | null;
  siteName?: string | null;
}

// ============================================================
// 日報
// ============================================================

export type ContentDigestStatus = 'draft' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface ContentEmailDigest {
  id: string;
  digest_date: string;
  recipients: string[];
  subject: string;
  html: string;
  summary: ContentDigestStats | Record<string, never>;
  status: ContentDigestStatus;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentDigestSiteLine {
  siteId: string;
  siteName: string;
  domain: string | null;
  generated: number;
  pendingReview: number;
  published: number;
  failed: number;
  missingKeywords: number;
  oldestPendingHours: number | null;
}

export interface ContentDigestPending {
  siteName: string;
  label: string;
  detail: string;
}

export interface ContentDigestUpcoming {
  siteName: string;
  publishAt: string;
  title: string | null;
  status: ContentSlotStatus;
}

export interface ContentDigestStats {
  date: string;
  generated: number;
  pendingReview: number;
  published: number;
  failed: number;
  held: number;
  scheduled: number;
  manualPending: number;
  missingKeywords: number;
  oldestPendingHours: number | null;
  sites: ContentDigestSiteLine[];
  pending: ContentDigestPending[];
  upcoming: ContentDigestUpcoming[];
  totals: { llmCalls: number; tokensIn: number; tokensOut: number; costUsd: number };
}

export interface ContentDigestEmail {
  date: string;
  subject: string;
  html: string;
  text: string;
  stats: ContentDigestStats;
}

// ============================================================
// 設定
// ============================================================

export type ContentBreakerMode = 'full' | 'single_score' | 'vector_only' | 'fetch_only';

export interface ContentSettings {
  id: string;
  model: string;
  daily_article_limit: number;
  daily_llm_call_limit: number;
  digest_time: string;
  digest_enabled: boolean;
  digest_recipients: string[];
  breaker_mode: ContentBreakerMode;
  feature_flags: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ContentUsageSummary {
  calls: number;
  articles: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface ContentUsageDay {
  date: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface ContentUsageByModel {
  model: string;
  useCase: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

// ============================================================
// 生成（brief / LLM 契約）
// ============================================================

export interface ContentBrief {
  siteId: string;
  siteName: string;
  domain: string | null;
  locale: string;
  timezone: string;
  keyword: string;
  keywordIntent: ContentKeywordIntent | null;
  cluster: string | null;
  audience: string;
  tone: string;
  cta: string;
  factBoundaries: string;
  bannedWords: string[];
  sectionName: string | null;
  wordCountMin: number;
  wordCountMax: number;
  internalLinksMin: number;
  internalLinksMax: number;
  internalLinkCandidates: { url: string; title: string }[];
  existingTitles: string[];
  publishAt: string | null;
  language: string;
}

export interface ContentGeneratedArticle {
  title: string;
  slug: string;
  excerpt: string;
  body_md: string;
  meta_title: string;
  meta_description: string;
  keywords: string[];
  json_ld_type?: string;
  internal_links?: string[];
}

export interface ContentLlmUsageInfo {
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}

export interface ContentLlmResult<T> {
  data: T;
  usage: ContentLlmUsageInfo;
  latencyMs: number;
}

// ============================================================
// 權限
// ============================================================

export type ContentAction =
  | 'view'
  | 'write'
  | 'approve'
  | 'manage_sites'
  | 'manage_settings'
  | 'publish';

export interface ContentPermissionUser {
  role?: string | null;
}

// ============================================================
// API 封裝
// ============================================================

export interface ContentApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

/** Postgres 資料表尚未建立時的錯誤碼（部署順序顛倒的降級依據） */
export const CONTENT_SCHEMA_MISSING_CODES = [
  '42P01', // undefined_table
  'PGRST205', // PostgREST: table not found in schema cache
  'PGRST204', // column not found（新欄未推）
] as const;

export const CONTENT_NOT_ENABLED_MESSAGE =
  '功能尚未啟用：內容自動化資料表尚未建立，請先執行 migration 後重新載入。';
