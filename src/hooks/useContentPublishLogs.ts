/**
 * 發佈回執資料 hook（M1-22、M3-11、M3-12）— 本 hook 為 PublishLogView 私有，
 * 不屬於 IMPLEMENTATION-CONTRACT.md §5 的跨 owner 清單，其他檔案不得 import。
 *
 * 資料來源：
 *   - content_publish_logs（RLS 只讀；append-only 回執）
 *   - content_articles（待回填：status='scheduled' 且站點 publish_mode='manual'，或 status='publishing'）
 *   - content_articles（失敗：status='publish_failed' 或 'verify_failed'）
 *   - content_sites / webandsystem_list（補站點名稱、時區、發布模式；回執表沒有 FK 可 join）
 *
 * 寫入一律走 Edge Function（content-publish），前端不直接寫 content_publish_logs：
 *   retry      → { action: 'retry', article_id }
 *   manualDone → { action: 'manual_done', article_id, live_url }
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  contentErrorMessage,
  invokeContentFunction,
  isContentSchemaMissing,
} from '@/lib/contentApi.ts';
import type {
  ContentArticle,
  ContentPublishLog,
  ContentPublishMode,
} from '@/lib/contentTypes.ts';
import { CONTENT_STORAGE_BUCKET, formatZoneDateTime } from '@/lib/contentFormat.ts';

const LOG_QUERY_LIMIT = 500;
const PENDING_QUERY_LIMIT = 200;
const FAILED_QUERY_LIMIT = 100;
const PACKAGE_SIGNED_URL_TTL_SECONDS = 3_600;

/** 回執 + 站點時區（回執表本身沒有時區欄，由 content_sites 補上） */
export interface ContentPublishLogView extends ContentPublishLog {
  siteTimezone: string;
}

/** 待回填／失敗清單的 view model（文章 + 站點摘要） */
export interface ContentPublishArticleItem {
  article: ContentArticle;
  siteName: string | null;
  siteTimezone: string;
  publishMode: ContentPublishMode | null;
}

export interface UseContentPublishLogsResult {
  logs: ContentPublishLogView[];
  /** 待回填：manual 模式、到點後等人工貼上並回填 URL 的文章 */
  pendingItems: ContentPublishArticleItem[];
  /** 失敗待處理：publish_failed / verify_failed */
  failedItems: ContentPublishArticleItem[];
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  retry: (articleId: string) => Promise<void>;
  manualDone: (articleId: string, liveUrl: string) => Promise<ContentPublishLog | null>;
  /**
   * 手動產生內容包（M1-21）：manual 模式未到點也能先產包交付人工貼上。
   * 回傳 storage path、zip 檔名與 1 小時簽名 URL。
   */
  buildPackage: (
    articleId: string,
  ) => Promise<{ filename: string; package_path: string; signed_url: string }>;
  /** private bucket（content-assets）→ 1 小時簽名 URL */
  signPackageUrl: (packagePath: string) => Promise<string>;
  /** 正在處理的文章 id（按鈕 loading / 防重複點擊用） */
  actingArticleId: string | null;
}

const HKT_FALLBACK = 'Asia/Hong_Kong';

type SiteRow = {
  website_profile_id: string;
  publish_mode: ContentPublishMode | null;
  timezone: string | null;
};

function uniqueIds(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function fetchSiteNames(ids: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  try {
    const { data, error } = await supabase
      .from('webandsystem_list')
      .select('id, website_name')
      .in('id', [...ids]);
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; website_name: string | null }[]) {
      if (row.website_name) names.set(row.id, row.website_name);
    }
  } catch (thrown) {
    console.warn('[useContentPublishLogs] 讀取站點名稱失敗（已忽略）', thrown);
  }
  return names;
}

async function fetchSites(ids: readonly string[]): Promise<Map<string, SiteRow>> {
  const sites = new Map<string, SiteRow>();
  if (ids.length === 0) return sites;
  const { data, error } = await supabase
    .from('content_sites')
    .select('website_profile_id, publish_mode, timezone')
    .in('website_profile_id', [...ids]);
  if (error) throw error;
  for (const row of (data ?? []) as SiteRow[]) {
    sites.set(row.website_profile_id, row);
  }
  return sites;
}

async function fetchArticleTitles(ids: readonly string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (ids.length === 0) return titles;
  try {
    const { data, error } = await supabase
      .from('content_articles')
      .select('id, title')
      .in('id', [...ids]);
    if (error) throw error;
    for (const row of (data ?? []) as { id: string; title: string | null }[]) {
      titles.set(row.id, row.title ?? '');
    }
  } catch (thrown) {
    console.warn('[useContentPublishLogs] 補文章標題失敗（已忽略）', thrown);
  }
  return titles;
}

function toArticleItem(
  row: ContentArticle,
  site: SiteRow | undefined,
  siteName: string | undefined,
): ContentPublishArticleItem {
  return {
    article: row,
    siteName: siteName ?? site?.website_profile_id ?? row.site_id,
    siteTimezone: site?.timezone?.trim() || HKT_FALLBACK,
    publishMode: site?.publish_mode ?? null,
  };
}

