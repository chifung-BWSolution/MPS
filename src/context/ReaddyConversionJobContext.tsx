import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  buildReaddyConversionResultEmail,
  hongKongDateLabel,
  READDY_CONVERSION_RESULT_TO,
  type ReaddyConversionMailInput,
} from '@/lib/readdyConversionMail';
import {
  FRAMER_PAGE_SYNC_CONCURRENCY,
  runReaddyConversion,
  type ReaddyConversionProgress,
  type ReaddyConversionRunInput,
  type ReaddyConversionRunResult,
} from '@/lib/readdyConversionRun';
import {
  buildServerRunPageStates,
  createInitialBackgroundPageStates,
  patchSavedPageProgress,
  type BackgroundPageState,
  type ServerRunPageRecord,
} from '@/lib/readdyFramerProgress';
import { sendEmail } from '@/lib/resendApi';
import {
  cancelReaddyConversionRun,
  conversionWorkerIsMissing,
  enqueueReaddyConversion,
} from '@/lib/readdyFramerApi';

export type ReaddyConversionJobView = {
  phase: 'idle' | 'running' | 'success' | 'failed';
  runId: string | null;
  siteName: string;
  readdyCode: string;
  projectKey: string;
  framerProjectUrl: string;
  currentLabel: string;
  done: number;
  total: number;
  error?: string;
  emailError?: string;
  pageStates: Record<string, BackgroundPageState>;
  finishedVersion: number;
  start: (input: ReaddyConversionRunInput) => void;
  cancel: () => void;
  dismiss: () => void;
};

const ReaddyConversionJobContext = createContext<ReaddyConversionJobView | null>(null);

function popupNotice(ok: boolean, title: string, body: string) {
  if (ok) toast.success(title, { description: body, duration: 16000 });
  else toast.error(title, { description: body, duration: 16000 });
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    // The in-app toast already surfaced the result.
  }
}

const idleView: {
  phase: 'idle' | 'running' | 'success' | 'failed';
  runId: string | null;
  siteName: string;
  readdyCode: string;
  projectKey: string;
  framerProjectUrl: string;
  currentLabel: string;
  done: number;
  total: number;
  pageStates: Record<string, BackgroundPageState>;
  finishedVersion: number;
} = {
  phase: 'idle',
  runId: null,
  siteName: '',
  readdyCode: '',
  projectKey: '',
  framerProjectUrl: '',
  currentLabel: '',
  done: 0,
  total: 0,
  pageStates: {},
  finishedVersion: 0,
};

type WatchedRunInput = {
  projectKey: string;
  siteName: string;
  framerProjectUrl: string;
  pages: Array<{ id: string; path: string }>;
};

