/**
 * 關鍵字庫資料 hook（M1-17、PRD §6.2.2）
 *
 * 契約（IMPLEMENTATION-CONTRACT §5）：
 *   useContentKeywords(siteId) → { keywords, loading, error, missingSchema,
 *                                  refresh, importRows, scanGsc, updateKeyword }
 *
 * 資料安全規則（PRD §6.2.2，這裡是本專案的關鍵不變量）：
 *   1. seo_keywords 的 5 個新欄位全為 nullable 且沒有 DEFAULT；既有列一律 NULL。
 *   2. NULL 的 pipeline_status 代表「未啟用自動生成」，planner 不會挑選。
 *      只有人在關鍵字庫明確改成 backlog（單筆或批次），該詞才可能被排入生成。
 *   3. 排序必須 `priority desc nulls last` 再 `created_at asc`。Postgres 的 desc
 *      預設把 NULL 排最前，漏了 nulls last 會讓「未分級」的歷史詞反而最優先。
 *      因此這裡除了下 PostgREST 參數，回傳前再用 compareContentKeywords 排一次，
 *      不依賴 PostgREST 的預設或外層元件的排序假設。
 *
 * 寫入只允許 5 個欄位（intent / priority / cluster / pipeline_status / last_used_at），
 * 其餘欄位（keyword、status、source…）語義屬於既有 SEO 模組，content 自動化不得改。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CONTENT_FUNCTIONS,
  ContentApiError,
  contentErrorMessage,
  invokeContentFunction,
  isContentSchemaMissing,
} from '@/lib/contentApi.ts';
import type {
  ContentKeyword,
  ContentKeywordImportResult,
  ContentKeywordImportRow,
  ContentKeywordIntent,
  ContentKeywordPipelineStatus,
} from '@/lib/contentTypes.ts';

const PAGE_SIZE = 1000;

/** 一定要含 5 個新欄位；漏了會讓 UI 把「已啟用」的詞誤判成未啟用（反之亦然） */
export const CONTENT_KEYWORD_COLUMNS = [
  'id',
  'website_profile_id',
  'keyword',
  'normalized_keyword',
  'level',
  'search_volume',
  'current_ranking',
  'target_ranking',
  'target_page',
  'difficulty_score',
  'status',
  'ai_generated',
  'source',
  'gsc_site_url',
  'last_gsc_sync_at',
  'intent',
  'priority',
  'cluster',
  'pipeline_status',
  'last_used_at',
  'created_at',
  'updated_at',
].join(', ');

/** 匯入／驗證用的合法值（與 content-keywords Edge Function 的驗證一致） */
export const KEYWORD_INTENTS: readonly ContentKeywordIntent[] = [
  'informational',
  'commercial',
  'transactional',
  'navigational',
];

export const KEYWORD_PIPELINE_STATUSES: readonly ContentKeywordPipelineStatus[] = [
  'backlog',
  'planned',
  'generating',
  'in_review',
  'published',
  'rejected',
  'parked',
];

/** 只有這 5 欄可以由內容自動化改寫（其餘屬既有 SEO 模組語義） */
export const CONTENT_KEYWORD_UPDATABLE_FIELDS = [
  'intent',
  'priority',
  'cluster',
  'pipeline_status',
  'last_used_at',
] as const;

export type ContentKeywordUpdatableField =
  (typeof CONTENT_KEYWORD_UPDATABLE_FIELDS)[number];

export const KEYWORD_SOURCE_LABEL: Record<ContentKeyword['source'], string> = {
  manual: '手動',
  gsc: 'GSC',
  ads: '廣告',
  import: '匯入',
};

export function keywordSourceLabel(source: string | null | undefined): string {
  if (!source) return '—';
  return KEYWORD_SOURCE_LABEL[source as ContentKeyword['source']] ?? source;
}

/** null = 未分級（PRD §6.2.2：不給 DEFAULT，NULL 代表未分級）；1000 = 人工 pin */
export const KEYWORD_PINNED_PRIORITY = 1000;

export function keywordPriorityLabel(priority: number | null | undefined): string {
  if (priority == null || !Number.isFinite(Number(priority))) return '未分級';
  if (Number(priority) === KEYWORD_PINNED_PRIORITY) return `${priority}（pin）`;
  return String(priority);
}

