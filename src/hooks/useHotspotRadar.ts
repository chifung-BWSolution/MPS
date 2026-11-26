/**
 * 熱點雷達 · 前端資料 hook（PRD §8）
 *
 * 兩條通道：
 *   1. supabase-js 直連（RLS 只有 SELECT）→ 讀 items / favorites / targets / runs
 *   2. Edge Function `hotspot-radar` → 抓取、收藏、設定、目標 CRUD（需要重算權限）
 *
 * 資料表未建立（42P01／PGRST205）時 `missingSchema = true`，頁面顯示
 * 「功能尚未啟用」，不拋錯、不白屏。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  contentErrorMessage,
  invokeContentFunction,
  isContentApiError,
  isContentSchemaMissing,
} from '@/lib/contentApi';
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
export const TARGET_COLUMNS =
  'id,kind,platform,value,value_normalized,label,brand_id,active,notes,last_fetched_at,last_error,created_by,created_at,updated_at';
export const FAVORITE_COLUMNS =
  'id,item_id,status,note,created_by,created_at,updated_at';
export const RUN_COLUMNS =
  'id,trigger,status,targets_fetched,items_new,items_upserted,api_calls,cost_usd,error_message,meta,started_at,finished_at';

/** 一次最多讀幾則（每次抓取累積，保留近期 500 則在記憶體已經足夠） */
const ITEM_LIMIT = 500;
const FAVORITE_LIMIT = 500;
const RUN_LIMIT = 30;

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

