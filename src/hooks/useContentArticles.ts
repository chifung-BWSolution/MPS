/**
 * 文章資料 hook（M3-01～M3-07）
 *
 * 對應契約 IMPLEMENTATION-CONTRACT.md §5：
 *   useContentArticles(filter?) → { items, total, loading, error, missingSchema, refresh, page, setPage }
 *   useContentArticle(articleId, currentUserId?) → { detail, …, saveDraft, submitForReview, approve, requestChanges, confirm, generateCover, setCover }
 *
 * 設計說明：
 *   - 一般讀寫走 supabase-js（RLS 已開）；只有需要狀態機硬檢查的審核動作走
 *     `invokeContentFunction('content-publish')`（PRD §9.3、契約 §6）。
 *   - `content_articles` 到 `content_slots`／`seo_keywords`／`webandsystem_list` 的 join
 *     一律以第二段查詢補齊，避免 PostgREST 巢狀 select 對 FK 名稱的隱性依賴。
 *   - 樂觀鎖：所有寫入都帶 `expected_version`；後端回 409（或訊息含版本衝突）時轉成
 *     `ContentApiError.code = 'version_conflict'`，UI 據此提示「請重新載入」。
 *   - 列表的 `waitingHours` 只在 `pending_review` 時計算（PRD §8.2.1「待審最舊等待」）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CONTENT_FUNCTIONS,
  ContentApiError,
  contentErrorMessage,
  invokeContentFunction,
  isContentSchemaMissing,
  signedAssetUrls,
  toContentApiError,
  uploadContentAsset,
} from '@/lib/contentApi.ts';
import { hoursBetween, isoWeekday, todayInZone, addDaysToDateString, zonedWallTimeToUtc, HONG_KONG_TIME_ZONE } from '@/lib/contentFormat.ts';
import { buildAssetTags, buildSvgCard, SVG_CARD_HEIGHT, SVG_CARD_WIDTH } from '@/lib/contentMedia.ts';
import type {
  ContentArticle,
  ContentArticleDetail,
  ContentArticleListItem,
  ContentArticleRevision,
  ContentAsset,
  ContentKeyword,
  ContentPublishLog,
  ContentSite,
  ContentSiteProfile,
  ContentSiteSection,
  ContentSiteWithProfile,
  ContentSlot,
} from '@/lib/contentTypes.ts';

/** 契約 §5 的列表分頁大小（PRD §8.2.1） */
export const CONTENT_ARTICLES_PAGE_SIZE = 20;

const EXISTING_SLUG_LIMIT = 500;
const REVISIONS_LIMIT = 10;
const PUBLISH_LOGS_LIMIT = 20;

/** 文章佇列可寫入的欄位（避免把 joined 欄位寫回 DB） */
export interface ContentArticleDraftPatch {
  title?: string;
  body_md?: string;
  excerpt?: string;
  meta_title?: string;
  meta_description?: string;
  slug?: string;
  canonical?: string;
}

/**
 * 佇列篩選。契約欄位（siteId／status／page）原樣保留；
 * `search`／`dateFrom`／`dateTo` 是本 owner 的向後相容擴充（皆為 optional，
 * 既有只傳契約欄位的呼叫端不受影響）。
 */
export interface ContentArticleFilter {
  siteId?: string | null;
  status?: string | null;
  page?: number;
  /** 標題關鍵字（server-side ilike） */
  search?: string | null;
  /** 建立日期起（YYYY-MM-DD，站點時區僅作顯示，查詢用當日 UTC 邊界） */
  dateFrom?: string | null;
  /** 建立日期迄（YYYY-MM-DD，含當日） */
  dateTo?: string | null;
}

/** 佇列頂部指標（M3-14 的內容區版本） */
export interface ContentArticleMetrics {
  pendingReview: number;
  changesRequested: number;
  scheduled: number;
  publishedThisWeek: number;
}