export function useContentPublishLogs(): UseContentPublishLogsResult {
  const [logs, setLogs] = useState<ContentPublishLogView[]>([]);
  const [pendingItems, setPendingItems] = useState<ContentPublishArticleItem[]>([]);
  const [failedItems, setFailedItems] = useState<ContentPublishArticleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [actingArticleId, setActingArticleId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [logsResult, pendingResult, failedResult] = await Promise.all([
        supabase
          .from('content_publish_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(LOG_QUERY_LIMIT),
        supabase
          .from('content_articles')
          .select('*')
          .in('status', ['publishing', 'scheduled'])
          .order('scheduled_publish_at', { ascending: true })
          .limit(PENDING_QUERY_LIMIT),
        supabase
          .from('content_articles')
          .select('*')
          .in('status', ['publish_failed', 'verify_failed'])
          .order('updated_at', { ascending: false })
          .limit(FAILED_QUERY_LIMIT),
      ]);

      const firstError = logsResult.error || pendingResult.error || failedResult.error;
      if (firstError) throw firstError;

      const logRows = (logsResult.data ?? []) as ContentPublishLog[];
      const pendingRows = (pendingResult.data ?? []) as ContentArticle[];
      const failedRows = (failedResult.data ?? []) as ContentArticle[];

      const siteIds = uniqueIds([
        ...logRows.map((row) => row.site_id),
        ...pendingRows.map((row) => row.site_id),
        ...failedRows.map((row) => row.site_id),
      ]);
      const [sites, siteNames, articleTitles] = await Promise.all([
        fetchSites(siteIds),
        fetchSiteNames(siteIds),
        fetchArticleTitles(uniqueIds(logRows.map((row) => row.article_id))),
      ]);

      // 待回填只留 manual 模式（v1 全部手動貼上）；
      // 站點設定列剛好缺失時，若文章已在 publishing 仍列出，避免資料消失無處可回填
      const pending = pendingRows
        .map((row) => toArticleItem(row, sites.get(row.site_id), siteNames.get(row.site_id)))
        .filter(
          (item) =>
            item.publishMode === 'manual' ||
            (item.publishMode == null && item.article.status === 'publishing'),
        )
        .sort((a, b) => {
          const left = a.article.scheduled_publish_at ?? a.article.updated_at ?? '';
          const right = b.article.scheduled_publish_at ?? b.article.updated_at ?? '';
          return left.localeCompare(right);
        });

      const failed = failedRows.map((row) =>
        toArticleItem(row, sites.get(row.site_id), siteNames.get(row.site_id)),
      );

      setLogs(
        logRows.map((row) => ({
          ...row,
          articleTitle: row.article_id ? articleTitles.get(row.article_id) ?? null : null,
          siteName: row.site_id ? siteNames.get(row.site_id) ?? row.site_id : null,
          siteTimezone: (row.site_id ? sites.get(row.site_id)?.timezone : null)?.trim() || HKT_FALLBACK,
        })),
      );
      setPendingItems(pending);
      setFailedItems(failed);
      setMissingSchema(false);
      setError(null);
    } catch (thrown) {
      if (isContentSchemaMissing(thrown)) {
        setMissingSchema(true);
        setLogs([]);
        setPendingItems([]);
        setFailedItems([]);
        setError(null);
      } else {
        setLogs([]);
        setPendingItems([]);
        setFailedItems([]);
        setError(contentErrorMessage(thrown));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const retry = useCallback(
    async (articleId: string): Promise<void> => {
      setActingArticleId(articleId);
      try {
        await invokeContentFunction<{ queued: boolean }>('content-publish', {
          action: 'retry',
          article_id: articleId,
        });
        await refresh();
      } finally {
        setActingArticleId(null);
      }
    },
    [refresh],
  );

  const manualDone = useCallback(
    async (articleId: string, liveUrl: string): Promise<ContentPublishLog | null> => {
      const trimmed = (liveUrl || '').trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        throw new Error('請輸入完整的上線 URL（以 http:// 或 https:// 開頭）。');
      }
      setActingArticleId(articleId);
      try {
        const log = await invokeContentFunction<ContentPublishLog | null>('content-publish', {
          action: 'manual_done',
          article_id: articleId,
          live_url: trimmed,
        });
        await refresh();
        return log ?? null;
      } finally {
        setActingArticleId(null);
      }
    },
    [refresh],
  );

  const signPackageUrl = useCallback(async (packagePath: string): Promise<string> => {
    const path = (packagePath || '').trim();
    if (!path) throw new Error('這篇文章沒有內容包路徑。');
    const { data, error: signError } = await supabase.storage
      .from(CONTENT_STORAGE_BUCKET)
      .createSignedUrl(path, PACKAGE_SIGNED_URL_TTL_SECONDS);
    if (signError || !data?.signedUrl) {
      throw new Error(signError?.message || '無法產生內容包下載連結，請稍後再試。');
    }
    return data.signedUrl;
  }, []);

  /**
   * 手動產生內容包（M1-21）：呼叫 content-publish 的 build_package。
   * manual 模式即使未到排定時間，也可以先產包交付人工貼上。
   */
  const buildPackage = useCallback(
    async (
      articleId: string,
    ): Promise<{ filename: string; package_path: string; signed_url: string }> => {
      setActingArticleId(articleId);
      try {
        const result = await invokeContentFunction<{
          filename: string;
          package_path: string;
          signed_url: string;
        }>('content-publish', { action: 'build_package', article_id: articleId });
        await refresh();
        return result;
      } finally {
        setActingArticleId(null);
      }
    },
    [refresh],
  );

  return {
    logs,
    pendingItems,
    failedItems,
    loading,
    error,
    missingSchema,
    refresh,
    retry,
    manualDone,
    buildPackage,
    signPackageUrl,
    actingArticleId,
  };
}

/** UI 用：顯示排定時間（站點時區）；沒有排定時間就顯示 '—' */
export function articleScheduleLabel(item: ContentPublishArticleItem): string {
  return formatZoneDateTime(
    item.article.scheduled_publish_at ?? item.article.published_at ?? null,
    item.siteTimezone,
  );
}
