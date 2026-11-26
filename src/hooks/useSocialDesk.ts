/**
 * 社媒自動化營運 · 「今日工作」資料 hook
 *
 * 所有數字與卡片都來自 `content-social` Edge Function（前端不自己造統計）：
 *   - list          ：stats / events / posts / groups / accounts
 *   - create_event  ：貼上熱點 → 後端立即產出「1 篇長文 + 每平台每帳號一條導流」
 *   - generate_now  ：對既有熱點重跑生成
 *   - review        ：通過並排期 / 駁回（`decision`）
 *   - mark          ：標記已發（整批或單一帳號，可回填平台連結）
 *
 * 行為約定：
 *   - 首次載入 → loading（畫面顯示骨架）；之後的 refresh 與 20 秒 polling 一律靜默，
 *     不會把已經看到的內容閃回骨架。
 *   - 每 20 秒自動 refresh；頁面卸載即清除 timer。同一時間只允許一個 list 請求。
 *   - list 失敗 → 留在 `error`（畫面給可重試卡片）；mutation 失敗 → 往外拋，
 *     由頁面用 toast 顯示 contentErrorMessage，不把整頁打成錯誤狀態。
 *   - `isContentSchemaMissing` → `missingSchema=true`（畫面顯示「功能尚未啟用」）。
 *
 * 這是全插件唯一打 `content-social` 的地方；頁面只透過這個 hook 取資料。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  contentErrorMessage,
  invokeContentFunction,
  isContentSchemaMissing,
} from '@/lib/contentApi.ts';

/** Edge Function 名稱（前端不得直接 fetch，一律走 invokeContentFunction） */
const SOCIAL_FUNCTION = 'content-social';

/** 自動刷新間隔：後端每 2 分鐘掃描熱點，前端 20 秒抓一次才看得出「自動營運」 */
const POLL_INTERVAL_MS = 20_000;

// ============================================================
// 型別（形狀與 content-social 的 list 回應一致）
// ============================================================

export interface SocialDeskStats {
  /** 尚未產稿的熱點數 */
  openEvents: number;
  /** 待審批次（pending_review／changes_requested） */
  pendingReview: number;
  /** 待發佈批次（approved／scheduled／publishing） */
  readyToPublish: number;
  /** 今日已發批次數 */
  publishedToday: number;
  /** 啟用中的社群帳號數 */
  accounts: number;
  /** 品牌組數 */
  groups: number;
}

export interface SocialDeskEvent {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
  heat: number;
  /** manual｜rss｜csv｜hotlist：熱點來源 */
  source: string;
  status: string;
  created_at: string;
  /** 這個熱點已產出的批次數（0 = 還沒生成） */
  post_count: number;
}

export interface SocialDeskTarget {
  id: string;
  account_id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  copy_text: string;
  status: string;
  published_url: string | null;
  published_at: string | null;
}

export interface SocialDeskPost {
  id: string;
  event_id: string;
  group_id: string | null;
  group_name: string | null;
  event_title: string;
  title: string;
  body_md: string;
  status: string;
  scheduled_at: string | null;
  approved_at: string | null;
  created_at: string;
  /** template｜grok：這篇是 AI 生成還是模板草稿 */
  generator: string;
  targets: SocialDeskTarget[];
}

export interface SocialDeskGroup {
  id: string;
  name: string;
  account_count: number;
}

export interface SocialDeskAccount {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  login_status: string;
  archived: boolean;
}

export interface SocialDeskData {
  stats: SocialDeskStats;
  events: SocialDeskEvent[];
  posts: SocialDeskPost[];
  groups: SocialDeskGroup[];
  accounts: SocialDeskAccount[];
}

export interface SocialDeskCreateEventInput {
  title: string;
  url?: string;
  summary?: string;
}

export interface SocialDeskReviewOptions {
  /** UTC ISO；不給就由後端帶入下一個可用時段 */
  scheduledAt?: string;
  /** 駁回原因（後端會寫進函式紀錄，方便追查） */
  reason?: string;
}