const EMPTY_METRICS: ContentArticleMetrics = {
  pendingReview: 0,
  changesRequested: 0,
  scheduled: 0,
  publishedThisWeek: 0,
};

export interface SubmitForReviewResult {
  submitted: number;
  failed: { articleId: string; message: string }[];
}

export interface UseContentArticlesResult {
  items: ContentArticleListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  page: number;
  setPage: (page: number) => void;
  /** 額外：佇列頂部四個指標（不受分頁影響、受 siteId 篩選影響） */
  metrics: ContentArticleMetrics;
  metricsLoading: boolean;
  /** 額外：單篇送審（佇列批次操作用） */
  submitForReview: (articleId: string, expectedVersion: number) => Promise<void>;
  /** 額外：批次送審；逐篇失敗不中斷，回傳失敗清單 */
  submitManyForReview: (
    entries: readonly { articleId: string; expectedVersion: number }[],
  ) => Promise<SubmitForReviewResult>;
}

export interface UseContentArticleResult {
  detail: ContentArticleDetail | null;
  /** 額外：coverAsset／imageAssets 的簽名 URL（1 小時，私有 bucket） */
  assetUrls: Record<string, string>;
  /** 額外：同站既有 slug（排除本篇），供 SEO QA 的 slug 唯一性檢查 */
  existingSlugs: string[];
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  saveDraft: (patch: ContentArticleDraftPatch, expectedVersion: number) => Promise<void>;
  submitForReview: (expectedVersion: number) => Promise<void>;
  approve: (expectedVersion: number, scheduledPublishAt?: string | null) => Promise<void>;
  requestChanges: (expectedVersion: number, reason: string) => Promise<void>;
  confirm: (input: { expectedVersion: number; scheduledPublishAt: string }) => Promise<void>;
  /** 遠端刪除已發佈文章（approve；實際刪除由 worker 呼叫站點 adapter） */
  deletePublished: (reason: string) => Promise<void>;
  generateCover: () => Promise<void>;
  setCover: (assetId: string | null) => Promise<void>;
}

// ============================================================
// 共用小工具
// ============================================================

