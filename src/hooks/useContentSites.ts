/**
 * 社媒自動化營運 · 站點資料 hook（M1-07）
 *
 * 契約（IMPLEMENTATION-CONTRACT §5）：
 *   useContentSites()      → { sites, loading, error, missingSchema, refresh }
 *   useContentSite(siteId) → { site, sections, checks, credentials, pages, loading, error, missingSchema, refresh }
 *
 * 資料存取原則（契約 §1）：
 *   - 一般讀寫走 supabase-js（RLS 已開）；站點清單直接 join `webandsystem_list`
 *   - 憑證／連線測試一律走 `content-sites` Edge Function
 *     （`content_site_credentials` 對 authenticated 完全封閉，只能由函式回傳 metadata）
 *   - 資料表未建（42P01／PGRST205）→ missingSchema = true，**不拋錯**
 *
 * 這個檔另外匯出 M1 站點頁面共用的動作函式（saveSite／setSiteStatus／
 * upsertSection／deleteSection／saveCredential／clearCredential／runConnectionTest…
 * 以及關鍵字／文章摘要查詢）。它們不屬於 §5 契約，其他 owner 不應 import。
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  contentErrorMessage,
  invokeContentFunction,
  isContentSchemaMissing,
} from '@/lib/contentApi';
import {
  DEFAULT_BRAND_VOICE,
  DEFAULT_SEO_DEFAULTS,
  HONG_KONG_TIME_ZONE,
  todayInZone,
  zonedWallTimeToUtc,
} from '@/lib/contentFormat';
import { normalizeCadence } from '@/lib/contentPlanner';
import type {
  ContentAdapterName,
  ContentArticleStatus,
  ContentBrandVoice,
  ContentCadence,
  ContentConnectionTestResult,
  ContentCredentialKind,
  ContentCredentialMeta,
  ContentJsonLdType,
  ContentKeyword,
  ContentKeywordPipelineStatus,
  ContentPublishMode,
  ContentSectionType,
  ContentSeoDefaults,
  ContentSite,
  ContentSiteCheck,
  ContentSiteCheckKind,
  ContentSiteHealth,
  ContentSitePage,
  ContentSiteProfile,
  ContentSiteSection,
  ContentSiteStatus,
  ContentSiteWithProfile,
  ContentTier,
} from '@/lib/contentTypes';

// ============================================================
// 查詢字串與選項
// ============================================================

/** `webandsystem_list` 站點主檔欄位（站點身份唯一真實來源） */
export const CONTENT_SITE_PROFILE_COLUMNS =
  'id,website_name,domain_url,platform,brand,status,level';

/** 契約規定的站點清單查詢：content_sites left join 站點主檔 */
export const CONTENT_SITE_SELECT = `*, profile:webandsystem_list(${CONTENT_SITE_PROFILE_COLUMNS})`;

export const TIER_OPTIONS: readonly ContentTier[] = ['A1', 'A2', 'B'];

export const ADAPTER_OPTIONS: readonly ContentAdapterName[] = [
  'manual',
  'next_custom',
  'shopify',
  'wordpress',
  'webflow',
  'beauty100',
];

export const PUBLISH_MODE_OPTIONS: readonly ContentPublishMode[] = ['manual', 'draft', 'direct'];

export const SITE_STATUS_OPTIONS: readonly ContentSiteStatus[] = ['active', 'paused', 'archived'];

export const SECTION_TYPE_OPTIONS: readonly ContentSectionType[] = ['article', 'post', 'page'];

export const CREDENTIAL_KIND_OPTIONS: readonly { value: ContentCredentialKind; label: string }[] = [
  { value: 'http_bearer', label: '網站 API 權杖（Bearer Token）' },
  { value: 'http_hmac', label: '網站簽章金鑰（HMAC）' },
  { value: 'wp_app_password', label: 'WordPress 應用程式密碼' },
  { value: 'shopify_admin', label: 'Shopify 後台 API 權杖' },
  { value: 'webflow_token', label: 'Webflow API 權杖' },
];

export const LOCALE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'zh-HK', label: '繁體中文（香港）zh-HK' },
  { value: 'zh-TW', label: '繁體中文（台灣）zh-TW' },
  { value: 'zh-CN', label: '简体中文 zh-CN' },
  { value: 'en', label: 'English en' },
];

export const TIMEZONE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong（香港）' },
  { value: 'Asia/Macau', label: 'Asia/Macau（澳門）' },
  { value: 'Asia/Taipei', label: 'Asia/Taipei（台北）' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai（上海）' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore（新加坡）' },
  { value: 'UTC', label: 'UTC' },
];

export const WEEKDAY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1, label: '週一' },
  { value: 2, label: '週二' },
  { value: 3, label: '週三' },
  { value: 4, label: '週四' },
  { value: 5, label: '週五' },
  { value: 6, label: '週六' },
  { value: 7, label: '週日' },
];