export interface SocialDeskHook {
  data: SocialDeskData | null;
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  createEvent: (input: SocialDeskCreateEventInput) => Promise<void>;
  generateNow: (eventId: string) => Promise<void>;
  review: (
    postId: string,
    action: 'approve' | 'reject',
    options?: SocialDeskReviewOptions,
  ) => Promise<void>;
  markPublished: (postId: string, targetId?: string, url?: string) => Promise<void>;
  /** 正在執行的 mutation key（例如 `review:<postId>`）；null = 閒置 */
  acting: string | null;
  /** 最後一次成功同步的時間（毫秒），給「剛剛更新」用 */
  lastUpdatedAt: number | null;
}

// ============================================================
// 回應正規化（後端若少欄位也不讓畫面炸）
// ============================================================

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  const text = String(value);
  return text || fallback;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const text = typeof value === 'string' ? value : String(value);
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEvent(raw: unknown): SocialDeskEvent {
  const row = asRecord(raw);
  return {
    id: asString(row.id),
    title: asString(row.title),
    summary: asNullableString(row.summary),
    url: asNullableString(row.url),
    heat: asNumber(row.heat),
    source: asString(row.source, 'manual'),
    status: asString(row.status, 'open'),
    created_at: asString(row.created_at),
    post_count: asNumber(row.post_count),
  };
}

function normalizeTarget(raw: unknown): SocialDeskTarget {
  const row = asRecord(raw);
  return {
    id: asString(row.id),
    account_id: asString(row.account_id),
    platform: asString(row.platform, 'other'),
    handle: asString(row.handle),
    display_name: asNullableString(row.display_name),
    copy_text: asString(row.copy_text),
    status: asString(row.status, 'pending'),
    published_url: asNullableString(row.published_url),
    published_at: asNullableString(row.published_at),
  };
}

function normalizePost(raw: unknown): SocialDeskPost {
  const row = asRecord(raw);
  return {
    id: asString(row.id),
    event_id: asString(row.event_id),
    group_id: asNullableString(row.group_id),
    group_name: asNullableString(row.group_name),
    event_title: asString(row.event_title),
    title: asString(row.title),
    body_md: asString(row.body_md),
    status: asString(row.status, 'draft'),
    scheduled_at: asNullableString(row.scheduled_at),
    approved_at: asNullableString(row.approved_at),
    created_at: asString(row.created_at),
    generator: asString(row.generator, 'template'),
    targets: asArray(row.targets).map(normalizeTarget),
  };
}

function normalizeGroup(raw: unknown): SocialDeskGroup {
  const row = asRecord(raw);
  return {
    id: asString(row.id),
    name: asString(row.name),
    account_count: asNumber(row.account_count),
  };
}

function normalizeAccount(raw: unknown): SocialDeskAccount {
  const row = asRecord(raw);
  return {
    id: asString(row.id),
    platform: asString(row.platform, 'other'),
    handle: asString(row.handle),
    display_name: asNullableString(row.display_name),
    login_status: asString(row.login_status, 'unknown'),
    archived: row.archived === true,
  };
}

function normalizeStats(raw: unknown): SocialDeskStats {
  const row = asRecord(raw);
  return {
    openEvents: asNumber(row.openEvents),
    pendingReview: asNumber(row.pendingReview),
    readyToPublish: asNumber(row.readyToPublish),
    publishedToday: asNumber(row.publishedToday),
    accounts: asNumber(row.accounts),
    groups: asNumber(row.groups),
  };
}

export function normalizeSocialDeskData(payload: unknown): SocialDeskData {
  const root = asRecord(payload);
  return {
    stats: normalizeStats(root.stats),
    events: asArray(root.events).map(normalizeEvent),
    posts: asArray(root.posts).map(normalizePost),
    groups: asArray(root.groups).map(normalizeGroup),
    accounts: asArray(root.accounts).map(normalizeAccount),
  };
}

// ============================================================
// Hook
// ============================================================