/** 讓 PostgREST 的 numeric / int 以字串回傳時也能收斂成 number */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/** PostgREST 回傳列（欄位可能因舊資料而缺值，全部容忍） */
export interface ContentKeywordDbRow {
  id: string;
  website_profile_id: string;
  keyword: string;
  normalized_keyword?: string | null;
  level?: ContentKeyword['level'] | null;
  search_volume?: number | string | null;
  current_ranking?: number | string | null;
  target_ranking?: number | string | null;
  target_page?: string | null;
  difficulty_score?: number | string | null;
  status?: ContentKeyword['status'] | null;
  ai_generated?: boolean | null;
  source?: ContentKeyword['source'] | null;
  gsc_site_url?: string | null;
  last_gsc_sync_at?: string | null;
  intent?: ContentKeyword['intent'] | null;
  priority?: number | string | null;
  cluster?: string | null;
  pipeline_status?: ContentKeyword['pipeline_status'] | null;
  last_used_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** DB 列 → 前端型別（型別只從 contentTypes 取，這裡只負責收斂） */
export function mapContentKeywordRow(row: ContentKeywordDbRow): ContentKeyword {
  return {
    id: row.id,
    website_profile_id: row.website_profile_id,
    keyword: row.keyword ?? '',
    normalized_keyword: row.normalized_keyword ?? (row.keyword ?? '').trim().toLowerCase(),
    level: row.level ?? 'level_3',
    search_volume: toNumberOrNull(row.search_volume),
    current_ranking: toNumberOrNull(row.current_ranking),
    target_ranking: toNumberOrNull(row.target_ranking),
    target_page: toStringOrNull(row.target_page),
    difficulty_score: toNumberOrNull(row.difficulty_score),
    status: row.status ?? 'monitoring',
    ai_generated: Boolean(row.ai_generated),
    source: row.source ?? 'manual',
    gsc_site_url: toStringOrNull(row.gsc_site_url),
    last_gsc_sync_at: toStringOrNull(row.last_gsc_sync_at),
    // 5 個新欄位：NULL 是有意義的狀態，不可用預設值蓋掉
    intent: row.intent ?? null,
    priority: toNumberOrNull(row.priority),
    cluster: toStringOrNull(row.cluster),
    pipeline_status: row.pipeline_status ?? null,
    last_used_at: toStringOrNull(row.last_used_at),
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
  };
}

/**
 * planner 的挑詞順序（PRD §6.2.2 配套規則 3）：
 *   priority desc（NULL 最後）→ created_at asc → keyword asc
 */
export function compareContentKeywords(a: ContentKeyword, b: ContentKeyword): number {
  if (a.priority !== b.priority) {
    if (a.priority == null) return 1;
    if (b.priority == null) return -1;
    return b.priority - a.priority;
  }
  const createdAt = (a.created_at || '').localeCompare(b.created_at || '');
  if (createdAt !== 0) return createdAt;
  return (a.keyword || '').localeCompare(b.keyword || '', 'zh-HK');
}

/** 是否「未啟用自動生成」（pipeline_status 為 NULL，不是 backlog） */
export function isKeywordAutoGenerationDisabled(
  keyword: Pick<ContentKeyword, 'pipeline_status'> | null | undefined,
): boolean {
  return !keyword || keyword.pipeline_status == null;
}

async function fetchSiteKeywords(siteId: string): Promise<ContentKeyword[]> {
  const rows: ContentKeyword[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('seo_keywords')
      .select(CONTENT_KEYWORD_COLUMNS)
      .eq('website_profile_id', siteId)
      // 明確 nulls last；不要把這個決定交給 PostgREST 預設
      .order('priority', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data || []) as unknown as ContentKeywordDbRow[];
    rows.push(...page.map(mapContentKeywordRow));
    if (page.length < PAGE_SIZE) break;
  }
  rows.sort(compareContentKeywords);
  return rows;
}

function normalizeImportResult(result: unknown): ContentKeywordImportResult {
  const shape = (result || {}) as {
    inserted?: unknown;
    skipped?: unknown;
    errors?: unknown;
  };
  const errors = Array.isArray(shape.errors)
    ? shape.errors.map((item) => {
        const entry = (item || {}) as {
          line?: unknown;
          phrase?: unknown;
          reason?: unknown;
        };
        return {
          line: toNumberOrNull(entry.line) ?? 0,
          phrase: String(entry.phrase ?? ''),
          reason: String(entry.reason ?? ''),
        };
      })
    : [];
  return {
    inserted: toNumberOrNull(shape.inserted) ?? 0,
    skipped: toNumberOrNull(shape.skipped) ?? 0,
    errors,
  };
}

function pickUpdatableFields(
  patch: Partial<ContentKeyword>,
): Partial<Pick<ContentKeyword, ContentKeywordUpdatableField>> {
  const next: Record<string, unknown> = {};
  for (const field of CONTENT_KEYWORD_UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      next[field] = (patch as Record<string, unknown>)[field];
    }
  }
  return next as Partial<Pick<ContentKeyword, ContentKeywordUpdatableField>>;
}