export const CHECK_KIND_LABEL: Readonly<Record<ContentSiteCheckKind, string>> = {
  settings: '基本設定完整',
  domain: '網站首頁可開啟',
  sitemap: '網站地圖（選填）',
  credential: '登入憑證可用',
};

/** 由站點主檔 level（1–5）推薦 tier：1 → A1、2 → A2、其餘 B */
export function inferTierFromLevel(level: number | null | undefined): ContentTier {
  const parsed = Number(level);
  if (parsed === 1) return 'A1';
  if (parsed === 2) return 'A2';
  return 'B';
}

// ============================================================
// JSONB 正規化（資料庫有 DEFAULT，但舊列／部分更新可能缺欄）
// ============================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  const first = Array.isArray(value) ? value[0] : null;
  return isRecord(first) ? first : {};
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function asInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function normalizeContentSeoDefaults(value: unknown): ContentSeoDefaults {
  const source = asRecord(value);
  const text = (key: keyof ContentSeoDefaults, fallback: string): string => {
    const entry = source[key];
    return typeof entry === 'string' ? entry : fallback;
  };
  const categoryMap: Record<string, string> = {};
  const rawMap = source.categoryMap;
  if (isRecord(rawMap)) {
    for (const [key, entry] of Object.entries(rawMap)) {
      if (typeof entry === 'string') categoryMap[key] = entry;
    }
  }

  return {
    locale: text('locale', DEFAULT_SEO_DEFAULTS.locale),
    titleTemplate: text('titleTemplate', DEFAULT_SEO_DEFAULTS.titleTemplate),
    metaTemplate: text('metaTemplate', DEFAULT_SEO_DEFAULTS.metaTemplate),
    slugRule: text('slugRule', DEFAULT_SEO_DEFAULTS.slugRule),
    canonicalBase: text('canonicalBase', DEFAULT_SEO_DEFAULTS.canonicalBase),
    author: text('author', DEFAULT_SEO_DEFAULTS.author),
    publisher: text('publisher', DEFAULT_SEO_DEFAULTS.publisher),
    ogImage: text('ogImage', DEFAULT_SEO_DEFAULTS.ogImage),
    jsonLdType: pickEnum<ContentJsonLdType>(
      source.jsonLdType,
      ['BlogPosting', 'Article'],
      DEFAULT_SEO_DEFAULTS.jsonLdType,
    ),
    categoryMap,
    robotsDraft: text('robotsDraft', DEFAULT_SEO_DEFAULTS.robotsDraft),
    robotsLive: text('robotsLive', DEFAULT_SEO_DEFAULTS.robotsLive),
    wordCountMin: asInteger(source.wordCountMin, DEFAULT_SEO_DEFAULTS.wordCountMin),
    wordCountMax: asInteger(source.wordCountMax, DEFAULT_SEO_DEFAULTS.wordCountMax),
    internalLinksMin: asInteger(source.internalLinksMin, DEFAULT_SEO_DEFAULTS.internalLinksMin),
    internalLinksMax: asInteger(source.internalLinksMax, DEFAULT_SEO_DEFAULTS.internalLinksMax),
    bannedWords: Array.isArray(source.bannedWords)
      ? asStringList(source.bannedWords)
      : [...DEFAULT_SEO_DEFAULTS.bannedWords],
  };
}

export function normalizeContentBrandVoice(value: unknown): ContentBrandVoice {
  const source = asRecord(value);
  const text = (key: 'tone' | 'audience' | 'cta' | 'factBoundaries'): string =>
    typeof source[key] === 'string' ? (source[key] as string) : DEFAULT_BRAND_VOICE[key];

  return {
    tone: text('tone'),
    audience: text('audience'),
    cta: text('cta'),
    bannedWords: Array.isArray(source.bannedWords)
      ? asStringList(source.bannedWords)
      : [...DEFAULT_BRAND_VOICE.bannedWords],
    factBoundaries: text('factBoundaries'),
    allowAiImages:
      typeof source.allowAiImages === 'boolean'
        ? source.allowAiImages
        : DEFAULT_BRAND_VOICE.allowAiImages,
  };
}

export function normalizeContentCadence(value: unknown): ContentCadence {
  return normalizeCadence((isRecord(value) ? value : {}) as Partial<ContentCadence>);
}

function normalizeProfile(value: unknown): ContentSiteProfile | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!isRecord(raw)) return null;
  const id = asTrimmedString(raw.id);
  if (!id) return null;
  const level = Number(raw.level);
  return {
    id,
    website_name: asTrimmedString(raw.website_name) ?? id,
    domain_url: asTrimmedString(raw.domain_url),
    platform: asTrimmedString(raw.platform),
    brand: asTrimmedString(raw.brand),
    status: asTrimmedString(raw.status),
    level: Number.isFinite(level) ? level : null,
  };
}

