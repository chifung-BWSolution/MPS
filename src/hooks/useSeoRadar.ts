/**
 * SEO 雷達 · 前端資料 hook（PRD §8）
 *
 * 兩條通道：
 *   1. supabase-js 直連（RLS 只給 SELECT）→ 讀站點、候選詞、抓取紀錄
 *   2. Edge Function `seo-radar` → scan / adopt / ignore（需要重算權限）
 *
 * 資料表未建立（42P01／PGRST205）時 `missingSchema = true`，頁面顯示
 * 「功能尚未啟用」，不拋錯、不白屏（比照 ContentAutomationCenter）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  contentErrorMessage,
  invokeContentFunction,
  isContentSchemaMissing,
} from '@/lib/contentApi';
import type {
  RadarAdoptResponse,
  RadarCronStatus,
  RadarDeleteResponse,
  RadarMarketCode,
  RadarScanAllResponse,
  RadarScanResponse,
  SeoRadarIdeaRow,
  SeoRadarRunRow,
  SeoRadarSite,
} from '@/types/seoRadar';

const SITE_COLUMNS = 'id,website_name,domain_url,brand,status,gsc_site_url,level';
const IDEA_COLUMNS =
  'id,website_profile_id,keyword,normalized_keyword,source,market_code,language_code,impressions,clicks,ctr,avg_position,seed_keyword,score,status,adopted_keyword_id,run_id,first_seen_at,last_seen_at';
const RUN_COLUMNS =
  'id,trigger,status,sites_scanned,ideas_upserted,gsc_terms,suggest_terms,error_message,meta,started_at,finished_at';

/** 一次最多讀 500 個候選詞（每次抓取上限 100，留足夠歷史） */
const IDEA_LIMIT = 500;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapIdea(row: Record<string, unknown>): SeoRadarIdeaRow {
  return {
    id: String(row.id),
    website_profile_id: String(row.website_profile_id),
    keyword: String(row.keyword ?? ''),
    normalized_keyword: String(row.normalized_keyword ?? ''),
    source: row.source === 'suggest' ? 'suggest' : 'gsc',
    market_code: String(row.market_code ?? 'hk') as SeoRadarIdeaRow['market_code'],
    language_code: String(row.language_code ?? 'zh-HK'),
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    ctr: toNullableNumber(row.ctr),
    avg_position: toNullableNumber(row.avg_position),
    seed_keyword: row.seed_keyword == null ? null : String(row.seed_keyword),
    score: toNumber(row.score),
    status:
      row.status === 'adopted' || row.status === 'ignored'
        ? (row.status as SeoRadarIdeaRow['status'])
        : 'new',
    adopted_keyword_id: row.adopted_keyword_id == null ? null : String(row.adopted_keyword_id),
    run_id: row.run_id == null ? null : String(row.run_id),
    first_seen_at: String(row.first_seen_at ?? ''),
    last_seen_at: String(row.last_seen_at ?? ''),
  };
}

function mapRun(row: Record<string, unknown> | null): SeoRadarRunRow | null {
  if (!row) return null;
  return {
    id: String(row.id),
    trigger: row.trigger === 'cron' ? 'cron' : 'manual',
    status:
      row.status === 'success' || row.status === 'error'
        ? (row.status as SeoRadarRunRow['status'])
        : 'running',
    sites_scanned: toNumber(row.sites_scanned),
    ideas_upserted: toNumber(row.ideas_upserted),
    gsc_terms: toNumber(row.gsc_terms),
    suggest_terms: toNumber(row.suggest_terms),
    error_message: row.error_message == null ? null : String(row.error_message),
    meta: (row.meta as Record<string, unknown> | null) ?? null,
    started_at: String(row.started_at ?? ''),
    finished_at: row.finished_at == null ? null : String(row.finished_at),
  };
}

// ============================================================
// 站點清單（不經 content_sites，避免未配置站點消失）
// ============================================================

export function useRadarSites() {
  const [sites, setSites] = useState<SeoRadarSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [siteResult, gscResult] = await Promise.all([
        supabase
          .from('webandsystem_list')
          .select(SITE_COLUMNS)
          .order('level', { ascending: true }),
        supabase.from('gsc_sites').select('website_profile_id'),
      ]);

      if (siteResult.error) throw siteResult.error;

      const gscLinked = new Set(
        ((gscResult.data ?? []) as { website_profile_id: string | null }[])
          .map((row) => row.website_profile_id ?? '')
          .filter(Boolean),
      );

      const rows = (siteResult.data ?? []) as Record<string, unknown>[];
      const next: SeoRadarSite[] = rows
        .filter((row) => String(row.status ?? '') !== 'archived')
        .map((row) => {
          const id = String(row.id);
          return {
            id,
            websiteName: String(row.website_name ?? id),
            domainUrl: row.domain_url == null ? null : String(row.domain_url),
            brand: row.brand == null ? null : String(row.brand),
            status: String(row.status ?? ''),
            gscConnected: gscLinked.has(id) || Boolean(row.gsc_site_url),
          };
        });

      setSites(next);
      setError(null);
    } catch (err) {
      setError(contentErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sites, loading, error, refresh };
}

// ============================================================
// 候選詞 + 動作
// ============================================================

