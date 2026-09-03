import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { invokeGoogleAdsBackfill } from '@/lib/googleAdsApi';
import type { GoogleAdsBackfillJob } from '@/types/googleAds';

type JobDb = {
  id: string;
  status: GoogleAdsBackfillJob['status'];
  history_start_date: string;
  history_end_date: string;
  cursor_month: string;
  total_months: number;
  completed_months: number;
  rows_upserted: number | string;
  accounts_targeted: number;
  error_count: number;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  meta: GoogleAdsBackfillJob['meta'] | null;
};

function mapJob(row: JobDb): GoogleAdsBackfillJob {
  return {
    id: row.id,
    status: row.status,
    historyStartDate: row.history_start_date,
    historyEndDate: row.history_end_date,
    cursorMonth: row.cursor_month,
    totalMonths: row.total_months,
    completedMonths: row.completed_months,
    rowsUpserted: Number(row.rows_upserted) || 0,
    accountsTargeted: row.accounts_targeted,
    errorCount: row.error_count,
    lastError: row.last_error ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    updatedAt: row.updated_at,
    meta: row.meta ?? undefined,
  };
}

function mapJobFromApi(raw: Record<string, unknown>): GoogleAdsBackfillJob {
  return mapJob({
    id: String(raw.id),
    status: raw.status as JobDb['status'],
    history_start_date: String(raw.history_start_date),
    history_end_date: String(raw.history_end_date),
    cursor_month: String(raw.cursor_month),
    total_months: Number(raw.total_months) || 0,
    completed_months: Number(raw.completed_months) || 0,
    rows_upserted: Number(raw.rows_upserted) || 0,
    accounts_targeted: Number(raw.accounts_targeted) || 0,
    error_count: Number(raw.error_count) || 0,
    last_error: (raw.last_error as string) || null,
    started_at: (raw.started_at as string) || null,
    finished_at: (raw.finished_at as string) || null,
    updated_at: String(raw.updated_at || new Date().toISOString()),
    meta: (raw.meta as GoogleAdsBackfillJob['meta']) || null,
  });
}

export function useGoogleAdsBackfill() {
  
  const [job, setJob] = useState<GoogleAdsBackfillJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const steppingRef = useRef(false);

  const refreshJob = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('google_ads_backfill_jobs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (err) {
      setError(err.message);
      return null;
    }
    const mapped = data ? mapJob(data as JobDb) : null;
    setJob(mapped);
    setError(null);
    return mapped;
  }, []);

  useEffect(() => {
    void refreshJob().finally(() => setLoading(false));
  }, [refreshJob]);

  useEffect(() => {
    if (!job || !['running', 'paused'].includes(job.status)) return;
    const t = setInterval(() => {
      void refreshJob();
    }, 2000);
    return () => clearInterval(t);
  }, [job?.id, job?.status, refreshJob]);

  const start = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      const res = await invokeGoogleAdsBackfill('start');
      if (res.job) setJob(mapJobFromApi(res.job));
      setAutoRun(true);
      return { ok: true as const };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setWorking(false);
    }
  }, []);

  const pause = useCallback(async () => {
    if (!job) return { ok: false as const, error: 'No job' };
    setAutoRun(false);
    setWorking(true);
    try {
      const res = await invokeGoogleAdsBackfill('pause', job.id);
      if (res.job) setJob(mapJobFromApi(res.job));
      return { ok: true as const };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setWorking(false);
    }
  }, [job]);

  const resume = useCallback(async () => {
    if (!job) return { ok: false as const, error: 'No job' };
    setWorking(true);
    try {
      const res = await invokeGoogleAdsBackfill('resume', job.id);
      if (res.job) setJob(mapJobFromApi(res.job));
      setAutoRun(true);
      return { ok: true as const };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setWorking(false);
    }
  }, [job]);

  const cancel = useCallback(async () => {
    if (!job) return { ok: false as const, error: 'No job' };
    setAutoRun(false);
    setWorking(true);
    try {
      const res = await invokeGoogleAdsBackfill('cancel', job.id);
      if (res.job) setJob(mapJobFromApi(res.job));
      return { ok: true as const };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setWorking(false);
    }
  }, [job]);

  const stepOnce = useCallback(async () => {
    if (steppingRef.current) return;
    const current = job;
    if (!current || current.status !== 'running') return;
    steppingRef.current = true;
    const prevCompleted = current.completedMonths;
    try {
      const res = await invokeGoogleAdsBackfill('step', current.id);
      if (res.job) {
        const mapped = mapJobFromApi(res.job);
        setJob(mapped);
        setError(null);
        if (mapped.status !== 'running') setAutoRun(false);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Progress may have advanced before a gateway/timeout error — refresh and
      // keep auto-run when the job is still running.
      const latest = await refreshJob();
      if (latest && latest.status === 'running') {
        if (latest.completedMonths > prevCompleted) {
          setError(`步驟曾逾時／閘道錯誤，已繼續（${message}）`);
        } else {
          // Same month still pending (e.g. OPTIONS 502) — brief pause then retry.
          setError(`連線不穩，稍後重試（${message}）`);
          await new Promise((r) => setTimeout(r, 2500));
        }
        // keep autoRun
      } else {
        setError(message);
        setAutoRun(false);
      }
    } finally {
      steppingRef.current = false;
    }
  }, [job, refreshJob]);

  // Auto-chain steps while running. Longer gap reduces OPTIONS 502 after a heavy step.
  useEffect(() => {
    if (!autoRun || !job || job.status !== 'running') return;
    const t = setTimeout(() => {
      void stepOnce();
    }, 1500);
    return () => clearTimeout(t);
  }, [autoRun, job?.id, job?.status, job?.completedMonths, stepOnce]);

  return {
    job,
    loading,
    working,
    error,
    autoRun,
    setAutoRun,
    refreshJob,
    start,
    pause,
    resume,
    cancel,
    stepOnce,
  };
}