/** DB 資料列（含 joined profile）→ 契約型別；缺欄一律以預設值補齊 */
export function normalizeContentSite(value: unknown): ContentSiteWithProfile | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!isRecord(raw)) return null;
  const siteId = asTrimmedString(raw.website_profile_id);
  if (!siteId) return null;
  const lastVerifiedAt = asTrimmedString(raw.last_verified_at);

  return {
    website_profile_id: siteId,
    tier: pickEnum(raw.tier, TIER_OPTIONS, 'B'),
    adapter: pickEnum(raw.adapter, ADAPTER_OPTIONS, 'manual'),
    publish_mode: pickEnum(raw.publish_mode, PUBLISH_MODE_OPTIONS, 'manual'),
    locale: asTrimmedString(raw.locale) ?? 'zh-HK',
    timezone: asTrimmedString(raw.timezone) ?? HONG_KONG_TIME_ZONE,
    cadence: normalizeContentCadence(raw.cadence),
    seo_defaults: normalizeContentSeoDefaults(raw.seo_defaults),
    brand_voice: normalizeContentBrandVoice(raw.brand_voice),
    health: pickEnum<ContentSiteHealth>(
      raw.health,
      ['untested', 'ok', 'degraded', 'down'],
      'untested',
    ),
    last_verified_at: lastVerifiedAt,
    status: pickEnum(raw.status, SITE_STATUS_OPTIONS, 'active'),
    notes: asTrimmedString(raw.notes),
    created_at: asTrimmedString(raw.created_at) ?? new Date(0).toISOString(),
    updated_at: asTrimmedString(raw.updated_at) ?? new Date(0).toISOString(),
    profile: normalizeProfile(raw.profile),
  };
}

function normalizeSection(value: unknown): ContentSiteSection | null {
  if (!isRecord(value)) return null;
  const id = asTrimmedString(value.id);
  const siteId = asTrimmedString(value.site_id);
  if (!id || !siteId) return null;
  return {
    id,
    site_id: siteId,
    name: asTrimmedString(value.name) ?? '',
    external_id: asTrimmedString(value.external_id),
    slug: asTrimmedString(value.slug) ?? '',
    content_type: pickEnum(value.content_type, SECTION_TYPE_OPTIONS, 'article'),
    mapping: isRecord(value.mapping) ? value.mapping : {},
    created_at: asTrimmedString(value.created_at) ?? new Date(0).toISOString(),
    updated_at: asTrimmedString(value.updated_at) ?? new Date(0).toISOString(),
  };
}

function normalizeCheck(value: unknown): ContentSiteCheck | null {
  if (!isRecord(value)) return null;
  const id = asTrimmedString(value.id);
  const siteId = asTrimmedString(value.site_id);
  if (!id || !siteId) return null;
  return {
    id,
    site_id: siteId,
    checked_at: asTrimmedString(value.checked_at) ?? new Date(0).toISOString(),
    kind: pickEnum<ContentSiteCheckKind>(
      value.kind,
      ['settings', 'domain', 'sitemap', 'credential'],
      'settings',
    ),
    ok: Boolean(value.ok),
    detail: isRecord(value.detail) ? value.detail : {},
  };
}

function normalizePage(value: unknown): ContentSitePage | null {
  if (!isRecord(value)) return null;
  const id = asTrimmedString(value.id);
  const siteId = asTrimmedString(value.site_id);
  if (!id || !siteId) return null;
  return {
    id,
    site_id: siteId,
    url: asTrimmedString(value.url) ?? '',
    title: asTrimmedString(value.title),
    source: value.source === 'manual' ? 'manual' : 'sitemap',
    last_seen_at: asTrimmedString(value.last_seen_at),
    created_at: asTrimmedString(value.created_at) ?? new Date(0).toISOString(),
  };
}

function normalizeCredentialMeta(value: unknown): ContentCredentialMeta | null {
  if (!isRecord(value)) return null;
  const kind = pickEnum<ContentCredentialKind>(
    value.kind,
    CREDENTIAL_KIND_OPTIONS.map((option) => option.value),
    'http_bearer',
  );
  return {
    kind,
    fingerprint: asTrimmedString(value.fingerprint),
    status: pickEnum(value.status, ['active', 'invalid', 'untested'] as const, 'untested'),
    expires_at: asTrimmedString(value.expires_at),
    last_verified_at: asTrimmedString(value.last_verified_at),
  };
}

// ============================================================
// useContentSites（站點清單）
// ============================================================

export interface UseContentSitesResult {
  sites: ContentSiteWithProfile[];
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
}

