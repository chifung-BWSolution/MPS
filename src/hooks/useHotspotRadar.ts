/**
 * 熱點雷達 · 前端資料 hook（PRD §8）
 *
 * 卡片的關鍵路徑只有 `hotspot_feed` 的第一頁（30 筆，排序在資料庫完成）。
 * 收藏列已左連在 view 裡，不必再等另一張表。
 * 設定、抓取紀錄、監測目標、頁籤計數並行載入，不擋住卡片。
 *
 * 資料表或 view 未建立（42P01／PGRST205）時 `missingSchema = true`。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  contentErrorMessage,
  invokeContentFunction,
  isContentApiError,
  isContentSchemaMissing,
} from '@/lib/contentApi';
import {
  feedItemVisible,
  feedOrFilter,
  hotspotFeedOrder,
  HOTSPOT_PAGE_SIZE,
  sanitizeHotspotFilters,
  type HotspotFeedCounts,
  type HotspotFilters,
  type HotspotSourceTab,
} from '@/lib/hotspotFeed';
import { toFiniteNumber } from '@/lib/hotspotRadar';
import type {
  HotspotDailyStatus,
  HotspotFavoriteRow,
  HotspotFavoriteStatus,
  HotspotFeedItem,
  HotspotItemRow,
  HotspotKind,
  HotspotPlatform,
  HotspotRunRow,
  HotspotSettings,
  HotspotSettingsResponse,
  HotspotTargetInput,
  HotspotTargetResponse,
  HotspotTargetRow,
  HotspotUsage,
} from '@/types/hotspotRadar';

export const ITEM_COLUMNS =
  'id,platform,source_kind,target_id,external_id,url,media_type,caption,thumbnail_url,author_handle,author_name,author_followers,posted_at,likes,comments,plays,engagement,account_median_engagement,relative_heat,sample_size,low_sample,ad_started_at,ad_active_days,ad_status,first_seen_at,last_seen_at,captured_at,raw';
const FEED_COLUMNS =
  `${ITEM_COLUMNS},favorite_id,favorite_status,favorite_note,favorite_created_by,favorite_created_at,favorite_updated_at`;
export const TARGET_COLUMNS =
  'id,kind,platform,value,value_normalized,label,brand_id,active,notes,last_fetched_at,last_error,created_by,created_at,updated_at';
export const RUN_COLUMNS =
  'id,trigger,status,targets_fetched,items_new,items_upserted,api_calls,cost_usd,error_message,meta,started_at,finished_at';

const COUNT_TABS: readonly HotspotSourceTab[] = ['all', 'account', 'hashtag', 'ad_keyword', 'library'];

interface FeedFilterBuilder {
  eq(column: string, value: string): FeedFilterBuilder;
  is(column: string, value: null): FeedFilterBuilder;
  not(column: string, operator: 'is', value: null): FeedFilterBuilder;
  or(filters: string): FeedFilterBuilder;
  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean }): FeedFilterBuilder;
  range(from: number, to: number): FeedFilterBuilder;
  then<TResult1 = { data: unknown[] | null; error: { code?: string; message?: string } | null; count: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[] | null; error: { code?: string; message?: string } | null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}

function applyFeedFilters(query: FeedFilterBuilder, filters: HotspotFilters, now: number): FeedFilterBuilder {
  let next = query;
  if (filters.source === 'library') {
    next = next.not('favorite_id', 'is', null);
  } else if (filters.source !== 'all') {
    next = next.eq('source_kind', filters.source);
  }
  if (filters.source !== 'library' && filters.onlyUnfavorited) {
    next = next.is('favorite_id', null);
  }
  if (filters.platform !== 'all') next = next.eq('platform', filters.platform);
  if (filters.media !== 'all') next = next.eq('media_type', filters.media);
  return next.or(feedOrFilter(filters, now));
}

function orderedFeed(filters: HotspotFilters, now: number): FeedFilterBuilder {
  let query = applyFeedFilters(
    supabase.from('hotspot_feed').select(FEED_COLUMNS) as unknown as FeedFilterBuilder,
    filters,
    now,
  );
  for (const order of hotspotFeedOrder(filters.sort)) {
    query = query.order(order.column, {
      ascending: order.ascending,
      ...(order.nullsFirst === false ? { nullsFirst: false } : {}),
    });
  }
  return query;
}

async function fetchFeedPage(filters: HotspotFilters, offset: number, now: number): Promise<HotspotFeedItem[]> {
  const { data, error } = await orderedFeed(filters, now).range(offset, offset + HOTSPOT_PAGE_SIZE - 1);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapFeedRow);
}

async function fetchFeedCounts(filters: HotspotFilters, now: number): Promise<HotspotFeedCounts> {
  const entries = await Promise.all(
    COUNT_TABS.map(async (source) => {
      const query = applyFeedFilters(
        supabase.from('hotspot_feed').select('id', { count: 'exact', head: true }) as unknown as FeedFilterBuilder,
        { ...filters, source },
        now,
      );
      const { count, error } = await query;
      if (error) throw error;
      return [source, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as HotspotFeedCounts;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapItem(row: Record<string, unknown>): HotspotItemRow {
  return {
    id: String(row.id),
    platform: (row.platform === 'facebook' ? 'facebook' : 'instagram') as HotspotPlatform,
    source_kind: (row.source_kind === 'hashtag' || row.source_kind === 'ad_keyword'
      ? row.source_kind
      : 'account') as HotspotKind,
    target_id: row.target_id == null ? null : String(row.target_id),
    external_id: String(row.external_id ?? ''),
    url: String(row.url ?? ''),
    media_type: (row.media_type ?? 'unknown') as HotspotItemRow['media_type'],
    caption: row.caption == null ? null : String(row.caption),
    thumbnail_url: row.thumbnail_url == null ? null : String(row.thumbnail_url),
    author_handle: row.author_handle == null ? null : String(row.author_handle),
    author_name: row.author_name == null ? null : String(row.author_name),
    author_followers: toNullableNumber(row.author_followers),
    posted_at: row.posted_at == null ? null : String(row.posted_at),
    likes: toFiniteNumber(row.likes),
    comments: toFiniteNumber(row.comments),
    plays: toNullableNumber(row.plays),
    engagement: toFiniteNumber(row.engagement),
    account_median_engagement: toNullableNumber(row.account_median_engagement),
    relative_heat: toNullableNumber(row.relative_heat),
    sample_size: toFiniteNumber(row.sample_size),
    low_sample: row.low_sample === true,
    ad_started_at: row.ad_started_at == null ? null : String(row.ad_started_at),
    ad_active_days: toNullableNumber(row.ad_active_days),
    ad_status: row.ad_status == null ? null : String(row.ad_status),
    first_seen_at: String(row.first_seen_at ?? ''),
    last_seen_at: String(row.last_seen_at ?? ''),
    captured_at: String(row.captured_at ?? ''),
    raw: (row.raw as Record<string, unknown> | null) ?? null,
  };
}

function mapFavorite(row: Record<string, unknown>): HotspotFavoriteRow {
  const status = row.status === 'used' || row.status === 'dropped' ? row.status : 'saved';
  return {
    id: String(row.id),
    item_id: String(row.item_id),
    status: status as HotspotFavoriteStatus,
    note: row.note == null ? null : String(row.note),
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function mapFeedRow(row: Record<string, unknown>): HotspotFeedItem {
  const item = mapItem(row);
  if (row.favorite_id == null) return { ...item, favorite: null };
  return {
    ...item,
    favorite: mapFavorite({
      id: row.favorite_id,
      item_id: item.id,
      status: row.favorite_status,
      note: row.favorite_note,
      created_by: row.favorite_created_by,
      created_at: row.favorite_created_at,
      updated_at: row.favorite_updated_at,
    }),
  };
}

function mapTarget(row: Record<string, unknown>): HotspotTargetRow {
  return {
    id: String(row.id),
    kind: (row.kind === 'hashtag' || row.kind === 'ad_keyword' ? row.kind : 'account') as HotspotKind,
    platform: (row.platform === 'facebook' ? 'facebook' : 'instagram') as HotspotPlatform,
    value: String(row.value ?? ''),
    value_normalized: String(row.value_normalized ?? ''),
    label: row.label == null ? null : String(row.label),
    brand_id: row.brand_id == null ? null : String(row.brand_id),
    active: row.active !== false,
    notes: row.notes == null ? null : String(row.notes),
    last_fetched_at: row.last_fetched_at == null ? null : String(row.last_fetched_at),
    last_error: row.last_error == null ? null : String(row.last_error),
    created_by: row.created_by == null ? null : String(row.created_by),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function mapRun(row: Record<string, unknown>): HotspotRunRow {
  const status =
    row.status === 'success' || row.status === 'error' ? row.status : ('running' as const);
  return {
    id: String(row.id),
    trigger: row.trigger === 'cron' ? 'cron' : 'manual',
    status,
    targets_fetched: toFiniteNumber(row.targets_fetched),
    items_new: toFiniteNumber(row.items_new),
    items_upserted: toFiniteNumber(row.items_upserted),
    api_calls: toFiniteNumber(row.api_calls),
    cost_usd: toFiniteNumber(row.cost_usd),
    error_message: row.error_message == null ? null : String(row.error_message),
    meta: (row.meta as Record<string, unknown> | null) ?? null,
    started_at: String(row.started_at ?? ''),
    finished_at: row.finished_at == null ? null : String(row.finished_at),
  };
}

function mapDaily(value: unknown): HotspotDailyStatus | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return {
    enabled: row.enabled === true,
    schedule: row.schedule == null ? null : String(row.schedule),
    jobname: row.jobname == null ? null : String(row.jobname),
  };
}

export interface HotspotActions {
  scan: (targetIds?: string[]) => Promise<boolean>;
  scanAll: () => Promise<boolean>;
  favorite: (itemId: string, status: HotspotFavoriteStatus, note?: string | null) => Promise<void>;
  unfavorite: (itemId: string) => Promise<void>;
  saveSettings: (patch: Partial<Pick<HotspotSettings, 'auto_daily' | 'monthly_budget_usd' | 'items_per_target'>>) => Promise<void>;
  setDaily: (enabled: boolean) => Promise<void>;
  createTarget: (input: HotspotTargetInput) => Promise<void>;
  updateTarget: (id: string, patch: Partial<HotspotTargetInput>) => Promise<void>;
  deleteTarget: (id: string) => Promise<void>;
  testTarget: (kind: HotspotKind, value: string) => Promise<{ valid: boolean; preview_count: number; cost_usd: number }>;
}

export function useHotspotRadar(filters: HotspotFilters): {
  items: HotspotFeedItem[];
  counts: HotspotFeedCounts | null;
  targets: HotspotTargetRow[];
  runs: HotspotRunRow[];
  settings: HotspotSettings | null;
  usage: HotspotUsage | null;
  daily: HotspotDailyStatus | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  targetsLoaded: boolean;
  runsLoaded: boolean;
  dailyLoaded: boolean;
  error: string | null;
  missingSchema: boolean;
  scanning: boolean;
  scanningAll: boolean;
  saving: boolean;
  warnings: string[];
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  actions: HotspotActions;
} {
  const [rawItems, setRawItems] = useState<HotspotFeedItem[]>([]);
  const [counts, setCounts] = useState<HotspotFeedCounts | null>(null);
  const [targets, setTargets] = useState<HotspotTargetRow[]>([]);
  const [runs, setRuns] = useState<HotspotRunRow[]>([]);
  const [settings, setSettings] = useState<HotspotSettings | null>(null);
  const [usage, setUsage] = useState<HotspotUsage | null>(null);
  const [daily, setDailyStatus] = useState<HotspotDailyStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [targetsLoaded, setTargetsLoaded] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [dailyLoaded, setDailyLoaded] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [chromeError, setChromeError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningAll, setScanningAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const safeFilters = useMemo(() => sanitizeHotspotFilters(filters), [filters]);
  const mountedRef = useRef(true);
  const filtersRef = useRef(safeFilters);
  filtersRef.current = safeFilters;
  /** 第一頁序號。篩選一變就遞增，在途的翻頁與計數全部作廢。 */
  const feedSeqRef = useRef(0);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const loadTokenRef = useRef(0);
  /** 同一輪列表（含下拉）共用一個時間窗，避免頁面和計數在邊界上各算一次 now。 */
  const windowRef = useRef(Date.now());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyPage = useCallback((rows: HotspotFeedItem[], offset: number, append: boolean) => {
    offsetRef.current = offset + rows.length;
    const more = rows.length === HOTSPOT_PAGE_SIZE;
    hasMoreRef.current = more;
    setHasMore(more);
    setRawItems((current) => {
      if (!append) return rows;
      const seen = new Set(current.map((item) => item.id));
      const fresh = rows.filter((item) => !seen.has(item.id));
      return fresh.length === 0 ? current : [...current, ...fresh];
    });
  }, []);

  const loadCounts = useCallback((seq: number, active: HotspotFilters, now: number) => {
    void fetchFeedCounts(active, now)
      .then((next) => {
        if (!mountedRef.current || seq !== feedSeqRef.current) return;
        setCounts(next);
      })
      .catch((thrown: unknown) => {
        if (!mountedRef.current || seq !== feedSeqRef.current) return;
        if (isContentSchemaMissing(thrown)) return;
        setChromeError(contentErrorMessage(thrown));
      });
  }, []);

  const loadFirstPage = useCallback(async (keepVisible: boolean) => {
    const seq = feedSeqRef.current + 1;
    feedSeqRef.current = seq;
    loadTokenRef.current += 1;
    loadingMoreRef.current = false;
    offsetRef.current = 0;
    hasMoreRef.current = false;
    setHasMore(false);
    setLoadingMore(false);
    setFeedError(null);
    if (!keepVisible) {
      setRawItems([]);
      setCounts(null);
    }
    setLoading(true);

    const active = filtersRef.current;
    const now = Date.now();
    windowRef.current = now;
    loadCounts(seq, active, now);
    try {
      const rows = await fetchFeedPage(active, 0, now);
      if (!mountedRef.current || seq !== feedSeqRef.current) return;
      setMissingSchema(false);
      applyPage(rows, 0, false);
    } catch (thrown) {
      if (!mountedRef.current || seq !== feedSeqRef.current) return;
      if (isContentSchemaMissing(thrown)) {
        setMissingSchema(true);
        setFeedError(null);
      } else {
        setFeedError(contentErrorMessage(thrown));
      }
    } finally {
      if (mountedRef.current && seq === feedSeqRef.current) setLoading(false);
    }
  }, [applyPage, loadCounts]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const seq = feedSeqRef.current;
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    const offset = offsetRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const rows = await fetchFeedPage(filtersRef.current, offset, windowRef.current);
      if (!mountedRef.current || seq !== feedSeqRef.current || token !== loadTokenRef.current) return;
      applyPage(rows, offset, true);
    } catch (thrown) {
      if (!mountedRef.current || seq !== feedSeqRef.current || token !== loadTokenRef.current) return;
      if (!isContentSchemaMissing(thrown)) setFeedError(contentErrorMessage(thrown));
    } finally {
      if (token === loadTokenRef.current) {
        loadingMoreRef.current = false;
        if (mountedRef.current) setLoadingMore(false);
      }
    }
  }, [applyPage]);

  const reloadTargets = useCallback(async () => {
    const { data, error } = await supabase
      .from('hotspot_targets')
      .select(TARGET_COLUMNS)
      .order('created_at', { ascending: true });
    if (!mountedRef.current) return;
    if (error) {
      if (!isContentSchemaMissing(error)) setChromeError(contentErrorMessage(error));
      setTargetsLoaded(true);
      return;
    }
    setTargets(((data ?? []) as Record<string, unknown>[]).map(mapTarget));
    setTargetsLoaded(true);
  }, []);

  const reloadRuns = useCallback(async () => {
    const { data, error } = await supabase
      .from('hotspot_runs')
      .select(RUN_COLUMNS)
      .order('started_at', { ascending: false })
      .limit(30);
    if (!mountedRef.current) return;
    if (error) {
      if (!isContentSchemaMissing(error)) setChromeError(contentErrorMessage(error));
      setRunsLoaded(true);
      return;
    }
    setRuns(((data ?? []) as Record<string, unknown>[]).map(mapRun));
    setRunsLoaded(true);
  }, []);

  const reloadSettings = useCallback(async () => {
    try {
      const payload = await invokeContentFunction<HotspotSettingsResponse>('hotspot-radar', {
        action: 'settings',
      });
      if (!mountedRef.current) return;
      setSettings(payload.settings);
      setUsage(payload.usage);
      setDailyStatus(payload.daily ?? null);
      setDailyLoaded(true);
    } catch (thrown) {
      if (!mountedRef.current) return;
      if (isContentSchemaMissing(thrown)) return;
      setChromeError(contentErrorMessage(thrown));
    }
  }, []);

  const loadChrome = useCallback(async () => {
    setChromeError(null);
    await Promise.all([reloadTargets(), reloadRuns(), reloadSettings()]);
  }, [reloadRuns, reloadSettings, reloadTargets]);

  useEffect(() => {
    void loadFirstPage(false);
  }, [safeFilters, loadFirstPage]);

  useEffect(() => {
    void loadChrome();
  }, [loadChrome]);

  const refresh = useCallback(async () => {
    await Promise.all([loadFirstPage(true), loadChrome()]);
  }, [loadChrome, loadFirstPage]);

  const handleActionError = useCallback((thrown: unknown) => {
    setFeedError(contentErrorMessage(thrown));
  }, []);

  const patchFavorite = useCallback((itemId: string, favorite: HotspotFavoriteRow | null) => {
    const active = filtersRef.current;
    setRawItems((current) =>
      current.flatMap((item) => {
        if (item.id !== itemId) return [item];
        const next = { ...item, favorite };
        return feedItemVisible(next, active, windowRef.current) ? [next] : [];
      }),
    );
    loadCounts(feedSeqRef.current, active, windowRef.current);
  }, [loadCounts]);

  const scan = useCallback(
    async (targetIds?: string[]): Promise<boolean> => {
      setScanning(true);
      setFeedError(null);
      setWarnings([]);
      try {
        const response = await invokeContentFunction<{
          items_new: number;
          items_upserted: number;
          targets_fetched: number;
          warnings: string[];
        }>('hotspot-radar', {
          action: 'scan',
          ...(targetIds && targetIds.length > 0 ? { target_ids: targetIds } : {}),
        });
        if (mountedRef.current) setWarnings(response.warnings ?? []);
        await Promise.all([loadFirstPage(true), reloadRuns()]);
        return true;
      } catch (thrown) {
        handleActionError(thrown);
        return false;
      } finally {
        if (mountedRef.current) setScanning(false);
      }
    },
    [handleActionError, loadFirstPage, reloadRuns],
  );

  const scanAll = useCallback(async (): Promise<boolean> => {
    setScanningAll(true);
    setFeedError(null);
    setWarnings([]);
    try {
      const response = await invokeContentFunction<{ warnings: string[] }>('hotspot-radar', {
        action: 'scan_all',
      });
      if (mountedRef.current) setWarnings(response.warnings ?? []);
      await Promise.all([loadFirstPage(true), reloadRuns()]);
      return true;
    } catch (thrown) {
      handleActionError(thrown);
      return false;
    } finally {
      if (mountedRef.current) setScanningAll(false);
    }
  }, [handleActionError, loadFirstPage, reloadRuns]);

  const favorite = useCallback(
    async (itemId: string, status: HotspotFavoriteStatus, note?: string | null) => {
      setSaving(true);
      try {
        const response = await invokeContentFunction<{ favorite: Record<string, unknown> }>('hotspot-radar', {
          action: 'favorite',
          item_id: itemId,
          status,
          ...(note === undefined ? {} : { note }),
        });
        if (mountedRef.current) patchFavorite(itemId, mapFavorite(response.favorite));
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, patchFavorite],
  );

  const unfavorite = useCallback(
    async (itemId: string) => {
      setSaving(true);
      try {
        await invokeContentFunction('hotspot-radar', { action: 'unfavorite', item_id: itemId });
        if (mountedRef.current) patchFavorite(itemId, null);
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, patchFavorite],
  );

  const saveSettings = useCallback(
    async (
      patch: Partial<
        Pick<HotspotSettings, 'auto_daily' | 'monthly_budget_usd' | 'items_per_target'>
      >,
    ) => {
      setSaving(true);
      try {
        const payload = await invokeContentFunction<HotspotSettingsResponse>('hotspot-radar', {
          action: 'update_settings',
          ...patch,
        });
        if (mountedRef.current) {
          setSettings(payload.settings);
          setUsage(payload.usage);
          setDailyStatus(payload.daily ?? null);
          setDailyLoaded(true);
        }
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError],
  );

  const setDaily = useCallback(
    async (enabled: boolean) => {
      setSaving(true);
      try {
        const payload = await invokeContentFunction<HotspotSettingsResponse>('hotspot-radar', {
          action: 'update_settings',
          auto_daily: enabled,
        });
        if (mountedRef.current) {
          setSettings(payload.settings);
          setUsage(payload.usage);
          setDailyStatus(payload.daily ?? null);
          setDailyLoaded(true);
        }
        try {
          const toggled = await invokeContentFunction<{ daily: unknown }>('hotspot-radar', {
            action: 'set_daily',
            enabled,
          });
          const nextDaily = mapDaily(toggled.daily);
          if (mountedRef.current && nextDaily) setDailyStatus(nextDaily);
        } catch (thrown) {
          if (!isContentApiError(thrown) || thrown.code !== 'job_missing') throw thrown;
        }
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError],
  );

  const createTarget = useCallback(
    async (input: HotspotTargetInput) => {
      setSaving(true);
      try {
        await invokeContentFunction<HotspotTargetResponse>('hotspot-radar', {
          action: 'create_target',
          ...input,
        });
        await reloadTargets();
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, reloadTargets],
  );

  const updateTarget = useCallback(
    async (id: string, patch: Partial<HotspotTargetInput>) => {
      setSaving(true);
      try {
        await invokeContentFunction<HotspotTargetResponse>('hotspot-radar', {
          action: 'update_target',
          id,
          ...patch,
        });
        await reloadTargets();
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, reloadTargets],
  );

  const deleteTarget = useCallback(
    async (id: string) => {
      setSaving(true);
      try {
        await invokeContentFunction('hotspot-radar', { action: 'delete_target', id });
        await reloadTargets();
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, reloadTargets],
  );

  const testTarget = useCallback(
    async (kind: HotspotKind, value: string) => {
      return invokeContentFunction<{
        valid: boolean;
        preview_count: number;
        cost_usd: number;
      }>('hotspot-radar', { action: 'test_target', kind, value });
    },
    [],
  );

  const actions = useMemo<HotspotActions>(
    () => ({
      scan,
      scanAll,
      favorite,
      unfavorite,
      saveSettings,
      setDaily,
      createTarget,
      updateTarget,
      deleteTarget,
      testTarget,
    }),
    [createTarget, deleteTarget, favorite, saveSettings, scan, scanAll, setDaily, testTarget, unfavorite, updateTarget],
  );

  return {
    items: rawItems,
    counts,
    targets,
    runs,
    settings,
    usage,
    daily,
    loading,
    loadingMore,
    hasMore,
    targetsLoaded,
    runsLoaded,
    dailyLoaded,
    error: feedError ?? chromeError,
    missingSchema,
    scanning,
    scanningAll,
    saving,
    warnings,
    refresh,
    loadMore,
    actions,
  };
}