export function useHotspotRadar(): {
  items: HotspotFeedItem[];
  targets: HotspotTargetRow[];
  runs: HotspotRunRow[];
  settings: HotspotSettings | null;
  usage: HotspotUsage | null;
  daily: HotspotDailyStatus | null;
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  scanning: boolean;
  scanningAll: boolean;
  saving: boolean;
  warnings: string[];
  refresh: () => Promise<void>;
  actions: HotspotActions;
} {
  const [rawItems, setRawItems] = useState<HotspotItemRow[]>([]);
  const [favorites, setFavorites] = useState<HotspotFavoriteRow[]>([]);
  const [targets, setTargets] = useState<HotspotTargetRow[]>([]);
  const [runs, setRuns] = useState<HotspotRunRow[]>([]);
  const [settings, setSettings] = useState<HotspotSettings | null>(null);
  const [usage, setUsage] = useState<HotspotUsage | null>(null);
  const [daily, setDailyStatus] = useState<HotspotDailyStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningAll, setScanningAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const mountedRef = useRef(true);
  /** 每次 refresh 遞增；回應回來時若不等于最新序號就丟棄（避免慢請求覆蓋新資料） */
  const refreshSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const seq = refreshSeqRef.current + 1;
    refreshSeqRef.current = seq;
    setLoading(true);
    try {
      const [itemResult, favoriteResult, targetResult, runResult] = await Promise.all([
        supabase
          .from('hotspot_items')
          .select(ITEM_COLUMNS)
          .order('posted_at', { ascending: false, nullsFirst: false })
          .limit(ITEM_LIMIT),
        supabase.from('hotspot_favorites').select(FAVORITE_COLUMNS).limit(FAVORITE_LIMIT),
        supabase
          .from('hotspot_targets')
          .select(TARGET_COLUMNS)
          .order('created_at', { ascending: true }),
        supabase
          .from('hotspot_runs')
          .select(RUN_COLUMNS)
          .order('started_at', { ascending: false })
          .limit(RUN_LIMIT),
      ]);

      if (seq !== refreshSeqRef.current) return;

      for (const result of [itemResult, favoriteResult, targetResult, runResult]) {
        if (result.error) {
          if (isContentSchemaMissing(result.error)) {
            if (mountedRef.current) {
              setMissingSchema(true);
              setError(null);
            }
            return;
          }
          throw result.error;
        }
      }

      // 設定與用量一定要經 Edge Function（每日開關狀態走 service_role RPC）
      let settingsPayload: HotspotSettingsResponse | null = null;
      try {
        settingsPayload = await invokeContentFunction<HotspotSettingsResponse>('hotspot-radar', {
          action: 'settings',
        });
      } catch (settingsError) {
        if (seq !== refreshSeqRef.current) return;
        if (isContentSchemaMissing(settingsError)) {
          if (mountedRef.current) {
            setMissingSchema(true);
            setError(null);
          }
          return;
        }
        // 設定讀不到不應該讓整個列表消失，記在 error 但仍顯示資料
        if (mountedRef.current) setError(contentErrorMessage(settingsError));
      }

      if (!mountedRef.current || seq !== refreshSeqRef.current) return;

      setMissingSchema(false);
      setRawItems(((itemResult.data ?? []) as Record<string, unknown>[]).map(mapItem));
      setFavorites(((favoriteResult.data ?? []) as Record<string, unknown>[]).map(mapFavorite));
      setTargets(((targetResult.data ?? []) as Record<string, unknown>[]).map(mapTarget));
      setRuns(((runResult.data ?? []) as Record<string, unknown>[]).map(mapRun));

      if (settingsPayload) {
        setSettings(settingsPayload.settings);
        setUsage(settingsPayload.usage);
        setDailyStatus(settingsPayload.daily ?? null);
      }
    } catch (thrown) {
      if (!mountedRef.current) return;
      if (isContentSchemaMissing(thrown)) {
        setMissingSchema(true);
        setError(null);
      } else {
        setError(contentErrorMessage(thrown));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** 處理 Edge Function 錯誤：把 budget／provider 類錯誤轉成可讀訊息 */
  const handleActionError = useCallback((thrown: unknown) => {
    setError(contentErrorMessage(thrown));
  }, []);

  const scan = useCallback(
    async (targetIds?: string[]): Promise<boolean> => {
      setScanning(true);
      setError(null);
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
        await refresh();
        return true;
      } catch (thrown) {
        handleActionError(thrown);
        return false;
      } finally {
        if (mountedRef.current) setScanning(false);
      }
    },
    [handleActionError, refresh],
  );

  const scanAll = useCallback(async (): Promise<boolean> => {
    setScanningAll(true);
    setError(null);
    setWarnings([]);
    try {
      const response = await invokeContentFunction<{ warnings: string[] }>('hotspot-radar', {
        action: 'scan_all',
      });
      if (mountedRef.current) setWarnings(response.warnings ?? []);
      await refresh();
      return true;
    } catch (thrown) {
      handleActionError(thrown);
      return false;
    } finally {
      if (mountedRef.current) setScanningAll(false);
    }
  }, [handleActionError, refresh]);

  const favorite = useCallback(
    async (itemId: string, status: HotspotFavoriteStatus, note?: string | null) => {
      setSaving(true);
      try {
        await invokeContentFunction('hotspot-radar', {
          action: 'favorite',
          item_id: itemId,
          status,
          ...(note === undefined ? {} : { note }),
        });
        await refresh();
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, refresh],
  );

  const unfavorite = useCallback(
    async (itemId: string) => {
      setSaving(true);
      try {
        await invokeContentFunction('hotspot-radar', { action: 'unfavorite', item_id: itemId });
        await refresh();
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, refresh],
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
        // 兩件事要一起做：① 設定頁的開關（cron_scan 會讀它）② cron job 的 active
        // 若 cron migration 尚未套用，②會回 job_missing；此時①仍然有效，不應讓整個操作失敗。
        await invokeContentFunction<HotspotSettingsResponse>('hotspot-radar', {
          action: 'update_settings',
          auto_daily: enabled,
        });
        try {
          await invokeContentFunction('hotspot-radar', { action: 'set_daily', enabled });
        } catch (thrown) {
          if (!isContentApiError(thrown) || thrown.code !== 'job_missing') throw thrown;
        }
        await refresh();
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, refresh],
  );

  const createTarget = useCallback(
    async (input: HotspotTargetInput) => {
      setSaving(true);
      try {
        await invokeContentFunction<HotspotTargetResponse>('hotspot-radar', {
          action: 'create_target',
          ...input,
        });
        await refresh();
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, refresh],
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
        await refresh();
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, refresh],
  );

  const deleteTarget = useCallback(
    async (id: string) => {
      setSaving(true);
      try {
        await invokeContentFunction('hotspot-radar', { action: 'delete_target', id });
        await refresh();
      } catch (thrown) {
        handleActionError(thrown);
        throw thrown;
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [handleActionError, refresh],
  );

  const testTarget = useCallback(
    async (kind: HotspotKind, value: string) => {
      const response = await invokeContentFunction<{
        valid: boolean;
        preview_count: number;
        cost_usd: number;
      }>('hotspot-radar', { action: 'test_target', kind, value });
      return response;
    },
    [],
  );

  const items = useMemo<HotspotFeedItem[]>(() => {
    const favoriteByItem = new Map<string, HotspotFavoriteRow>();
    for (const favorite of favorites) favoriteByItem.set(favorite.item_id, favorite);
    return rawItems.map((item) => ({ ...item, favorite: favoriteByItem.get(item.id) ?? null }));
  }, [rawItems, favorites]);

  return {
    items,
    targets,
    runs,
    settings,
    usage,
    daily,
    loading,
    error,
    missingSchema,
    scanning,
    scanningAll,
    saving,
    warnings,
    refresh,
    actions: {
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
    },
  };
}