export function useContentSites(): UseContentSitesResult {
  const [sites, setSites] = useState<ContentSiteWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from('content_sites')
        .select(CONTENT_SITE_SELECT)
        .order('created_at', { ascending: true });
      if (queryError) throw queryError;

      const rows: ContentSiteWithProfile[] = [];
      for (const row of data ?? []) {
        const normalized = normalizeContentSite(row);
        if (normalized) rows.push(normalized);
      }
      setSites(rows);
      setError(null);
      setMissingSchema(false);
    } catch (thrown) {
      if (isContentSchemaMissing(thrown)) {
        setMissingSchema(true);
        setError(null);
      } else {
        setError(contentErrorMessage(thrown));
      }
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sites, loading, error, missingSchema, refresh };
}

// ============================================================
// useContentSite（站點詳情）
// ============================================================

export interface UseContentSiteResult {
  site: ContentSiteWithProfile | null;
  sections: ContentSiteSection[];
  checks: ContentSiteCheck[];
  credentials: ContentCredentialMeta[];
  pages: ContentSitePage[];
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
}

const SECTION_COLUMNS = '*';
const CHECK_HISTORY_LIMIT = 20;
const SITE_PAGE_LIMIT = 200;

/**
 * 憑證 metadata 只能由 Edge Function 取得（RLS 對 authenticated 完全封閉）。
 * 函式未部署或暫時失敗時回空陣列 —— 不能因此讓整個詳情頁失敗。
 */
export async function fetchSiteCredentials(siteId: string): Promise<ContentCredentialMeta[]> {
  if (!siteId) return [];
  try {
    const data = await invokeContentFunction<{ credentials?: unknown }>('content-sites', {
      action: 'get',
      site_id: siteId,
    });
    const rawList = Array.isArray(data) ? data : data?.credentials;
    if (!Array.isArray(rawList)) return [];
    return rawList
      .map(normalizeCredentialMeta)
      .filter((item): item is ContentCredentialMeta => Boolean(item));
  } catch (thrown) {
    console.warn('[useContentSite] 讀取憑證 metadata 失敗（已降級為空清單）', thrown);
    return [];
  }
}

export function useContentSite(siteId: string | null): UseContentSiteResult {
  const [site, setSite] = useState<ContentSiteWithProfile | null>(null);
  const [sections, setSections] = useState<ContentSiteSection[]>([]);
  const [checks, setChecks] = useState<ContentSiteCheck[]>([]);
  const [credentials, setCredentials] = useState<ContentCredentialMeta[]>([]);
  const [pages, setPages] = useState<ContentSitePage[]>([]);
  const [loading, setLoading] = useState(Boolean(siteId));
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);

  const refresh = useCallback(async () => {
    if (!siteId) {
      setSite(null);
      setSections([]);
      setChecks([]);
      setCredentials([]);
      setPages([]);
      setError(null);
      setMissingSchema(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [siteRes, sectionsRes, checksRes, pagesRes] = await Promise.all([
        supabase
          .from('content_sites')
          .select(CONTENT_SITE_SELECT)
          .eq('website_profile_id', siteId)
          .maybeSingle(),
        supabase
          .from('content_site_sections')
          .select(SECTION_COLUMNS)
          .eq('site_id', siteId)
          .order('created_at', { ascending: true }),
        supabase
          .from('content_site_checks')
          .select('*')
          .eq('site_id', siteId)
          .order('checked_at', { ascending: false })
          .limit(CHECK_HISTORY_LIMIT),
        supabase
          .from('content_site_pages')
          .select('*')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false })
          .limit(SITE_PAGE_LIMIT),
      ]);

      if (siteRes.error) throw siteRes.error;
      if (sectionsRes.error) throw sectionsRes.error;
      if (checksRes.error) throw checksRes.error;
      if (pagesRes.error) throw pagesRes.error;

      setSite(normalizeContentSite(siteRes.data));
      setSections(
        (sectionsRes.data ?? [])
          .map(normalizeSection)
          .filter((item): item is ContentSiteSection => Boolean(item)),
      );
      setChecks(
        (checksRes.data ?? [])
          .map(normalizeCheck)
          .filter((item): item is ContentSiteCheck => Boolean(item)),
      );
      setPages(
        (pagesRes.data ?? [])
          .map(normalizePage)
          .filter((item): item is ContentSitePage => Boolean(item)),
      );
      setError(null);
      setMissingSchema(false);
    } catch (thrown) {
      if (isContentSchemaMissing(thrown)) {
        setMissingSchema(true);
        setError(null);
      } else {
        setError(contentErrorMessage(thrown));
      }
      setSite(null);
      setSections([]);
      setChecks([]);
      setPages([]);
    } finally {
      setLoading(false);
    }

    // 憑證 metadata 走 Edge Function；即使失敗也已在函式內降級，不影響其他區塊
    const credentialList = await fetchSiteCredentials(siteId);
    setCredentials(credentialList);
  }, [siteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { site, sections, checks, credentials, pages, loading, error, missingSchema, refresh };
}

// ============================================================
// 站點今日指標（站點清單頂部／卡片用）
// ============================================================

const METRIC_QUERY_LIMIT = 2_000;