export function useContentKeywords(siteId: string | null) {
  const [keywords, setKeywords] = useState<ContentKeyword[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(siteId));
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  /** 目前 keywords 對應的站點；用於切站瞬間不要把上一站的資料顯示成新站的 */
  const [loadedSiteId, setLoadedSiteId] = useState<string | null>(null);

  // 站點快速切換時丟棄過期請求，避免 A 站的結果蓋掉 B 站
  const requestSeq = useRef(0);
  const siteRef = useRef<string | null>(siteId);
  siteRef.current = siteId;

  const refresh = useCallback(async () => {
    const targetSite = siteId;
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;

    if (!targetSite) {
      setKeywords([]);
      setError(null);
      setMissingSchema(false);
      setLoadedSiteId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await fetchSiteKeywords(targetSite);
      if (requestSeq.current !== requestId) return;
      // 期間站點已被切換（例如 import 完成時已在另一站）→ 丟棄，不要蓋掉新站資料
      if (siteRef.current !== targetSite) return;
      setKeywords(next);
      setError(null);
      setMissingSchema(false);
      setLoadedSiteId(targetSite);
    } catch (caught) {
      if (requestSeq.current !== requestId) return;
      if (siteRef.current !== targetSite) return;
      // 資料表／新欄位尚未建立（42P01 / PGRST205 / PGRST204）→ 降級不白屏
      if (isContentSchemaMissing(caught)) {
        setMissingSchema(true);
        setError(null);
      } else {
        setError(contentErrorMessage(caught));
        setMissingSchema(false);
      }
      setKeywords([]);
      setLoadedSiteId(targetSite);
    } finally {
      if (requestSeq.current === requestId) setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    // 換站點先清空，避免舊站資料短暫顯示在指標條
    setKeywords([]);
    setError(null);
    setMissingSchema(false);
    void refresh();
  }, [refresh]);

  /** 匯入 CSV → content-keywords（逐行驗證在 Edge Function，單行錯誤不整批失敗） */
  const importRows = useCallback(
    async (rows: ContentKeywordImportRow[]): Promise<ContentKeywordImportResult> => {
      if (!siteId) {
        throw new ContentApiError('site_required', '請先選擇站點，再匯入關鍵字。');
      }
      const result = await invokeContentFunction<unknown>(CONTENT_FUNCTIONS.keywords, {
        action: 'import',
        site_id: siteId,
        rows: Array.isArray(rows) ? rows : [],
      });
      // 匯入期間若已切到別的站，交回給那次切站的 refresh，不要用舊站結果覆蓋
      if (siteRef.current === siteId) await refresh();
      return normalizeImportResult(result);
    },
    [refresh, siteId],
  );

  /** 掃 GSC 機會詞（需 write 權限；未綁定 GSC 會拋 code='gsc_not_linked'） */
  const scanGsc = useCallback(async (): Promise<{ inserted: number; scanned: number }> => {
    if (!siteId) {
      throw new ContentApiError('site_required', '請先選擇站點，再同步 GSC 機會詞。');
    }
    const result = await invokeContentFunction<{ inserted?: unknown; scanned?: unknown }>(
      CONTENT_FUNCTIONS.keywords,
      { action: 'scan_gsc', site_id: siteId },
    );
    if (siteRef.current === siteId) await refresh();
    return {
      inserted: toNumberOrNull(result?.inserted) ?? 0,
      scanned: toNumberOrNull(result?.scanned) ?? 0,
    };
  }, [refresh, siteId]);

  /**
   * 單筆更新（只允許 intent / priority / cluster / pipeline_status / last_used_at）。
   * 失敗會拋錯，由呼叫端 toast；成功後就地合併，避免整張表閃爍。
   */
  const updateKeyword = useCallback(
    async (id: string, patch: Partial<ContentKeyword>): Promise<void> => {
      if (!id) {
        throw new ContentApiError('invalid_id', '缺少關鍵字 id，無法更新。');
      }
      const payload = pickUpdatableFields(patch || {});
      if (Object.keys(payload).length === 0) return;

      const { data, error: updateError } = await supabase
        .from('seo_keywords')
        .update(payload)
        .eq('id', id)
        .select(CONTENT_KEYWORD_COLUMNS)
        .maybeSingle();

      if (updateError) throw updateError;

      // 沒有回傳列（id 不存在或被 RLS 擋下）不可以假裝成功：
      // 這支 hook 是唯一允許改 pipeline_status 的入口，靜默失敗會讓 UI 與 DB 不一致。
      if (!data) {
        throw new ContentApiError(
          'update_not_applied',
          '更新沒有生效（找不到這個關鍵字，或沒有更新權限）。請重新整理後再試。',
        );
      }

      const updated = mapContentKeywordRow(data as unknown as ContentKeywordDbRow);

      setKeywords((prev) => {
        const next = prev.map((row) => (row.id === id ? updated : row));
        return next.sort(compareContentKeywords);
      });
    },
    [],
  );

  /**
   * 切站瞬間（route 已換、資料未到）一律當成「載入中 + 空資料 + 無錯誤」，
   * 避免 A 站的列或錯誤訊息短暫顯示在 B 站頁面上。
   */
  const isLoadedSite = loadedSiteId !== null && loadedSiteId === siteId;

  return {
    keywords: isLoadedSite ? keywords : [],
    loading: loading || (siteId !== null && !isLoadedSite),
    error: isLoadedSite ? error : null,
    missingSchema: isLoadedSite ? missingSchema : false,
    refresh,
    importRows,
    scanGsc,
    updateKeyword,
  };
}
