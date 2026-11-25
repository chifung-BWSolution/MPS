/**
 * 社媒自動化營運 · LLM 用量（M2-15、PRD §9.2.4）
 *
 * 契約（IMPLEMENTATION-CONTRACT §5）：
 *   useContentUsage(days = 7): { summary, daily, byModel, loading, error, refresh }
 *
 * 統計口徑：
 *   - 「日」一律以香港時間（Asia/Hong_Kong）00:00 為界（與日報 §9.2.4 一致）。
 *   - calls / tokens / costUsd 來自 `content_llm_usage`；articles 另查 `content_articles`
 *     （created_at 落在同一區間的新增文章數）。
 *   - days 參數是「含今天共幾天」，區間從 days-1 天前的 HKT 00:00 起算，
 *     因此 daily 的每一天與 summary 完全對得上，圖表不會出現對不上的尾差。
 *
 * 加成匯出（非 §5 契約、供本 owner 頁面使用）：
 *   useContentUsageToday() → 今日（HKT）呼叫數與生成篇數，設定頁顯示「今日已用／剩餘」。
 *
 * 成本為 LLM_PRICING 估算，實際以 Google 帳單為準。
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { contentErrorMessage, isContentSchemaMissing } from '@/lib/contentApi.ts';
import {
  HONG_KONG_TIME_ZONE,
  addDaysToDateString,
  todayInZone,
  zoneDateString,
  zonedWallTimeToUtc,
} from '@/lib/contentFormat.ts';
import type {
  ContentLlmUsage,
  ContentUsageByModel,
  ContentUsageDay,
  ContentUsageSummary,
} from '@/lib/contentTypes.ts';

const EMPTY_SUMMARY: ContentUsageSummary = {
  calls: 0,
  articles: 0,
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0,
};

type UsageRow = Pick<
  ContentLlmUsage,
  'model' | 'use_case' | 'tokens_in' | 'tokens_out' | 'cost_usd' | 'created_at'
>;

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 今天（HKT）00:00 對應的 UTC 瞬間 */
function startOfTodayHk(): Date {
  return zonedWallTimeToUtc(todayInZone(HONG_KONG_TIME_ZONE), '00:00', HONG_KONG_TIME_ZONE);
}

/** 含今天共 days 天，第一天（HKT 00:00）的 UTC 瞬間 */
function startOfWindowHk(days: number): Date {
  const startDate = addDaysToDateString(todayInZone(HONG_KONG_TIME_ZONE), -(days - 1));
  return zonedWallTimeToUtc(startDate, '00:00', HONG_KONG_TIME_ZONE);
}

function hkDateList(days: number): string[] {
  const today = todayInZone(HONG_KONG_TIME_ZONE);
  const dates: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    dates.push(addDaysToDateString(today, -offset));
  }
  return dates;
}

async function countCreatedSince(table: string, since: Date): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export interface ContentUsageResult {
  summary: ContentUsageSummary;
  daily: ContentUsageDay[];
  byModel: ContentUsageByModel[];
  loading: boolean;
  error: string | null;
  /** 資料表尚未建立（42P01）→ 頁面顯示「功能尚未啟用」 */
  missingSchema: boolean;
  refresh: () => Promise<void>;
}

export function useContentUsage(days = 7): ContentUsageResult {
  const safeDays = Math.min(90, Math.max(1, Math.floor(Number(days) || 7)));
  const [summary, setSummary] = useState<ContentUsageSummary>(EMPTY_SUMMARY);
  const [daily, setDaily] = useState<ContentUsageDay[]>([]);
  const [byModel, setByModel] = useState<ContentUsageByModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const since = startOfWindowHk(safeDays);

      const [usageResult, articlesCount] = await Promise.all([
        supabase
          .from('content_llm_usage')
          .select('model, use_case, tokens_in, tokens_out, cost_usd, created_at')
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: true })
          // PostgREST 單次上限預設 1000 筆；免費層每日 30 次呼叫，7 天遠低於此。
          .limit(5000),
        countCreatedSince('content_articles', since),
      ]);

      if (usageResult.error) throw usageResult.error;

      const rows = (usageResult.data || []) as UsageRow[];
      const bucketByDate = new Map<string, ContentUsageDay>();
      for (const date of hkDateList(safeDays)) {
        bucketByDate.set(date, { date, calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 });
      }

      const byModelMap = new Map<string, ContentUsageByModel>();
      let calls = 0;
      let tokensIn = 0;
      let tokensOut = 0;
      let costUsd = 0;

      for (const row of rows) {
        const tin = toNumber(row.tokens_in);
        const tout = toNumber(row.tokens_out);
        const cost = toNumber(row.cost_usd);
        const model = String(row.model || '—');
        const useCase = String(row.use_case || '—');

        calls += 1;
        tokensIn += tin;
        tokensOut += tout;
        costUsd += cost;

        const date = zoneDateString(new Date(row.created_at), HONG_KONG_TIME_ZONE);
        const day = bucketByDate.get(date);
        if (day) {
          day.calls += 1;
          day.tokensIn += tin;
          day.tokensOut += tout;
          day.costUsd += cost;
        }

        const key = `${model}\u0000${useCase}`;
        const modelRow = byModelMap.get(key);
        if (modelRow) {
          modelRow.calls += 1;
          modelRow.tokensIn += tin;
          modelRow.tokensOut += tout;
          modelRow.costUsd += cost;
        } else {
          byModelMap.set(key, {
            model,
            useCase,
            calls: 1,
            tokensIn: tin,
            tokensOut: tout,
            costUsd: cost,
          });
        }
      }

      const dayRows = [...bucketByDate.values()].map((day) => ({
        ...day,
        costUsd: roundCost(day.costUsd),
      }));

      const modelRows = [...byModelMap.values()]
        .map((row) => ({ ...row, costUsd: roundCost(row.costUsd) }))
        .sort((a, b) => b.calls - a.calls || a.model.localeCompare(b.model));

      setSummary({
        calls,
        articles: articlesCount,
        tokensIn,
        tokensOut,
        costUsd: roundCost(costUsd),
      });
      setDaily(dayRows);
      setByModel(modelRows);
      setError(null);
      setMissingSchema(false);
    } catch (err) {
      if (isContentSchemaMissing(err)) {
        setMissingSchema(true);
        setError(null);
        setSummary(EMPTY_SUMMARY);
        setDaily([]);
        setByModel([]);
      } else {
        setError(contentErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [safeDays]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, daily, byModel, loading, error, missingSchema, refresh };
}

// ============================================================
// 今日用量（本 owner 頁面私有；設定頁「今日已用／剩餘」與用量頁上限進度條共用）
// ============================================================

export interface ContentUsageTodayResult {
  calls: number;
  articles: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useContentUsageToday(): ContentUsageTodayResult {
  const [calls, setCalls] = useState(0);
  const [articles, setArticles] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const since = startOfTodayHk();
      const [callCount, articleCount] = await Promise.all([
        countCreatedSince('content_llm_usage', since),
        countCreatedSince('content_articles', since),
      ]);
      setCalls(callCount);
      setArticles(articleCount);
      setError(null);
    } catch (err) {
      if (isContentSchemaMissing(err)) {
        setCalls(0);
        setArticles(0);
        setError(null);
      } else {
        setError(contentErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { calls, articles, loading, error, refresh };
}