/** 待審：與收件匣同口徑（只算需要人決定的狀態） */
const PENDING_REVIEW_STATUSES: readonly ContentArticleStatus[] = [
  'pending_review',
  'changes_requested',
];

const FAILED_STATUSES: readonly ContentArticleStatus[] = ['publish_failed', 'verify_failed'];

interface ArticleMetricRow {
  id: string;
  site_id: string;
  status: ContentArticleStatus;
  created_at: string | null;
  published_at: string | null;
}

interface SlotMetricRow {
  id: string;
  site_id: string;
  status: string;
  keyword_id: string | null;
}

export interface ContentSiteTodayCounts {
  generated: number;
  pending: number;
  published: number;
  failed: number;
}

export interface ContentOverviewMetrics {
  generated: number;
  pending: number;
  published: number;
  failed: number;
  missingKeywords: number;
}

const EMPTY_TODAY_COUNTS: ContentSiteTodayCounts = {
  generated: 0,
  pending: 0,
  published: 0,
  failed: 0,
};

const EMPTY_OVERVIEW_METRICS: ContentOverviewMetrics = {
  generated: 0,
  pending: 0,
  published: 0,
  failed: 0,
  missingKeywords: 0,
};

export interface UseContentOverviewMetricsResult {
  metrics: ContentOverviewMetrics;
  /** key = website_profile_id；沒有活動的站點不會出現（UI 自行補 0） */
  perSite: Record<string, ContentSiteTodayCounts>;
  loading: boolean;
  refresh: () => Promise<void>;
}

async function queryRows<T>(build: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await build();
  if (error) throw error;
  return data ?? [];
}

/**
 * 站點清單的指標：今日生成／待審／已發／失敗／缺關鍵字。
 *
 * 口徑與日報（contentDigest）一致，「今日」以香港時間為日界；
 * 任一查詢失敗只讓該維度顯示 0，不阻塞整頁（PRD §8.3）。
 */