function uniqueIds(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function normalizeSlugList(rows: readonly { slug: string | null }[] | null): string[] {
  return (rows ?? [])
    .map((row) => (row.slug ?? '').trim())
    .filter((slug) => slug.length > 0);
}

/** 週一 00:00（HKT）→ 用於「已發佈本週」 */
function currentWeekStartIso(now: Date = new Date()): string {
  const timezone = HONG_KONG_TIME_ZONE;
  const today = todayInZone(timezone, now);
  const weekday = isoWeekday(now, timezone);
  const monday = addDaysToDateString(today, -(weekday - 1));
  return zonedWallTimeToUtc(monday, '00:00', timezone).toISOString();
}

function escapeLikePattern(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*');
}

function articleListQuery() {
  return supabase.from('content_articles').select('*', { count: 'exact' });
}

function articleCountQuery() {
  return supabase.from('content_articles').select('id', { count: 'exact', head: true });
}

type ArticleListQuery = ReturnType<typeof articleListQuery>;
type ArticleCountQuery = ReturnType<typeof articleCountQuery>;

async function countArticles(
  mutate?: (query: ArticleCountQuery) => ArticleCountQuery,
): Promise<number> {
  let query = articleCountQuery();
  if (mutate) query = mutate(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** 後端 409（樂觀鎖）→ 具名錯誤，讓 UI 可以據此顯示「請重新載入」 */
export function isVersionConflictError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof ContentApiError) {
    if (error.code === 'version_conflict') return true;
    if (error.status === 409) return true;
    return (
      /version|版本/i.test(error.message) &&
      /conflict|衝突|冲突|不符|不一致|mismatch|stale|expected/i.test(error.message)
    );
  }
  const shape = error as { status?: number; code?: string; message?: string };
  if (shape?.status === 409) return true;
  if (shape?.code === 'version_conflict') return true;
  return /version|版本/i.test(String(shape?.message ?? ''));
}

function normalizeWriteError(error: unknown): ContentApiError {
  const apiError = toContentApiError(error);
  if (isVersionConflictError(apiError)) {
    return new ContentApiError('version_conflict', '文章已被其他人修改，請重新載入後再試。', {
      status: apiError.status,
      details: apiError.details,
    });
  }
  return apiError;
}

async function invokePublish<T>(body: Record<string, unknown>): Promise<T> {
  try {
    return await invokeContentFunction<T>(CONTENT_FUNCTIONS.publish, body);
  } catch (error) {
    throw normalizeWriteError(error);
  }
}

// ============================================================
// 查詢輔助：名詞對照表
// ============================================================

async function fetchSlotKeywordIds(slotIds: readonly string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (slotIds.length === 0) return map;
  const { data, error } = await supabase
    .from('content_slots')
    .select('id, keyword_id')
    .in('id', [...slotIds]);
  if (error) throw error;
  for (const row of (data ?? []) as { id: string; keyword_id: string | null }[]) {
    if (row.keyword_id) map.set(row.id, row.keyword_id);
  }
  return map;
}

async function fetchKeywords(ids: readonly string[]): Promise<Map<string, ContentKeyword>> {
  const map = new Map<string, ContentKeyword>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from('seo_keywords')
    .select('*')
    .in('id', [...ids]);
  if (error) throw error;
  for (const row of (data ?? []) as ContentKeyword[]) {
    map.set(row.id, row);
  }
  return map;
}

async function fetchSiteProfiles(ids: readonly string[]): Promise<Map<string, ContentSiteProfile>> {
  const map = new Map<string, ContentSiteProfile>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from('webandsystem_list')
    .select('id, website_name, domain_url, platform, brand, status, level')
    .in('id', [...ids]);
  if (error) throw error;
  for (const row of (data ?? []) as ContentSiteProfile[]) {
    map.set(row.id, row);
  }
  return map;
}

/**
 * 站點的自動發佈設定（publish_mode／adapter）。
 * 只用於佇列的發佈狀態顯示；表還沒建或 RLS 不允許時回空 Map，不讓文章列表一起壞。
 */
async function fetchSiteSettings(
  ids: readonly string[],
): Promise<Map<string, Pick<ContentSite, 'publish_mode' | 'adapter'>>> {
  const map = new Map<string, Pick<ContentSite, 'publish_mode' | 'adapter'>>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from('content_sites')
    .select('website_profile_id, publish_mode, adapter')
    .in('website_profile_id', [...ids]);
  if (error) {
    if (isContentSchemaMissing(error)) return map;
    throw error;
  }
  for (const row of (data ?? []) as {
    website_profile_id: string;
    publish_mode: ContentSite['publish_mode'];
    adapter: ContentSite['adapter'];
  }[]) {
    map.set(row.website_profile_id, {
      publish_mode: row.publish_mode,
      adapter: row.adapter,
    });
  }
  return map;
}

// ============================================================
// 佇列 hook
// ============================================================

export function useContentArticles(filter?: ContentArticleFilter): UseContentArticlesResult {
  const siteId = (filter?.siteId ?? '').trim() || null;
  const status = (filter?.status ?? '').trim() || null;
  const search = (filter?.search ?? '').trim() || null;
  const dateFrom = (filter?.dateFrom ?? '').trim() || null;
  const dateTo = (filter?.dateTo ?? '').trim() || null;
  const filterPage = Math.max(1, Math.floor(Number(filter?.page) || 1));

  const [page, setPageState] = useState(filterPage);
  const [items, setItems] = useState<ContentArticleListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [metrics, setMetrics] = useState<ContentArticleMetrics>(EMPTY_METRICS);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const requestIdRef = useRef(0);

  // filter.page 由外部控制時同步；沒有給就讓內部 setPage 主導
  useEffect(() => {
    setPageState((current) => (current === filterPage ? current : filterPage));
  }, [filterPage]);

  const setPage = useCallback((next: number) => {
    const safe = Math.max(1, Math.floor(Number(next) || 1));
    setPageState((current) => (current === safe ? current : safe));
  }, []);

  const refreshMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const scoped = (query: ArticleCountQuery) =>
        siteId ? query.eq('site_id', siteId) : query;

      const weekStart = currentWeekStartIso();
      const [pendingReview, changesRequested, scheduled, publishedThisWeek] = await Promise.all([
        countArticles((query) => scoped(query).eq('status', 'pending_review')),
        countArticles((query) => scoped(query).eq('status', 'changes_requested')),
        countArticles((query) => scoped(query).in('status', ['approved', 'scheduled'])),
        countArticles((query) =>
          scoped(query).eq('status', 'published').gte('published_at', weekStart),
        ),
      ]);
      setMetrics({ pendingReview, changesRequested, scheduled, publishedThisWeek });
    } catch (metricError) {
      if (isContentSchemaMissing(metricError)) {
        setMissingSchema(true);
      }
      setMetrics(EMPTY_METRICS);
    } finally {
      setMetricsLoading(false);
    }
  }, [siteId]);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      let query: ArticleListQuery = articleListQuery();
      if (siteId) query = query.eq('site_id', siteId);
      if (status) query = query.eq('status', status);
      if (search) query = query.ilike('title', `%${escapeLikePattern(search)}%`);
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999`);

      const from = (page - 1) * CONTENT_ARTICLES_PAGE_SIZE;
      const { data, error: queryError, count } = await query
        .order('created_at', { ascending: false })
        .range(from, from + CONTENT_ARTICLES_PAGE_SIZE - 1);

      if (queryError) throw queryError;
      if (requestIdRef.current !== requestId) return;

      const articles = (data ?? []) as ContentArticle[];
      const slotIds = uniqueIds(articles.map((article) => article.slot_id));
      const siteIds = uniqueIds(articles.map((article) => article.site_id));

      const slotKeywordMap = await fetchSlotKeywordIds(slotIds);
      const keywordIds = uniqueIds([
        ...articles.map((article) => article.keyword_id),
        ...articles.map((article) => (article.slot_id ? slotKeywordMap.get(article.slot_id) : null)),
      ]);
      const [keywordMap, siteProfileMap, siteSettingsMap] = await Promise.all([
        fetchKeywords(keywordIds),
        fetchSiteProfiles(siteIds),
        fetchSiteSettings(siteIds),
      ]);

      if (requestIdRef.current !== requestId) return;

      const mapped: ContentArticleListItem[] = articles.map((article) => {
        const fallbackKeywordId = article.slot_id ? slotKeywordMap.get(article.slot_id) : null;
        const keywordId = article.keyword_id ?? fallbackKeywordId ?? null;
        return {
          article,
          keyword: keywordId ? keywordMap.get(keywordId) ?? null : null,
          site: siteProfileMap.get(article.site_id) ?? null,
          waitingHours:
            article.status === 'pending_review'
              ? hoursBetween(article.created_at)
              : null,
          siteSettings: siteSettingsMap.get(article.site_id) ?? null,
        };
      });

      setItems(mapped);
      setTotal(count ?? 0);
      setMissingSchema(false);
    } catch (loadError) {
      if (requestIdRef.current !== requestId) return;
      if (isContentSchemaMissing(loadError)) {
        setMissingSchema(true);
        setItems([]);
        setTotal(0);
        setError(null);
      } else {
        setError(contentErrorMessage(loadError));
        setItems([]);
        setTotal(0);
      }
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [siteId, status, search, dateFrom, dateTo, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshMetrics();
  }, [refreshMetrics]);

  const submitForReview = useCallback(
    async (articleId: string, expectedVersion: number) => {
      await invokePublish<ContentArticle>({
        action: 'submit_for_review',
        article_id: articleId,
        expected_version: expectedVersion,
      });
      await refresh();
      await refreshMetrics();
    },
    [refresh, refreshMetrics],
  );

  const submitManyForReview = useCallback(
    async (entries: readonly { articleId: string; expectedVersion: number }[]) => {
      const failed: SubmitForReviewResult['failed'] = [];
      let submitted = 0;
      for (const entry of entries) {
        try {
          await invokePublish<ContentArticle>({
            action: 'submit_for_review',
            article_id: entry.articleId,
            expected_version: entry.expectedVersion,
          });
          submitted += 1;
        } catch (submitError) {
          failed.push({
            articleId: entry.articleId,
            message: contentErrorMessage(submitError),
          });
        }
      }
      await refresh();
      await refreshMetrics();
      return { submitted, failed };
    },
    [refresh, refreshMetrics],
  );

  return {
    items,
    total,
    loading,
    error,
    missingSchema,
    refresh,
    page,
    setPage,
    metrics,
    metricsLoading,
    submitForReview,
    submitManyForReview,
  };
}

// ============================================================
// 單篇明細 hook
// ============================================================

async function fetchArticleDetail(
  articleId: string,
): Promise<{
  detail: ContentArticleDetail | null;
  existingSlugs: string[];
  assetUrls: Record<string, string>;
}> {
  const { data: articleRow, error: articleError } = await supabase
    .from('content_articles')
    .select('*')
    .eq('id', articleId)
    .maybeSingle();
  if (articleError) throw articleError;
  if (!articleRow) return { detail: null, existingSlugs: [], assetUrls: {} };

  const article = articleRow as ContentArticle;
  const imageAssetIds = Array.isArray(article.image_asset_ids)
    ? article.image_asset_ids.filter((id): id is string => typeof id === 'string')
    : [];
  const assetIds = uniqueIds([article.cover_asset_id, ...imageAssetIds]);

  const [siteRes, sectionRes, keywordRes, slotRes, assetsRes, revisionsRes, logsRes, slugsRes, profileRes] =
    await Promise.all([
      supabase.from('content_sites').select('*').eq('website_profile_id', article.site_id).maybeSingle(),
      article.section_id
        ? supabase.from('content_site_sections').select('*').eq('id', article.section_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      article.keyword_id
        ? supabase.from('seo_keywords').select('*').eq('id', article.keyword_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      article.slot_id
        ? supabase.from('content_slots').select('*').eq('id', article.slot_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      assetIds.length > 0
        ? supabase.from('content_assets').select('*').in('id', assetIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('content_article_revisions')
        .select('*')
        .eq('article_id', articleId)
        .order('version', { ascending: false })
        .limit(REVISIONS_LIMIT),
      supabase
        .from('content_publish_logs')
        .select('*')
        .eq('article_id', articleId)
        .order('created_at', { ascending: false })
        .limit(PUBLISH_LOGS_LIMIT),
      supabase
        .from('content_articles')
        .select('slug')
        .eq('site_id', article.site_id)
        .neq('id', articleId)
        .limit(EXISTING_SLUG_LIMIT),
      supabase
        .from('webandsystem_list')
        .select('id, website_name, domain_url, platform, brand, status, level')
        .eq('id', article.site_id)
        .maybeSingle(),
    ]);

  for (const result of [
    siteRes,
    sectionRes,
    keywordRes,
    slotRes,
    assetsRes,
    revisionsRes,
    logsRes,
    slugsRes,
    profileRes,
  ]) {
    if (result?.error) throw result.error;
  }

  const siteRow = (siteRes?.data ?? null) as ContentSite | null;
  const site: ContentSiteWithProfile | null = siteRow
    ? { ...siteRow, profile: ((profileRes?.data ?? null) as ContentSiteProfile | null) }
    : null;

  const assets = (assetsRes?.data ?? []) as ContentAsset[];
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const coverAsset = article.cover_asset_id ? assetMap.get(article.cover_asset_id) ?? null : null;
  const imageAssets = imageAssetIds
    .map((id) => assetMap.get(id))
    .filter((asset): asset is ContentAsset => Boolean(asset));

  const assetUrls = await signedAssetUrls([coverAsset, ...imageAssets].filter(Boolean) as ContentAsset[]);

  const detail: ContentArticleDetail = {
    article,
    site,
    section: (sectionRes?.data ?? null) as ContentSiteSection | null,
    keyword: (keywordRes?.data ?? null) as ContentKeyword | null,
    slot: (slotRes?.data ?? null) as ContentSlot | null,
    coverAsset,
    imageAssets,
    revisions: (revisionsRes?.data ?? []) as ContentArticleRevision[],
    publishLogs: (logsRes?.data ?? []) as ContentPublishLog[],
  };

  return {
    detail,
    existingSlugs: normalizeSlugList(
      (slugsRes?.data ?? []) as { slug: string | null }[] | null,
    ),
    assetUrls,
  };
}

export function useContentArticle(
  articleId: string | null,
  currentUserId?: string | null,
): UseContentArticleResult {
  const normalizedId = (articleId ?? '').trim() || null;

  const [detail, setDetail] = useState<ContentArticleDetail | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(normalizedId));
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);

  const detailRef = useRef<ContentArticleDetail | null>(null);
  detailRef.current = detail;

  const refresh = useCallback(async () => {
    if (!normalizedId) {
      setDetail(null);
      setAssetUrls({});
      setExistingSlugs([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchArticleDetail(normalizedId);
      setDetail(result.detail);
      setAssetUrls(result.assetUrls);
      setExistingSlugs(result.existingSlugs);
      setMissingSchema(false);
    } catch (loadError) {
      if (isContentSchemaMissing(loadError)) {
        setMissingSchema(true);
        setDetail(null);
        setAssetUrls({});
        setError(null);
      } else {
        setError(contentErrorMessage(loadError));
      }
    } finally {
      setLoading(false);
    }
  }, [normalizedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requireDetail = useCallback((): ContentArticleDetail => {
    const current = detailRef.current;
    if (!current) {
      throw new ContentApiError('article_not_loaded', '文章尚未載入，請重新整理後再試。');
    }
    return current;
  }, []);

  const saveDraft = useCallback(
    async (patch: ContentArticleDraftPatch, expectedVersion: number) => {
      const current = requireDetail();
      await invokePublish<ContentArticle>({
        action: 'save_draft',
        article_id: current.article.id,
        expected_version: expectedVersion,
        patch,
      });
      await refresh();
    },
    [refresh, requireDetail],
  );

  const submitForReview = useCallback(
    async (expectedVersion: number) => {
      const current = requireDetail();
      await invokePublish<ContentArticle>({
        action: 'submit_for_review',
        article_id: current.article.id,
        expected_version: expectedVersion,
      });
      await refresh();
    },
    [refresh, requireDetail],
  );

  const approve = useCallback(
    async (expectedVersion: number, scheduledPublishAt?: string | null) => {
      const current = requireDetail();
      await invokePublish<ContentArticle>({
        action: 'approve',
        article_id: current.article.id,
        expected_version: expectedVersion,
        scheduled_publish_at: scheduledPublishAt ?? null,
      });
      await refresh();
    },
    [refresh, requireDetail],
  );

  const requestChanges = useCallback(
    async (expectedVersion: number, reason: string) => {
      const trimmed = (reason ?? '').trim();
      if (!trimmed) {
        throw new ContentApiError('reason_required', '請填寫駁回原因，讓撰稿人知道要改什麼。');
      }
      const current = requireDetail();
      await invokePublish<ContentArticle>({
        action: 'reject',
        article_id: current.article.id,
        expected_version: expectedVersion,
        reason: trimmed,
      });
      await refresh();
    },
    [refresh, requireDetail],
  );

  const confirm = useCallback(
    async (input: { expectedVersion: number; scheduledPublishAt: string }) => {
      const scheduled = (input.scheduledPublishAt ?? '').trim();
      if (!scheduled) {
        throw new ContentApiError('publish_at_required', '請設定發佈時間。');
      }
      const current = requireDetail();
      await invokePublish<ContentArticle>({
        action: 'confirm',
        article_id: current.article.id,
        expected_version: input.expectedVersion,
        scheduled_publish_at: scheduled,
      });
      await refresh();
    },
    [refresh, requireDetail],
  );

  /** 遠端刪除：只排 job；實際刪除由 content-worker 呼叫 adapter（不是刪 MPS 記錄） */
  const deletePublished = useCallback(
    async (reason: string) => {
      const current = requireDetail();
      await invokePublish<{ queued: boolean; article_id: string }>({
        action: 'delete_published',
        article_id: current.article.id,
        reason: (reason ?? '').trim(),
      });
      await refresh();
    },
    [refresh, requireDetail],
  );

  const setCover = useCallback(
    async (assetId: string | null) => {
      const current = requireDetail();
      const { error: updateError } = await supabase
        .from('content_articles')
        .update({ cover_asset_id: assetId })
        .eq('id', current.article.id);
      if (updateError) throw normalizeWriteError(updateError);
      await refresh();
    },
    [refresh, requireDetail],
  );

  /**
   * 重生封面：本站不接影像 API，直接產 SVG 圖卡（PRD 決策 D9）。
   * 上傳 Storage → 寫 content_assets(source='vector') → 更新文章 cover_asset_id。
   * 這條路徑刻意不走 content-publish（不需要狀態機），與 setCover 一樣是素材操作。
   */
  const generateCover = useCallback(async () => {
    const current = requireDetail();
    const article = current.article;
    const siteName = current.site?.profile?.website_name ?? null;
    const keyword = current.keyword;
    const svg = buildSvgCard({
      title: article.title || article.slug || '未命名文章',
      subtitle: article.excerpt || keyword?.keyword || null,
      brand: siteName,
      variant: 'cover',
      width: SVG_CARD_WIDTH,
      height: SVG_CARD_HEIGHT,
      locale: current.site?.locale,
    });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const filename = `cover-${(article.slug || article.id).slice(0, 60)}.svg`;

    const uploaded = await uploadContentAsset({
      file: blob,
      filename,
      siteId: article.site_id,
      contentType: 'image/svg+xml',
    });

    const { data: assetRow, error: assetError } = await supabase
      .from('content_assets')
      .insert({
        site_id: article.site_id,
        bucket: uploaded.bucket,
        storage_path: uploaded.path,
        filename,
        mime_type: 'image/svg+xml',
        bytes: blob.size,
        source: 'vector',
        tags: buildAssetTags({
          keyword: keyword?.keyword,
          cluster: keyword?.cluster,
          sectionName: current.section?.name,
        }),
        alt: article.title || null,
        width: SVG_CARD_WIDTH,
        height: SVG_CARD_HEIGHT,
        created_by: currentUserId || null,
      })
      .select('*')
      .single();
    if (assetError) throw normalizeWriteError(assetError);
    if (!assetRow) throw new ContentApiError('asset_insert_failed', '圖卡已上傳，但素材紀錄寫入失敗。');

    const { error: coverError } = await supabase
      .from('content_articles')
      .update({ cover_asset_id: (assetRow as ContentAsset).id })
      .eq('id', article.id);
    if (coverError) throw normalizeWriteError(coverError);

    await refresh();
  }, [currentUserId, refresh, requireDetail]);

  return {
    detail,
    assetUrls,
    existingSlugs,
    loading,
    error,
    missingSchema,
    refresh,
    saveDraft,
    submitForReview,
    approve,
    requestChanges,
    confirm,
    deletePublished,
    generateCover,
    setCover,
  };
}
