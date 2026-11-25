/**
 * 排程格資料 hook（M1-18～M1-20）
 *
 * 對應契約 IMPLEMENTATION-CONTRACT.md §5：
 *   useContentSlots(range?) → { slots, loading, error, missingSchema, refresh, planNow, updateSlot }
 *
 * 設計說明：
 *   - 一般讀寫走 supabase-js（RLS 已開）；本 hook 不呼叫任何 Edge Function。
 *   - `content_slots.article_id` 沒有 FK，PostgREST 無法 join，因此改用第二段查詢
 *     補上 content_articles(title,status) 與 seo_keywords(keyword)，合併成 UI 用的 view model。
 *   - `planNow` 依任務共識改為「本機預覽」：用 contentPlanner.planSlots() 算出
 *     「若現在重算會新增幾個 slot」，**不寫入資料庫**。真正重算由 cron 的 plan_slots job
 *     或站點設定變更觸發；後端目前沒有提供手動重算 action，因此這裡誠實地只做預覽。
 *   - `updateSlot` 直接 update content_slots（RLS 允許 authenticated 寫入）。
 *     改 publish_at 時同步重算 generate_at = publish_at - lead_time_hours（站點 cadence）。
 *     unique(site_id, publish_at) 衝突（23505）會轉成可讀的錯誤訊息，由 UI toast 提示。
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { contentErrorMessage, isContentSchemaMissing } from '@/lib/contentApi.ts';
import type {
  ContentArticleStatus,
  ContentCadence,
  ContentKeywordPipelineStatus,
  ContentSlot,
  ContentSlotStatus,
  ContentPlannedSlot,
} from '@/lib/contentTypes.ts';
import { DEFAULT_PLAN_HORIZON_DAYS, normalizeCadence, planSlots } from '@/lib/contentPlanner.ts';
import { canTransition, statusLabel } from '@/lib/contentState.ts';
import {
  DEFAULT_CADENCE,
  HONG_KONG_TIME_ZONE,
  addDaysToDateString,
  todayInZone,
} from '@/lib/contentFormat.ts';

const DAY_MS = 86_400_000;
const DEFAULT_RANGE_DAYS = 30;
const PAST_DAYS = 2;
/** 保護性上限：30 天 × 多站仍遠低於此 */
const SLOT_QUERY_LIMIT = 3_000;

/** 可寫入欄位（避免把 UI 用的 joined 欄位或 id 寫回資料庫） */
const WRITABLE_SLOT_FIELDS = [
  'keyword_id',
  'publish_at',
  'generate_at',
  'status',
  'reason',
  'article_id',
] as const;

type WritableSlotField = (typeof WRITABLE_SLOT_FIELDS)[number];

export interface ContentSlotArticleRef {
  id: string;
  title: string;
  status: ContentArticleStatus;
}

export interface ContentSlotKeywordRef {
  id: string;
  keyword: string;
  pipeline_status: ContentKeywordPipelineStatus | null;
}

/** UI view model：slot + 以第二段查詢補上的文章／關鍵字摘要 */
export interface ContentSlotWithArticle extends ContentSlot {
  article: ContentSlotArticleRef | null;
  keyword: ContentSlotKeywordRef | null;
}

export interface ContentSlotRange {
  siteId?: string | null;
  /** 預設 30：未來 N 天（另加過去 2 天，讓逾期未處理的 slot 也看得到） */
  days?: number;
}

export interface ContentSlotPlanScope {
  siteId: string;
  siteName: string;
  timezone: string;
  status: string | null;
  /** planner 算出的 slot 總數 */
  total: number;
  /** 其中資料庫已存在（unique(site_id,publish_at) 命中）的數量 */
  existing: number;
  /** 若現在重算會新增的數量（= total - existing） */
  wouldCreate: number;
  skippedBlackout: string[];
  warnings: string[];
}

export interface ContentSlotPlanPreview {
  scopes: ContentSlotPlanScope[];
  totalWouldCreate: number;
  totalExisting: number;
  horizonDays: number;
  computedAt: string;
}

export interface UseContentSlotsResult {
  slots: ContentSlotWithArticle[];
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  /** 本機預覽：回傳「若現在重算會新增的 slot 數」，不會寫入資料庫 */
  planNow: (siteId?: string) => Promise<{ created: number }>;
  updateSlot: (id: string, patch: Partial<ContentSlot>) => Promise<void>;
  /** 最近一次 planNow 的完整預覽（給 UI 顯示各站明細） */
  planPreview: ContentSlotPlanPreview | null;
  planning: boolean;
  clearPlanPreview: () => void;
}