export function useContentOverviewMetrics(): UseContentOverviewMetricsResult {
  const [metrics, setMetrics] = useState<ContentOverviewMetrics>(EMPTY_OVERVIEW_METRICS);
  const [perSite, setPerSite] = useState<Record<string, ContentSiteTodayCounts>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const today = todayInZone(HONG_KONG_TIME_ZONE);
      const dayStartIso = zonedWallTimeToUtc(today, '00:00', HONG_KONG_TIME_ZONE).toISOString();

      const results = await Promise.allSettled([
        queryRows<ArticleMetricRow>(() =>
          supabase
            .from('content_articles')
            .select('id,site_id,status,created_at,published_at')
            .gte('created_at', dayStartIso)
            .limit(METRIC_QUERY_LIMIT),
        ),
        queryRows<ArticleMetricRow>(() =>
          supabase
            .from('content_articles')
            .select('id,site_id,status,created_at,published_at')
            .in('status', [...PENDING_REVIEW_STATUSES, ...FAILED_STATUSES])
            .limit(METRIC_QUERY_LIMIT),
        ),
        queryRows<ArticleMetricRow>(() =>
          supabase
            .from('content_articles')
            .select('id,site_id,status,created_at,published_at')
            .gte('published_at', dayStartIso)
            .limit(METRIC_QUERY_LIMIT),
        ),
        queryRows<SlotMetricRow>(() =>
          supabase
            .from('content_slots')
            .select('id,site_id,status,keyword_id')
            .is('keyword_id', null)
            .in('status', ['planned', 'generating'])
            .limit(METRIC_QUERY_LIMIT),
        ),
      ]);

      const rowsOf = <T,>(index: number): T[] => {
        const result = results[index];
        return result.status === 'fulfilled' ? (result.value as T[]) : [];
      };

      const createdRows = rowsOf<ArticleMetricRow>(0);
      const actionableRows = rowsOf<ArticleMetricRow>(1);
      const publishedRows = rowsOf<ArticleMetricRow>(2);
      const slotRows = rowsOf<SlotMetricRow>(3);

      if (results.every((result) => result.status === 'rejected')) {
        setMetrics(EMPTY_OVERVIEW_METRICS);
        setPerSite({});
        return;
      }

      const nextPerSite: Record<string, ContentSiteTodayCounts> = {};
      const ensureCounts = (siteId: string): ContentSiteTodayCounts => {
        const existing = nextPerSite[siteId];
        if (existing) return existing;
        const created: ContentSiteTodayCounts = { ...EMPTY_TODAY_COUNTS };
        nextPerSite[siteId] = created;
        return created;
      };

      for (const row of createdRows) {
        ensureCounts(row.site_id).generated += 1;
      }
      for (const row of actionableRows) {
        const counts = ensureCounts(row.site_id);
        if (PENDING_REVIEW_STATUSES.includes(row.status)) counts.pending += 1;
        if (FAILED_STATUSES.includes(row.status)) counts.failed += 1;
      }
      for (const row of publishedRows) {
        ensureCounts(row.site_id).published += 1;
      }

      setPerSite(nextPerSite);
      setMetrics({
        generated: createdRows.length,
        pending: actionableRows.filter((row) => PENDING_REVIEW_STATUSES.includes(row.status)).length,
        published: publishedRows.length,
        failed: actionableRows.filter((row) => FAILED_STATUSES.includes(row.status)).length,
        missingKeywords: slotRows.length,
      });
    } catch (thrown) {
      // 查詢失敗一律顯示 0，不阻塞站點清單
      console.warn('[useContentOverviewMetrics] 指標查詢失敗（已降級為 0）', thrown);
      setMetrics(EMPTY_OVERVIEW_METRICS);
      setPerSite({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { metrics, perSite, loading, refresh };
}

// ============================================================
// 站點詳情 · 關鍵字／文章摘要（tab 用；只讀 supabase-js）
// ============================================================

const KEYWORD_COLUMNS =
  'id,website_profile_id,keyword,normalized_keyword,level,search_volume,current_ranking,target_ranking,target_page,difficulty_score,status,ai_generated,source,gsc_site_url,last_gsc_sync_at,intent,priority,cluster,pipeline_status,last_used_at,created_at,updated_at';

export interface SiteKeywordSummary {
  total: number;
  /** pipeline_status = 'backlog'（可被 planner 挑選） */
  backlog: number;
  planned: number;
  generating: number;
  inReview: number;
  published: number;
  /** pipeline_status = null（尚未啟用自動生成） */
  unclassified: number;
  items: ContentKeyword[];
}

function normalizeKeyword(value: unknown): ContentKeyword | null {
  if (!isRecord(value)) return null;
  const id = asTrimmedString(value.id);
  const profileId = asTrimmedString(value.website_profile_id);
  if (!id || !profileId) return null;
  const pipelineStatus =
    typeof value.pipeline_status === 'string'
      ? pickEnum<ContentKeywordPipelineStatus>(
          value.pipeline_status,
          ['backlog', 'planned', 'generating', 'in_review', 'published', 'rejected', 'parked'],
          'backlog',
        )
      : null;
  const numberOrNull = (input: unknown): number | null => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    id,
    website_profile_id: profileId,
    keyword: asTrimmedString(value.keyword) ?? '',
    normalized_keyword: asTrimmedString(value.normalized_keyword) ?? '',
    level: pickEnum(value.level, ['level_1', 'level_2', 'level_3'] as const, 'level_3'),
    search_volume: numberOrNull(value.search_volume),
    current_ranking: numberOrNull(value.current_ranking),
    target_ranking: numberOrNull(value.target_ranking),
    target_page: asTrimmedString(value.target_page),
    difficulty_score: numberOrNull(value.difficulty_score),
    status: pickEnum(
      value.status,
      ['monitoring', 'optimizing', 'achieved', 'paused'] as const,
      'monitoring',
    ),
    ai_generated: Boolean(value.ai_generated),
    source: pickEnum(value.source, ['manual', 'gsc', 'ads', 'import'] as const, 'manual'),
    gsc_site_url: asTrimmedString(value.gsc_site_url),
    last_gsc_sync_at: asTrimmedString(value.last_gsc_sync_at),
    intent:
      typeof value.intent === 'string'
        ? pickEnum(
            value.intent,
            ['informational', 'commercial', 'transactional', 'navigational'] as const,
            'informational',
          )
        : null,
    priority: numberOrNull(value.priority),
    cluster: asTrimmedString(value.cluster),
    pipeline_status: pipelineStatus,
    last_used_at: asTrimmedString(value.last_used_at),
    created_at: asTrimmedString(value.created_at) ?? new Date(0).toISOString(),
    updated_at: asTrimmedString(value.updated_at) ?? new Date(0).toISOString(),
  };
}

export async function fetchSiteKeywords(
  siteId: string,
  limit = 20,
  statusLimit = 5_000,
): Promise<SiteKeywordSummary> {
  const [totalRes, itemsRes, statusRes] = await Promise.all([
    supabase
      .from('seo_keywords')
      .select('id', { count: 'exact', head: true })
      .eq('website_profile_id', siteId),
    supabase
      .from('seo_keywords')
      .select(KEYWORD_COLUMNS)
      .eq('website_profile_id', siteId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, limit)),
    supabase
      .from('seo_keywords')
      .select('pipeline_status')
      .eq('website_profile_id', siteId)
      .limit(statusLimit),
  ]);

  if (totalRes.error) throw totalRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (statusRes.error) throw statusRes.error;

  const summary: SiteKeywordSummary = {
    total: totalRes.count ?? 0,
    backlog: 0,
    planned: 0,
    generating: 0,
    inReview: 0,
    published: 0,
    unclassified: 0,
    items: (itemsRes.data ?? [])
      .map(normalizeKeyword)
      .filter((item): item is ContentKeyword => Boolean(item)),
  };

  for (const row of statusRes.data ?? []) {
    const status = (row as { pipeline_status?: string | null }).pipeline_status ?? null;
    if (status === 'backlog') summary.backlog += 1;
    else if (status === 'planned') summary.planned += 1;
    else if (status === 'generating') summary.generating += 1;
    else if (status === 'in_review') summary.inReview += 1;
    else if (status === 'published') summary.published += 1;
    else if (!status) summary.unclassified += 1;
  }

  return summary;
}