export function useSeoRadar(siteId: string | null) {
  const [ideas, setIdeas] = useState<SeoRadarIdeaRow[]>([]);
  const [lastRun, setLastRun] = useState<SeoRadarRunRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dailyStatus, setDailyStatus] = useState<RadarCronStatus | null>(null);
  const [dailyBusy, setDailyBusy] = useState(false);
  const [scanningAll, setScanningAll] = useState(false);

  // 切站時的競態防護：慢的請求回來時如果站點已換，就丟棄結果，
  // 否則會出現「選了 A 站卻顯示 B 站的詞」。
  const siteIdRef = useRef<string | null>(siteId);
  const refreshSeq = useRef(0);
  useEffect(() => {
    siteIdRef.current = siteId;
  }, [siteId]);

  /** 每日自動抓取的狀態（全域，與站點無關；讀不到就當未知，不影響主流程） */
  const refreshDailyStatus = useCallback(async () => {
    try {
      const result = await invokeContentFunction<RadarCronStatus>('seo-radar', {
        action: 'cron_status',
      });
      setDailyStatus(result);
    } catch {
      setDailyStatus(null);
    }
  }, []);

  useEffect(() => {
    void refreshDailyStatus();
  }, [refreshDailyStatus]);

  const refresh = useCallback(async () => {
    const requestedSite = siteId;
    const seq = refreshSeq.current + 1;
    refreshSeq.current = seq;

    if (!requestedSite) {
      setIdeas([]);
      setLastRun(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [ideaResult, runResult] = await Promise.all([
        supabase
          .from('seo_keyword_ideas')
          .select(IDEA_COLUMNS)
          .eq('website_profile_id', requestedSite)
          .order('score', { ascending: false })
          .limit(IDEA_LIMIT),
        supabase
          .from('seo_radar_runs')
          .select(RUN_COLUMNS)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // 已經有更新的請求，或使用者已切站 → 丟棄這次結果
      if (seq !== refreshSeq.current || siteIdRef.current !== requestedSite) return;

      if (ideaResult.error) throw ideaResult.error;

      setIdeas(((ideaResult.data ?? []) as Record<string, unknown>[]).map(mapIdea));
      setLastRun(mapRun((runResult.data as Record<string, unknown> | null) ?? null));
      setMissingSchema(false);
      setError(null);
    } catch (err) {
      if (seq !== refreshSeq.current || siteIdRef.current !== requestedSite) return;
      if (isContentSchemaMissing(err)) {
        setMissingSchema(true);
        setIdeas([]);
        setLastRun(null);
      } else {
        setError(contentErrorMessage(err));
      }
    } finally {
      if (seq === refreshSeq.current) setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const scan = useCallback(
    async (marketOverride: RadarMarketCode | null): Promise<RadarScanResponse | null> => {
      if (!siteId) return null;
      const requestedSite = siteId;
      setScanning(true);
      setError(null);
      setWarnings([]);
      try {
        const result = await invokeContentFunction<RadarScanResponse>('seo-radar', {
          action: 'scan',
          website_profile_id: siteId,
          ...(marketOverride ? { market_override: marketOverride } : {}),
        });
        // 掃描期間使用者可能已切站，過期結果不要覆蓋新站點的畫面
        if (siteIdRef.current === requestedSite) {
          setWarnings(result.warnings ?? []);
        }
        await refresh();
        return result;
      } catch (err) {
        if (siteIdRef.current === requestedSite) {
          setError(contentErrorMessage(err));
        }
        return null;
      } finally {
        setScanning(false);
      }
    },
    [siteId, refresh],
  );

  const adopt = useCallback(
    async (ideaIds: string[], enqueue: boolean): Promise<RadarAdoptResponse | null> => {
      if (!siteId || ideaIds.length === 0) return null;
      setWorking(true);
      setError(null);
      try {
        const result = await invokeContentFunction<RadarAdoptResponse>('seo-radar', {
          action: 'adopt',
          website_profile_id: siteId,
          idea_ids: ideaIds,
          enqueue,
        });
        await refresh();
        return result;
      } catch (err) {
        setError(contentErrorMessage(err));
        return null;
      } finally {
        setWorking(false);
      }
    },
    [siteId, refresh],
  );

  const remove = useCallback(
    async (ideaIds: string[]): Promise<RadarDeleteResponse | null> => {
      if (!siteId || ideaIds.length === 0) return null;
      setWorking(true);
      setError(null);
      try {
        const result = await invokeContentFunction<RadarDeleteResponse>('seo-radar', {
          action: 'delete',
          website_profile_id: siteId,
          idea_ids: ideaIds,
        });
        await refresh();
        return result;
      } catch (err) {
        setError(contentErrorMessage(err));
        return null;
      } finally {
        setWorking(false);
      }
    },
    [siteId, refresh],
  );

  /** 手動「全站自動抓取」：一次處理最久沒更新的若干站點 */
  const scanAll = useCallback(async (): Promise<RadarScanAllResponse | null> => {
    setScanningAll(true);
    setError(null);
    try {
      const result = await invokeContentFunction<RadarScanAllResponse>('seo-radar', {
        action: 'scan_all',
      });
      await refresh();
      await refreshDailyStatus();
      return result;
    } catch (err) {
      setError(contentErrorMessage(err));
      return null;
    } finally {
      setScanningAll(false);
    }
  }, [refresh, refreshDailyStatus]);

  /** 開／關每日自動抓取 */
  const setDaily = useCallback(
    async (enabled: boolean): Promise<RadarCronStatus | null> => {
      setDailyBusy(true);
      setError(null);
      try {
        const result = await invokeContentFunction<RadarCronStatus>('seo-radar', {
          action: 'set_daily',
          enabled,
        });
        setDailyStatus(result);
        return result;
      } catch (err) {
        setError(contentErrorMessage(err));
        return null;
      } finally {
        setDailyBusy(false);
      }
    },
    [],
  );

  return {
    ideas,
    lastRun,
    loading,
    error,
    missingSchema,
    scanning,
    working,
    warnings,
    refresh,
    scan,
    scanAll,
    adopt,
    remove,
    dailyStatus,
    dailyBusy,
    scanningAll,
    refreshDailyStatus,
    setDaily,
  };
}