function normalizeDays(days: number | undefined): number {
  const parsed = Number(days);
  if (!Number.isFinite(parsed)) return DEFAULT_RANGE_DAYS;
  return Math.min(120, Math.max(7, Math.round(parsed)));
}

function uniqueIds(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/** PostgREST 的 in(...) 走 URL，id 太多會超過長度上限；分批查詢 */
const IN_QUERY_CHUNK_SIZE = 100;

function chunkIds<T>(items: readonly T[], size = IN_QUERY_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size) as T[]);
  }
  return chunks;
}

async function fetchSlotArticleRefs(ids: readonly string[]): Promise<Map<string, ContentSlotArticleRef>> {
  const map = new Map<string, ContentSlotArticleRef>();
  if (ids.length === 0) return map;
  try {
    for (const chunk of chunkIds([...ids])) {
      const { data, error } = await supabase
        .from('content_articles')
        .select('id, title, status')
        .in('id', chunk);
      if (error) throw error;
      for (const row of (data ?? []) as ContentSlotArticleRef[]) {
        map.set(row.id, { id: row.id, title: row.title ?? '', status: row.status });
      }
    }
  } catch (error) {
    // 補充資料失敗不應讓整個排程表掛掉；矩陣仍可顯示 slot 本身
    console.warn('[useContentSlots] 補文章摘要失敗（已忽略）', error);
  }
  return map;
}

async function fetchSlotKeywordRefs(ids: readonly string[]): Promise<Map<string, ContentSlotKeywordRef>> {
  const map = new Map<string, ContentSlotKeywordRef>();
  if (ids.length === 0) return map;
  try {
    for (const chunk of chunkIds([...ids])) {
      const { data, error } = await supabase
        .from('seo_keywords')
        .select('id, keyword, pipeline_status')
        .in('id', chunk);
      if (error) throw error;
      for (const row of (data ?? []) as ContentSlotKeywordRef[]) {
        map.set(row.id, {
          id: row.id,
          keyword: row.keyword ?? '',
          pipeline_status: row.pipeline_status ?? null,
        });
      }
    }
  } catch (error) {
    console.warn('[useContentSlots] 補關鍵字摘要失敗（已忽略）', error);
  }
  return map;
}

/** 取得站點 cadence 的 lead_time_hours（改時間時用來同步 generate_at） */
async function fetchLeadTimeHours(siteId: string | null | undefined): Promise<number> {
  if (!siteId) return DEFAULT_CADENCE.lead_time_hours;
  try {
    const { data, error } = await supabase
      .from('content_sites')
      .select('cadence')
      .eq('website_profile_id', siteId)
      .maybeSingle();
    if (error) throw error;
    return normalizeCadence((data?.cadence ?? null) as Partial<ContentCadence> | null).lead_time_hours;
  } catch (error) {
    console.warn('[useContentSlots] 讀取站點 cadence 失敗，改用預設 lead time', error);
    return DEFAULT_CADENCE.lead_time_hours;
  }
}

function buildUpdatePayload(patch: Partial<ContentSlot>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of WRITABLE_SLOT_FIELDS) {
    if (patch[field as keyof ContentSlot] !== undefined) {
      payload[field] = patch[field as keyof ContentSlot];
    }
  }
  return payload;
}

/** 23505 = unique(site_id, publish_at) 撞鍵 */
function isUniqueViolation(error: unknown): boolean {
  const shape = error as { code?: string; message?: string; details?: string };
  if (shape?.code === '23505') return true;
  const text = [shape?.message, shape?.details].filter(Boolean).join(' ');
  return /duplicate key|unique constraint|23505/i.test(text);
}