export type SiteArticleRow = {
  id: string;
  site_id: string;
  title: string;
  status: ContentArticleStatus;
  created_at: string;
  published_at: string | null;
  updated_at: string;
};

export async function fetchSiteArticles(siteId: string, limit = 20): Promise<SiteArticleRow[]> {
  const { data, error } = await supabase
    .from('content_articles')
    .select('id,site_id,title,status,created_at,published_at,updated_at')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, limit));
  if (error) throw error;

  const rows: SiteArticleRow[] = [];
  for (const row of data ?? []) {
    const record = asRecord(row);
    const id = asTrimmedString(record.id);
    const rowSiteId = asTrimmedString(record.site_id);
    if (!id || !rowSiteId) continue;
    rows.push({
      id,
      site_id: rowSiteId,
      title: asTrimmedString(record.title) ?? '（未命名文章）',
      status: pickEnum<ContentArticleStatus>(
        record.status,
        [
          'draft',
          'pending_review',
          'changes_requested',
          'held',
          'approved',
          'scheduled',
          'publishing',
          'published',
          'updating',
          'publish_failed',
          'verify_failed',
          'cancelled',
          'manual_done',
          'draft_published',
        ],
        'draft',
      ),
      created_at: asTrimmedString(record.created_at) ?? new Date(0).toISOString(),
      published_at: asTrimmedString(record.published_at),
      updated_at: asTrimmedString(record.updated_at) ?? new Date(0).toISOString(),
    });
  }
  return rows;
}

// ============================================================
// 接入精靈 · 站點候選（Edge Function：list_site_candidates）
// ============================================================

export interface SiteCandidate {
  id: string;
  website_name: string;
  domain_url: string | null;
  platform: string | null;
  brand: string | null;
  /** 後端多回的站點等級（1–5），用來推薦 tier；舊函式可能沒有 */
  level: number | null;
  connected: boolean;
}

export async function listSiteCandidates(query?: string): Promise<SiteCandidate[]> {
  const trimmed = (query ?? '').trim();
  const data = await invokeContentFunction<unknown>('content-sites', {
    action: 'list_site_candidates',
    ...(trimmed ? { query: trimmed } : {}),
  });

  // 契約是「回陣列」；同時容忍 { candidates: [...] } / { sites: [...] } 的包裝
  const record = isRecord(data) ? data : null;
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(record?.candidates)
      ? (record?.candidates as unknown[])
      : Array.isArray(record?.sites)
        ? (record?.sites as unknown[])
        : [];

  const candidates: SiteCandidate[] = [];
  for (const row of rawList) {
    const item = asRecord(row);
    const id = asTrimmedString(item.id);
    if (!id) continue;
    const level = Number(item.level);
    candidates.push({
      id,
      website_name: asTrimmedString(item.website_name) ?? id,
      domain_url: asTrimmedString(item.domain_url),
      platform: asTrimmedString(item.platform),
      brand: asTrimmedString(item.brand),
      level: Number.isFinite(level) ? level : null,
      connected: Boolean(item.connected),
    });
  }
  return candidates;
}

// ============================================================
// 寫入動作（一律走 content-sites Edge Function，契約 §6）
// ============================================================

/** upsert_settings 的白名單 patch（後端會再驗一次列舉值與 cadence） */
export interface ContentSiteSettingsPatch {
  tier?: ContentTier;
  adapter?: ContentAdapterName;
  publish_mode?: ContentPublishMode;
  locale?: string;
  timezone?: string;
  status?: ContentSiteStatus;
  notes?: string | null;
  cadence?: Partial<ContentCadence>;
  seo_defaults?: Partial<ContentSeoDefaults>;
  brand_voice?: Partial<ContentBrandVoice>;
}

interface ContentSitesFunctionBody extends Record<string, unknown> {
  action: string;
}

async function callSiteFunction<T>(body: ContentSitesFunctionBody): Promise<T> {
  return invokeContentFunction<T>('content-sites', body);
}

/** 接入／更新站點設定（首次呼叫會自動建立 content_sites 列，前提是站點主檔存在） */
export async function saveSite(siteId: string, patch: ContentSiteSettingsPatch): Promise<void> {
  if (!siteId) throw new Error('缺少站點 ID，無法儲存站點設定。');
  await callSiteFunction<ContentSite>({ action: 'upsert_settings', site_id: siteId, patch });
}