export function ReaddyConversionJobProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState(idleView);
  const [error, setError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const runIdRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const pollCleanupRef = useRef<(() => void) | null>(null);

  const stopPoll = useCallback(() => {
    if (pollCleanupRef.current) {
      pollCleanupRef.current();
      pollCleanupRef.current = null;
    }
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const applyProgress = useCallback(
    (projectKey: string, framerProjectUrl: string, progress: ReaddyConversionProgress) => {
      const status = progress.patch?.migrationStatus;
      const durable = status === 'parsed' || status === 'migrated' || status === 'failed';
      if (durable && status) {
        patchSavedPageProgress(
          projectKey,
          progress.pageId,
          {
            migrationStatus: status,
            jobId: progress.patch?.jobId,
            sectionCount: progress.patch?.sectionCount,
            framerPageNodeId: progress.patch?.framerPageNodeId,
            lastSyncedAt: progress.patch?.lastSyncedAt,
            lastError: status === 'failed' ? (progress.patch?.lastError ?? null) : null,
          },
          framerProjectUrl,
        );
      }
      const finished = status === 'migrated' || status === 'failed';
      setView((prev) => {
        const prevPage = prev.pageStates[progress.pageId];
        const nextPageStates = progress.patch
          ? {
              ...prev.pageStates,
              [progress.pageId]: {
                ...prevPage,
                ...progress.patch,
                migrationStatus:
                  progress.patch.migrationStatus ?? prevPage?.migrationStatus ?? 'pending',
              },
            }
          : prev.pageStates;
        let doneCount = 0;
        for (const state of Object.values(nextPageStates)) {
          if (state.migrationStatus === 'migrated' || state.migrationStatus === 'failed') {
            doneCount += 1;
          }
        }
        return {
          ...prev,
          currentLabel: progress.message,
          done: doneCount,
          pageStates: nextPageStates,
          finishedVersion: finished ? prev.finishedVersion + 1 : prev.finishedVersion,
        };
      });
    },
    [],
  );

  const finish = useCallback(async (input: ReaddyConversionRunInput, result: ReaddyConversionRunResult, runId: string) => {
    const mailInput: ReaddyConversionMailInput = {
      siteName: input.siteName,
      readdyCode: input.readdyCode,
      date: hongKongDateLabel(),
      framerProjectUrl: input.framerProjectUrl,
      kind: result.kind,
      pages: result.pages,
      unstarted: result.unstarted,
      cancelled: result.cancelled,
      error: result.error,
      publishNote: result.publishNote,
    };
    const email = buildReaddyConversionResultEmail(mailInput);
    let mailError: string | undefined;
    try {
      await sendEmail({
        to: READDY_CONVERSION_RESULT_TO,
        subject: email.subject,
        html: email.html,
        text: email.text,
        idempotencyKey: `readdy-conversion/${input.projectKey}/${runId}`.slice(0, 256),
      });
    } catch (err) {
      mailError = err instanceof Error ? err.message : String(err);
    }

    const migrated = result.pages.filter((page) => page.status === 'migrated').length;
    const failedCount = result.pages.filter((page) => page.status === 'failed').length;
    const publishSuffix = result.publishNote ? `${result.publishNote}。` : "";
    const summary = mailError
      ? `完成 ${migrated} 頁、失敗 ${failedCount} 頁。${publishSuffix}結果郵件未能寄出：${mailError}`
      : `完成 ${migrated} 頁、失敗 ${failedCount} 頁。${publishSuffix}結果郵件已寄到 ${READDY_CONVERSION_RESULT_TO}`;
    popupNotice(result.kind === 'success' && !mailError, email.subject, summary);

    setError(result.error);
    setEmailError(mailError);
    setView((prev) => {
      const nextPageStates: Record<string, BackgroundPageState> = {};
      for (const [pageId, state] of Object.entries(prev.pageStates)) {
        nextPageStates[pageId] =
          state.migrationStatus === 'syncing'
            ? { ...state, migrationStatus: 'pending' }
            : state;
      }
      return {
        ...prev,
        phase: result.kind === 'success' ? 'success' : 'failed',
        currentLabel: summary,
        done: result.pages.length,
        pageStates: nextPageStates,
      };
    });
  }, []);

  const watchServerRun = useCallback((input: WatchedRunInput, runId: string, initialSeen?: Set<string>) => {
    stopPoll();
    const seen = new Set<string>(initialSeen);
    let stopped = false;
    let inFlight = false;
    pollCleanupRef.current = () => {
      stopped = true;
    };

    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const { data, error: readError } = await supabase
          .from('framer_conversion_runs')
          .select('status, progress, error, page_index')
          .eq('id', runId)
          .maybeSingle();
        if (stopped || readError || !data) return;

        const progress = (data.progress ?? {}) as {
          currentLabel?: string;
          done?: number;
          currentPageId?: string | null;
          pages?: Array<ServerRunPageRecord | null | undefined>;
          emailError?: string;
          summary?: string;
        };

        const runStatus = String(data.status || 'running');
        const snapshot = buildServerRunPageStates({
          pages: input.pages,
          runStatus,
          pageIndex: typeof data.page_index === 'number' ? data.page_index : null,
          currentPageId: typeof progress.currentPageId === 'string' ? progress.currentPageId : null,
          progressPages: progress.pages,
        });

        let hasNewFinished = false;
        for (const entry of snapshot.finishedEntries) {
          const key = `${entry.pageId}:${entry.state.migrationStatus}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hasNewFinished = true;
          patchSavedPageProgress(input.projectKey, entry.pageId, entry.state, input.framerProjectUrl);
        }

        const terminal = runStatus === 'success' || runStatus === 'failed' || runStatus === 'cancelled';
        const nextDone = Math.max(snapshot.done, typeof progress.done === 'number' ? progress.done : 0);
        const nextLabel = progress.summary || progress.currentLabel || '';

        setView((prev) => ({
          ...prev,
          runId,
          currentLabel: nextLabel || prev.currentLabel,
          done: nextDone,
          pageStates: snapshot.pageStates,
          phase: terminal ? (runStatus === 'success' ? 'success' : 'failed') : prev.phase,
          finishedVersion: hasNewFinished ? prev.finishedVersion + 1 : prev.finishedVersion,
        }));

        if (!terminal) return;
        stopped = true;
        stopPoll();
        runningRef.current = false;
        runIdRef.current = null;
        const summary = progress.summary || progress.currentLabel || '轉換已結束';
        setError(typeof data.error === 'string' ? data.error : undefined);
        setEmailError(progress.emailError);
        popupNotice(runStatus === 'success' && !progress.emailError, `${input.siteName} 轉換結果`, summary);
      } finally {
        inFlight = false;
      }
    };

    void poll();
    pollRef.current = window.setInterval(() => {
      void poll();
    }, 2000);
  }, [stopPoll]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (cancelled || !userId || runningRef.current) return;

        const recentCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data: activeRow, error: listErr } = await supabase
          .from('framer_conversion_runs')
          .select('id, project_key, status, progress, page_index, error, updated_at')
          .eq('user_id', userId)
          .in('status', ['queued', 'running'])
          .gte('updated_at', recentCutoff)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled || listErr || !activeRow?.id || runningRef.current) return;

        const { data: payloadRow, error: payloadErr } = await supabase
          .from('framer_conversion_runs')
          .select('payload')
          .eq('id', activeRow.id)
          .maybeSingle();
        if (cancelled || payloadErr || !payloadRow?.payload || runningRef.current) return;

        const payload = payloadRow.payload as {
          projectKey?: string;
          siteName?: string;
          readdyCode?: string;
          framerProjectUrl?: string;
          pages?: Array<{ id: string; path: string }>;
        };
        const pages = Array.isArray(payload.pages) ? payload.pages : [];
        const projectKey = payload.projectKey || String(activeRow.project_key || '');
        const framerProjectUrl = payload.framerProjectUrl || '';
        const siteName = payload.siteName || '未命名網站';
        const progress = (activeRow.progress ?? {}) as {
          currentLabel?: string;
          done?: number;
          currentPageId?: string | null;
          pages?: Array<ServerRunPageRecord | null | undefined>;
        };

        const snapshot = buildServerRunPageStates({
          pages,
          runStatus: String(activeRow.status || 'running'),
          pageIndex: typeof activeRow.page_index === 'number' ? activeRow.page_index : null,
          currentPageId: typeof progress.currentPageId === 'string' ? progress.currentPageId : null,
          progressPages: progress.pages,
        });

        const initialSeen = new Set<string>();
        for (const entry of snapshot.finishedEntries) {
          initialSeen.add(`${entry.pageId}:${entry.state.migrationStatus}`);
          patchSavedPageProgress(projectKey, entry.pageId, entry.state, framerProjectUrl);
        }

        runningRef.current = true;
        cancelRef.current = false;
        runIdRef.current = String(activeRow.id);
        setError(undefined);
        setEmailError(undefined);
        setView({
          phase: 'running',
          runId: String(activeRow.id),
          siteName,
          readdyCode: payload.readdyCode || '',
          projectKey,
          framerProjectUrl,
          currentLabel: progress.currentLabel || `正在進行後台轉換（${snapshot.done}/${pages.length}）`,
          done: Math.max(snapshot.done, typeof progress.done === 'number' ? progress.done : 0),
          total: pages.length,
          pageStates: snapshot.pageStates,
          finishedVersion: snapshot.finishedEntries.length > 0 ? 1 : 0,
        });

        watchServerRun(
          { projectKey, siteName, framerProjectUrl, pages },
          String(activeRow.id),
          initialSeen,
        );
      } catch {
        // ignore if conversion runs table is unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [watchServerRun]);

  const start = useCallback((input: ReaddyConversionRunInput) => {
    if (runningRef.current) {
      toast.message('已有轉換在後台進行');
      return;
    }
    stopPoll();
    runningRef.current = true;
    cancelRef.current = false;
    runIdRef.current = null;
    const localRunId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setError(undefined);
    setEmailError(undefined);
    setView({
      phase: 'running',
      runId: localRunId,
      siteName: input.siteName,
      readdyCode: input.readdyCode,
      projectKey: input.projectKey,
      framerProjectUrl: input.framerProjectUrl,
      currentLabel: `準備重新解析並同步 ${input.pages.length} 個頁面`,
      done: 0,
      total: input.pages.length,
      pageStates: createInitialBackgroundPageStates(input.pages),
      finishedVersion: 0,
    });
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }

    void (async () => {
      try {
        const queued = await enqueueReaddyConversion(input);
        runIdRef.current = queued.run_id;
        if (cancelRef.current) {
          void cancelReaddyConversionRun(queued.run_id).catch(() => undefined);
        }
        setView((prev) => (prev.runId === localRunId ? { ...prev, runId: queued.run_id } : prev));
        toast.message(`已排入伺服器佇列，共 ${input.pages.length} 個頁面將全部重新解析並同步。完成後會彈出通知，並寄結果郵件。`);
        watchServerRun(input, queued.run_id);
      } catch (err) {
        if (!conversionWorkerIsMissing(err)) {
          runningRef.current = false;
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setView((prev) => {
            const cleared: Record<string, BackgroundPageState> = {};
            for (const [pageId, state] of Object.entries(prev.pageStates)) {
              cleared[pageId] =
                state.migrationStatus === 'syncing'
                  ? { ...state, migrationStatus: 'pending' }
                  : state;
            }
            return {
              ...prev,
              phase: 'failed',
              currentLabel: message,
              pageStates: cleared,
            };
          });
          return;
        }
        toast.message(`佇列尚未部署，改在這個瀏覽器重新解析並同步，共 ${input.pages.length} 個頁面，每次同時轉換 ${FRAMER_PAGE_SYNC_CONCURRENCY} 頁。`);
        try {
          const result = await runReaddyConversion(
            input,
            (progress) => applyProgress(input.projectKey, input.framerProjectUrl, progress),
            () => cancelRef.current,
          );
          await finish(input, result, localRunId);
        } catch (fallbackErr) {
          const message = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          await finish(input, {
            kind: 'failed',
            pages: [],
            unstarted: input.pages.length,
            cancelled: false,
            error: message,
          }, localRunId);
        } finally {
          runningRef.current = false;
        }
      }
    })();
  }, [applyProgress, finish, stopPoll, watchServerRun]);

  const cancel = useCallback(() => {
    if (!runningRef.current) return;
    cancelRef.current = true;
    if (runIdRef.current) void cancelReaddyConversionRun(runIdRef.current).catch(() => undefined);
    setView((prev) => ({ ...prev, currentLabel: '正在中止，進行中的頁面寫完後會停下來' }));
  }, []);

  const dismiss = useCallback(() => {
    if (runningRef.current) return;
    setError(undefined);
    setEmailError(undefined);
    setView(idleView);
  }, []);

  const value = useMemo<ReaddyConversionJobView>(
    () => ({
      ...view,
      error,
      emailError,
      start,
      cancel,
      dismiss,
    }),
    [view, error, emailError, start, cancel, dismiss],
  );

  return (
    <ReaddyConversionJobContext.Provider value={value}>
      {children}
    </ReaddyConversionJobContext.Provider>
  );
}

export function useReaddyConversionJob(): ReaddyConversionJobView {
  const ctx = useContext(ReaddyConversionJobContext);
  if (!ctx) {
    throw new Error('useReaddyConversionJob 必須在 ReaddyConversionJobProvider 內使用');
  }
  return ctx;
}
