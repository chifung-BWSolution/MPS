import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { invokeGscSync } from '@/lib/gscApi';
import { toast } from 'sonner';
import { isLiveGscRun, isStaleGscRun, mapGscSyncRun, type GscSyncRunDb } from '@/lib/gscSync';
import type { GscSyncRunRow } from '@/types/seo';

const RUN_COLUMNS =
  'id, started_at, finished_at, status, sites_synced, rows_upserted, keywords_upserted, error_message, meta';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useGscSync() {
  const [run, setRun] = useState<GscSyncRunRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchId, setWatchId] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState(false);
  const startedIdRef = useRef<string | null>(null);

  const refreshRun = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('gsc_sync_runs')
      .select(RUN_COLUMNS)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (err) {
      setError(err.message);
      return null;
    }
    const mapped = data ? mapGscSyncRun(data as GscSyncRunDb) : null;
    setRun(mapped);
    setError(null);
    return mapped;
  }, []);

  useEffect(() => {
    void refreshRun().finally(() => setLoading(false));
  }, [refreshRun]);

  useEffect(() => {
    const watchContinue = Boolean(
      run?.meta?.incomplete &&
        Date.now() - Date.parse(run.finished_at || run.started_at) < 3 * 60 * 1000,
    );
    if (!isLiveGscRun(run) && !starting && !awaiting && !watchContinue) return;
    const t = setInterval(() => {
      void refreshRun();
    }, 2000);
    return () => clearInterval(t);
  }, [run?.id, run?.status, run?.started_at, starting, awaiting, refreshRun]);

  useEffect(() => {
    if (!watchId || !run || run.id !== watchId) return;
    if (run.status === 'success' && run.meta?.incomplete) {
      toast.message(run.error_message || 'GSC 同步部分完成，繼續其餘站點…');
      setWatchId(null);
    } else if (run.status === 'success') {
      toast.success(`GSC 同步完成：${run.sites_synced} 站、${run.keywords_upserted} 關鍵字`);
      setWatchId(null);
    } else if (run.status === 'error' || isStaleGscRun(run)) {
      toast.error(run.error_message || 'GSC 同步失敗或已逾時');
      setWatchId(null);
    }
  }, [watchId, run]);

  const start = useCallback(async () => {
    const current = run;
    if (isLiveGscRun(current)) {
      return { ok: false as const, error: '同步進行中' };
    }
    const prevId = current?.id ?? null;
    setStarting(true);
    setAwaiting(true);
    setError(null);
    try {
      void invokeGscSync()
        .then(async (json) => {
          const latest = await refreshRun();
          if (latest) startedIdRef.current = latest.id;
          return json;
        })
        .catch((e) => {
          const message = e instanceof Error ? e.message : String(e);
          setError(message);
          void refreshRun();
        })
        .finally(() => {
          setAwaiting(false);
        });

      let latest = current;
      for (let i = 0; i < 6; i++) {
        await sleep(300);
        latest = await refreshRun();
        if (latest && (latest.id !== prevId || latest.status !== current?.status)) {
          break;
        }
      }
      if (latest) {
        startedIdRef.current = latest.id;
        setWatchId(latest.id);
      }
      if (latest?.status === 'success') {
        return {
          ok: true as const,
          pending: false,
          sitesSynced: latest.sites_synced,
          rowsUpserted: latest.rows_upserted,
          keywordsUpserted: latest.keywords_upserted,
        };
      }
      if (latest?.status === 'error') {
        return { ok: false as const, error: latest.error_message || '同步失敗' };
      }
      return { ok: true as const, pending: true };
    } finally {
      setStarting(false);
    }
  }, [run, refreshRun]);

  return {
    run,
    loading,
    working: starting || isLiveGscRun(run),
    startedRunId: startedIdRef.current,
    error,
    refreshRun,
    start,
  };
}