/** 別名：與契約文件用字一致 */
export const updateSite = saveSite;

export async function setSiteStatus(
  siteId: string,
  status: ContentSiteStatus,
  notes?: string | null,
): Promise<void> {
  if (!siteId) throw new Error('缺少站點 ID，無法更新站點狀態。');
  const body: ContentSitesFunctionBody = { action: 'set_status', site_id: siteId, status };
  if (notes !== undefined) body.notes = notes;
  await callSiteFunction<ContentSite>(body);
}

export interface ContentSiteRemovalResult {
  removed: true;
  site_id: string;
  deleted: {
    sections: number;
    slots: number;
    articles: number;
    credentials: number;
    checks: number;
  };
}

/**
 * 解除接入：把站點退回「未接入」，之後可以重新走接入精靈。
 *
 * 會刪除該站的欄目／排程／文章／修訂／憑證／檢查紀錄（DB cascade，無法復原）；
 * 站點主檔（webandsystem_list）、GSC／廣告資料不受影響。
 * 明確帶 confirm: true，避免誤呼叫。
 */
export async function removeSite(siteId: string): Promise<ContentSiteRemovalResult> {
  if (!siteId) throw new Error('缺少站點 ID，無法移除接入。');
  return callSiteFunction<ContentSiteRemovalResult>({
    action: 'remove_site',
    site_id: siteId,
    confirm: true,
  });
}

export interface ContentSiteSectionDraft {
  /** 有 id = 更新既有欄目 */
  id?: string;
  name: string;
  slug: string;
  external_id?: string | null;
  content_type?: ContentSectionType;
  mapping?: Record<string, unknown>;
}

export async function upsertSection(
  siteId: string,
  section: ContentSiteSectionDraft,
): Promise<ContentSiteSection | null> {
  if (!siteId) throw new Error('缺少站點 ID，無法儲存欄目。');
  const data = await callSiteFunction<unknown>({
    action: 'upsert_section',
    site_id: siteId,
    section: {
      ...(section.id ? { id: section.id } : {}),
      name: section.name,
      slug: section.slug,
      external_id: section.external_id ?? null,
      content_type: section.content_type ?? 'article',
      ...(section.mapping ? { mapping: section.mapping } : {}),
    },
  });
  return normalizeSection(data);
}

export async function deleteSection(siteId: string, sectionId: string): Promise<void> {
  if (!siteId || !sectionId) throw new Error('缺少站點或欄目 ID，無法刪除欄目。');
  await callSiteFunction<{ deleted: true }>({
    action: 'delete_section',
    site_id: siteId,
    section_id: sectionId,
  });
}

export async function saveCredential(
  siteId: string,
  kind: ContentCredentialKind,
  secret: string,
  expiresAt?: string | null,
): Promise<ContentCredentialMeta | null> {
  if (!siteId) throw new Error('缺少站點 ID，無法儲存憑證。');
  const trimmed = (secret ?? '').trim();
  if (!trimmed) throw new Error('憑證內容不可為空。');
  const data = await callSiteFunction<unknown>({
    action: 'save_credential',
    site_id: siteId,
    kind,
    secret: trimmed,
    expires_at: expiresAt || null,
  });
  return normalizeCredentialMeta(data);
}

export async function clearCredential(
  siteId: string,
  kind: ContentCredentialKind,
): Promise<void> {
  if (!siteId) throw new Error('缺少站點 ID，無法清除憑證。');
  await callSiteFunction<{ cleared: true }>({ action: 'clear_credential', site_id: siteId, kind });
}

/** 連線測試：函式固定回 200 + 逐項 checks，失敗的項目在 checks 裡（不是拋錯） */
export async function runConnectionTest(siteId: string): Promise<ContentConnectionTestResult> {
  if (!siteId) throw new Error('缺少站點 ID，無法測試連線。');
  const data = await callSiteFunction<unknown>({ action: 'test_connection', site_id: siteId });
  const record = asRecord(data);
  const checks = Array.isArray(record.checks)
    ? (record.checks as ContentConnectionTestResult['checks'])
    : [];
  return {
    health: pickEnum<ContentSiteHealth>(
      record.health,
      ['untested', 'ok', 'degraded', 'down'],
      'untested',
    ),
    checks,
    testedAt: asTrimmedString(record.testedAt) ?? new Date().toISOString(),
  };
}

// ============================================================
// 小工具（頁面共用）
// ============================================================

/** 逗號／頓號／換行分隔的字串 → 去重陣列（禁用詞輸入框用） */
export function parseListInput(value: string): string[] {
  const parts = (value ?? '')
    .split(/[,，、\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

/** 站點顯示名稱（profile 缺席時退回 id） */
export function siteDisplayName(site: ContentSiteWithProfile): string {
  return site.profile?.website_name?.trim() || site.website_profile_id;
}
