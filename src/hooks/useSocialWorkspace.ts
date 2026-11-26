/**
 * 社媒自動化營運 · 工作區資料 hook（M4 共用）
 *
 * 給 radar／queue／studio／calendar／library 等頁面共用：
 *   - 一份 `content-social:list` 快照（每 30 秒輪詢）
 *   - 所有 mutation（匯入、改稿、改文案、排期、產包、審核、標記已發）
 *   - 營運健康摘要（`content-sources:health`）
 *
 * 資料形狀沿用 useSocialDesk 的 SocialDeskData，避免兩套型別漂移；
 * 錯誤一律轉成中文訊息，42P01 由 `missingSchema` 讓頁面降級。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  contentErrorMessage,
  invokeContentFunction,
  isContentSchemaMissing,
} from '@/lib/contentApi.ts';
import {
  normalizeSocialDeskData,
  type SocialDeskData,
  type SocialDeskPost,
  type SocialDeskTarget,
} from './useSocialDesk.ts';

export interface SocialAlertItem {
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  count: number;
}

export interface SocialHealth {
  generatedAt: string;
  alerts: SocialAlertItem[];
}

export interface SocialEventImportRow {
  title: string;
  url?: string | null;
  summary?: string | null;
}

export interface SocialImportResult {
  inserted: number;
  skipped: number;
  errors: { line: number; title: string; reason: string }[];
}

export interface SocialPackageResult {
  filename: string;
  package_path: string;
  signed_url: string;
}

export interface UseSocialWorkspaceResult {
  data: SocialDeskData | null;
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  lastUpdatedAt: number | null;
  acting: string | null;
  health: SocialHealth | null;
  healthError: string | null;
  refresh: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  createEvent: (input: { title: string; url?: string; summary?: string }) => Promise<void>;
  importEvents: (rows: readonly SocialEventImportRow[]) => Promise<SocialImportResult>;
  generateNow: (eventId: string) => Promise<{ created: number; duplicate: boolean }>;
  review: (
    postId: string,
    decision: 'approve' | 'reject',
    options?: { scheduledAt?: string; reason?: string },
  ) => Promise<void>;
  markPublished: (postId: string, targetId?: string, url?: string) => Promise<void>;
  updatePost: (
    postId: string,
    patch: { title?: string; body_md?: string },
  ) => Promise<void>;
  updateTarget: (targetId: string, copyText: string) => Promise<void>;
  schedulePost: (postId: string, scheduledAt: string | null) => Promise<void>;
  buildPackage: (postId: string) => Promise<SocialPackageResult>;
}

const POLL_MS = 30_000;

export function useSocialWorkspace(): UseSocialWorkspaceResult {
  const [data, setData] = useState<SocialDeskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [health, setHealth] = useState<SocialHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const payload = await invokeContentFunction<unknown>('content-social', {
        action: 'list',
        post_limit: 300,
        event_limit: 200,
      });
      setData(normalizeSocialDeskData(payload));
      setError(null);
      setMissingSchema(false);
      setLastUpdatedAt(Date.now());
    } catch (thrown) {
      if (isContentSchemaMissing(thrown)) {
        setMissingSchema(true);
        setError(null);
      } else {
        // 保留上一次成功的資料，只顯示錯誤（輪詢失敗不該讓整頁變空）
        setError(contentErrorMessage(thrown));
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    inFlight.current = false;
    await load();
  }, [load]);

  const refreshHealth = useCallback(async () => {
    try {
      const payload = await invokeContentFunction<SocialHealth>('content-sources', {
        action: 'health',
      });
      setHealth(payload);
      setHealthError(null);
    } catch (thrown) {
      setHealthError(contentErrorMessage(thrown));
    }
  }, []);

  useEffect(() => {
    void load();
    void refreshHealth();
  }, [load, refreshHealth]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = useCallback(
    async <T,>(key: string, task: () => Promise<T>): Promise<T> => {
      setActing(key);
      try {
        return await task();
      } finally {
        setActing(null);
      }
    },
    [],
  );

  const createEvent = useCallback(
    async (input: { title: string; url?: string; summary?: string }) => {
      await run('create_event', async () => {
        await invokeContentFunction('content-social', {
          action: 'create_event',
          title: input.title,
          ...(input.url ? { url: input.url } : {}),
          ...(input.summary ? { summary: input.summary } : {}),
        });
        await refresh();
      });
    },
    [refresh, run],
  );

  const importEvents = useCallback(
    async (rows: readonly SocialEventImportRow[]) =>
      run('import_events', async () => {
        const result = await invokeContentFunction<SocialImportResult>('content-social', {
          action: 'import_events',
          events: rows,
        });
        await refresh();
        return result;
      }),
    [refresh, run],
  );

  const generateNow = useCallback(
    async (eventId: string) =>
      run(`generate_now:${eventId}`, async () => {
        const result = await invokeContentFunction<{
          posts?: unknown[];
          duplicate_of?: string;
        }>('content-social', {
          action: 'generate_now',
          event_id: eventId,
        });
        await refresh();
        return {
          created: Array.isArray(result?.posts) ? result.posts.length : 0,
          duplicate: Boolean(result?.duplicate_of),
        };
      }),
    [refresh, run],
  );

  const review = useCallback(
    async (
      postId: string,
      decision: 'approve' | 'reject',
      options?: { scheduledAt?: string; reason?: string },
    ) =>
      run(`review:${postId}`, async () => {
        await invokeContentFunction('content-social', {
          action: 'review',
          post_id: postId,
          decision,
          ...(options?.scheduledAt ? { scheduled_at: options.scheduledAt } : {}),
          ...(options?.reason ? { reason: options.reason } : {}),
        });
        await refresh();
      }),
    [refresh, run],
  );

  const markPublished = useCallback(
    async (postId: string, targetId?: string, url?: string) =>
      run(`mark:${postId}:${targetId ?? 'all'}`, async () => {
        await invokeContentFunction('content-social', {
          action: 'mark',
          post_id: postId,
          ...(targetId ? { target_id: targetId } : {}),
          ...(url ? { url } : {}),
        });
        await refresh();
      }),
    [refresh, run],
  );

  const updatePost = useCallback(
    async (postId: string, patch: { title?: string; body_md?: string }) =>
      run(`update_post:${postId}`, async () => {
        await invokeContentFunction('content-social', {
          action: 'update_post',
          post_id: postId,
          patch,
        });
        await refresh();
      }),
    [refresh, run],
  );

  const updateTarget = useCallback(
    async (targetId: string, copyText: string) =>
      run(`update_target:${targetId}`, async () => {
        await invokeContentFunction('content-social', {
          action: 'update_target',
          target_id: targetId,
          copy_text: copyText,
        });
        await refresh();
      }),
    [refresh, run],
  );

  const schedulePost = useCallback(
    async (postId: string, scheduledAt: string | null) =>
      run(`schedule:${postId}`, async () => {
        await invokeContentFunction('content-social', {
          action: 'schedule_post',
          post_id: postId,
          scheduled_at: scheduledAt,
        });
        await refresh();
      }),
    [refresh, run],
  );

  const buildPackage = useCallback(
    async (postId: string) =>
      run(`package:${postId}`, async () => {
        const result = await invokeContentFunction<SocialPackageResult>('content-social', {
          action: 'social_package',
          post_id: postId,
        });
        return result;
      }),
    [run],
  );

  return {
    data,
    loading,
    error,
    missingSchema,
    lastUpdatedAt,
    acting,
    health,
    healthError,
    refresh,
    refreshHealth,
    createEvent,
    importEvents,
    generateNow,
    review,
    markPublished,
    updatePost,
    updateTarget,
    schedulePost,
    buildPackage,
  };
}

/** 由 workspace 快照找出單一 post（studio 頁用） */
export function findSocialPost(
  data: SocialDeskData | null,
  postId: string | null,
): SocialDeskPost | null {
  if (!data || !postId) return null;
  return data.posts.find((post) => post.id === postId) ?? null;
}

/** 依平台分組 targets（同平台多帳號共用文案） */
export function groupTargetsByPlatform(
  targets: readonly SocialDeskTarget[],
): { platform: string; targets: SocialDeskTarget[]; copyText: string }[] {
  const map = new Map<string, SocialDeskTarget[]>();
  for (const target of targets) {
    const key = target.platform || 'other';
    const list = map.get(key) ?? [];
    list.push(target);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([platform, list]) => ({
      platform,
      targets: list,
      copyText: list[0]?.copy_text ?? '',
    }))
    .sort((left, right) => left.platform.localeCompare(right.platform));
}