export function useSocialDesk(): SocialDeskHook {
  const [data, setData] = useState<SocialDeskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** 抓一次 list；失敗留在頁面 error（mutation 也用同一支確保畫面同步） */
  const loadData = useCallback(async () => {
    try {
      const payload = await invokeContentFunction<unknown>(SOCIAL_FUNCTION, {
        action: 'list',
        post_limit: 300,
        event_limit: 200,
      });
      if (!mountedRef.current) return;
      setData(normalizeSocialDeskData(payload));
      setError(null);
      setMissingSchema(false);
      setLastUpdatedAt(Date.now());
    } catch (loadError) {
      if (!mountedRef.current) return;
      if (isContentSchemaMissing(loadError)) {
        setMissingSchema(true);
        setError(null);
        setData(null);
      } else {
        setError(contentErrorMessage(loadError));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  /** 對外 refresh：靜默（不開骨架），並避免 polling 與手動刷新同時打 API */
  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await loadData();
    } finally {
      inFlightRef.current = false;
    }
  }, [loadData]);

  // 首次載入 + 20 秒自動刷新（卸載清除）
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  /**
   * 執行 mutation：設 acting → 呼叫函式 → 重抓 list。
   * 失敗會把 schema 缺失記到 missingSchema，再把錯誤往外拋給頁面 toast。
   * 回傳原始 data，讓呼叫端可以判斷「有沒有真的產出東西」。
   */
  const runMutation = useCallback(
    async (key: string, body: JsonRecord): Promise<unknown> => {
      setActing(key);
      try {
        const payload = await invokeContentFunction<unknown>(SOCIAL_FUNCTION, body);
        await loadData();
        return payload;
      } catch (mutationError) {
        if (isContentSchemaMissing(mutationError)) {
          setMissingSchema(true);
          setError(null);
        }
        throw mutationError;
      } finally {
        if (mountedRef.current) setActing(null);
      }
    },
    [loadData],
  );

  const createEvent = useCallback(
    async (input: SocialDeskCreateEventInput) => {
      const title = (input.title || '').trim();
      if (!title) throw new Error('請輸入熱點標題');
      const url = (input.url || '').trim();
      const summary = (input.summary || '').trim();
      await runMutation('create_event', {
        action: 'create_event',
        title,
        ...(url ? { url } : {}),
        ...(summary ? { summary } : {}),
      });
    },
    [runMutation],
  );

  const generateNow = useCallback(
    async (eventId: string) => {
      if (!eventId) return;
      const payload = await runMutation(`generate_now:${eventId}`, {
        action: 'generate_now',
        event_id: eventId,
      });
      const result = payload as { posts?: unknown; duplicate_of?: string } | null;
      const created = Array.isArray(result?.posts) ? (result!.posts as unknown[]).length : 0;
      if (created > 0) return;
      // 已被判定為同一件事 → 併進既有熱點、只補導流；這是正確結果，不是失敗
      if (result?.duplicate_of) return;
      // 後端只回「本次新建」的稿件：0 筆代表這個熱點沒有可用帳號，說真話比假成功好
      throw new Error('這個熱點沒有可產稿的品牌組或帳號，請先建立帳號後再生成');
    },
    [runMutation],
  );

  const review = useCallback(
    async (
      postId: string,
      action: 'approve' | 'reject',
      options?: SocialDeskReviewOptions,
    ) => {
      if (!postId) return;
      const scheduledAt = (options?.scheduledAt || '').trim();
      const reason = (options?.reason || '').trim();
      // 契約原文的內層 key 也叫 action，與外層路由 action 撞名，
      // 與 content-social 對齊後改用 decision（見回報）。
      await runMutation(`review:${postId}`, {
        action: 'review',
        post_id: postId,
        decision: action,
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
        ...(reason ? { reason } : {}),
      });
    },
    [runMutation],
  );

  const markPublished = useCallback(
    async (postId: string, targetId?: string, url?: string) => {
      if (!postId) return;
      const target = (targetId || '').trim();
      const link = (url || '').trim();
      await runMutation(`mark:${postId}${target ? `:${target}` : ''}`, {
        action: 'mark',
        post_id: postId,
        ...(target ? { target_id: target } : {}),
        ...(link ? { url: link } : {}),
      });
    },
    [runMutation],
  );

  return {
    data,
    loading,
    error,
    missingSchema,
    refresh,
    createEvent,
    generateNow,
    review,
    markPublished,
    acting,
    lastUpdatedAt,
  };
}