export function useContentSlots(range?: ContentSlotRange): UseContentSlotsResult {
  const siteId = range?.siteId?.trim() || null;
  const days = normalizeDays(range?.days);

  const [slots, setSlots] = useState<ContentSlotWithArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [planPreview, setPlanPreview] = useState<ContentSlotPlanPreview | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const now = Date.now();
      const fromIso = new Date(now - PAST_DAYS * DAY_MS).toISOString();
      const toIso = new Date(now + days * DAY_MS).toISOString();

      let query = supabase
        .from('content_slots')
        .select('*')
        .gte('publish_at', fromIso)
        .lte('publish_at', toIso)
        .order('publish_at', { ascending: true })
        .limit(SLOT_QUERY_LIMIT);
      if (siteId) query = query.eq('site_id', siteId);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      const rows = (data ?? []) as ContentSlot[];
      const [articleRefs, keywordRefs] = await Promise.all([
        fetchSlotArticleRefs(uniqueIds(rows.map((row) => row.article_id))),
        fetchSlotKeywordRefs(uniqueIds(rows.map((row) => row.keyword_id))),
      ]);

      setSlots(
        rows.map((row) => ({
          ...row,
          article: row.article_id ? articleRefs.get(row.article_id) ?? null : null,
          keyword: row.keyword_id ? keywordRefs.get(row.keyword_id) ?? null : null,
        })),
      );
      setMissingSchema(false);
      setError(null);
    } catch (thrown) {
      if (isContentSchemaMissing(thrown)) {
        setMissingSchema(true);
        setSlots([]);
        setError(null);
      } else {
        setSlots([]);
        setError(contentErrorMessage(thrown));
      }
    } finally {
      setLoading(false);
    }
  }, [days, siteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * 本機預覽：算出「若現在依 cadence 重算，未來 30 天會新增幾個 slot」。
   * 不呼叫 Edge Function、不寫資料庫（content_jobs 對 authenticated 只讀，
   * content-worker 也要求 service_role；契約沒有 plan_now action）。
   */
  const planNow = useCallback(
    async (targetSiteId?: string): Promise<{ created: number }> => {
      setPlanning(true);
      try {
        const scopeSiteId = targetSiteId?.trim() || siteId;
        let siteQuery = supabase
          .from('content_sites')
          .select('website_profile_id, cadence, timezone, status');
        siteQuery = scopeSiteId
          ? siteQuery.eq('website_profile_id', scopeSiteId)
          : siteQuery.eq('status', 'active');

        const { data: siteRowsData, error: siteError } = await siteQuery;
        if (siteError) throw siteError;

        type SiteCadenceRow = {
          website_profile_id: string;
          cadence: Partial<ContentCadence> | null;
          timezone: string | null;
          status: string | null;
        };
        const siteRows = (siteRowsData ?? []) as SiteCadenceRow[];
        if (siteRows.length === 0) {
          throw new Error(
            scopeSiteId
              ? '找不到站點設定，無法預覽重算。請先完成站點接入。'
              : '目前沒有 active 站點，沒有可重算的排程。請先接入並啟用站點。',
          );
        }
        if (scopeSiteId) {
          const target = siteRows[0];
          if (target.status !== 'active') {
            throw new Error(
              `站點狀態為「${target.status ?? '未知'}」，cron 不會為非 active 站點重算排程；請先在站點設定改回 active。`,
            );
          }
        } else if (!siteRows.some((row) => row.status === 'active')) {
          throw new Error('目前沒有 active 站點，沒有可重算的排程。請先接入並啟用站點。');
        }

        const siteIds = siteRows.map((row) => row.website_profile_id);
        const horizonDays = Math.max(DEFAULT_PLAN_HORIZON_DAYS, days);
        const now = new Date();
        const horizonFrom = now.toISOString();
        const horizonTo = new Date(now.getTime() + horizonDays * DAY_MS).toISOString();

        const { data: existingRows, error: existingError } = await supabase
          .from('content_slots')
          .select('site_id, publish_at')
          .in('site_id', siteIds)
          .gte('publish_at', horizonFrom)
          .lte('publish_at', horizonTo);
        if (existingError) throw existingError;

        const existingKeys = new Set(
          ((existingRows ?? []) as { site_id: string; publish_at: string }[]).map(
            (row) => `${row.site_id}:${new Date(row.publish_at).getTime()}`,
          ),
        );

        // 站名（站點主檔），只為顯示；失敗就退回 id
        const siteNames = new Map<string, string>();
        try {
          const { data: profileRows } = await supabase
            .from('webandsystem_list')
            .select('id, website_name')
            .in('id', siteIds);
          for (const row of (profileRows ?? []) as { id: string; website_name: string | null }[]) {
            if (row.website_name) siteNames.set(row.id, row.website_name);
          }
        } catch {
          // 顯示用資料，失敗不影響預覽數字
        }

        const scopes: ContentSlotPlanScope[] = siteRows.map((row) => {
          const cadence = normalizeCadence(row.cadence);
          const timezone = row.timezone?.trim() || HONG_KONG_TIME_ZONE;
          const planned = planSlots({
            siteId: row.website_profile_id,
            cadence,
            timezone,
            now,
            horizonDays,
          });
          const existing = planned.slots.filter((slot) => existingKeys.has(slot.dedupe_key)).length;
          return {
            siteId: row.website_profile_id,
            siteName: siteNames.get(row.website_profile_id) ?? row.website_profile_id,
            timezone,
            status: row.status,
            total: planned.slots.length,
            existing,
            wouldCreate: Math.max(0, planned.slots.length - existing),
            skippedBlackout: planned.skippedBlackout,
            warnings: planned.warnings,
          };
        });

        const preview: ContentSlotPlanPreview = {
          scopes,
          totalWouldCreate: scopes.reduce((sum, scope) => sum + scope.wouldCreate, 0),
          totalExisting: scopes.reduce((sum, scope) => sum + scope.existing, 0),
          horizonDays,
          computedAt: new Date().toISOString(),
        };
        setPlanPreview(preview);
        return { created: preview.totalWouldCreate };
      } finally {
        setPlanning(false);
      }
    },
    [days, siteId],
  );

  const clearPlanPreview = useCallback(() => setPlanPreview(null), []);

  const updateSlot = useCallback(
    async (id: string, patch: Partial<ContentSlot>): Promise<void> => {
      const current = slots.find((slot) => slot.id === id);
      if (!current) {
        throw new Error('找不到這個排程格，請重新整理後再試。');
      }

      const payload = buildUpdatePayload(patch);
      if (Object.keys(payload).length === 0) return;

      // 狀態機守門：前端先擋一次，後端仍會再驗
      if (typeof payload.status === 'string') {
        const nextStatus = payload.status as ContentSlotStatus;
        if (!canTransition('slot', current.status, nextStatus)) {
          throw new Error(
            `不允許的狀態轉換：${statusLabel('slot', current.status)} → ${statusLabel('slot', nextStatus)}`,
          );
        }
      }

      // 改時間 → 同步重算 generate_at（lead_time_hours 來自站點 cadence）
      if (typeof payload.publish_at === 'string' && payload.generate_at === undefined) {
        const publishAtMs = new Date(payload.publish_at).getTime();
        if (!Number.isFinite(publishAtMs)) {
          throw new Error('發佈時間格式不正確。');
        }
        const leadTimeHours = await fetchLeadTimeHours(current.site_id);
        payload.generate_at = new Date(publishAtMs - leadTimeHours * 3_600_000).toISOString();
      }

      const { error: updateError } = await supabase
        .from('content_slots')
        .update(payload)
        .eq('id', id);

      if (updateError) {
        if (isUniqueViolation(updateError)) {
          throw new Error(
            '時段衝突：這個站點在同一時間已有排程格（unique site_id + publish_at），請換一個時間。',
          );
        }
        throw new Error(contentErrorMessage(updateError));
      }

      await refresh();
    },
    [refresh, slots],
  );

  return {
    slots,
    loading,
    error,
    missingSchema,
    refresh,
    planNow,
    updateSlot,
    planPreview,
    planning,
    clearPlanPreview,
  };
}

/** 供 UI 判斷「這個 slot 的審核是否已逾期」時使用（approved = 已批准／已排程／已發布） */
export function isSlotApproved(slot: Pick<ContentSlot, 'status' | 'article_id'>): boolean {
  return (
    slot.status === 'approved' ||
    slot.status === 'scheduled' ||
    slot.status === 'publishing' ||
    slot.status === 'published'
  );
}

/** 把 planner 輸出（未落庫）轉成 UI 顯示用的日期字串（站點時區） */
export function plannedSlotDate(planned: ContentPlannedSlot, timezone: string): string {
  return todayInZone(timezone, new Date(planned.publish_at));
}

/** 給 UI 算「未來 N 天」的日期鍵（站點時區） */
export function slotDateKeys(timezone: string, days: number, from: Date = new Date()): string[] {
  const start = todayInZone(timezone, from);
  return Array.from({ length: Math.max(1, days) }, (_, index) =>
    addDaysToDateString(start, index),
  );
}
