import {
  createContext,
  useCallback,
  useContext,
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
import { patchSavedPageProgress } from '@/lib/readdyFramerProgress';
import { sendEmail } from '@/lib/resendApi';
import {
  cancelReaddyConversionRun,
  conversionWorkerIsMissing,
  enqueueReaddyConversion,
} from '@/lib/readdyFramerApi';
import type { ReaddyDiscoveredPage } from '@/types/readdyFramer';

export type ReaddyConversionPagePatch = {
  token: number;
  projectKey: string;
  pageId: string;
  page: Partial<ReaddyDiscoveredPage>;
};

export type ReaddyConversionJobView = {
  phase: 'idle' | 'running' | 'success' | 'failed';
  siteName: string;
  readdyCode: string;
  projectKey: string;
  currentLabel: string;
  done: number;
  total: number;
  error?: string;
  emailError?: string;
  pagePatch: ReaddyConversionPagePatch | null;
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
  siteName: string;
  readdyCode: string;
  projectKey: string;
  currentLabel: string;
  done: number;
  total: number;
  pagePatch: ReaddyConversionPagePatch | null;
} = {
  phase: 'idle',
  siteName: '',
  readdyCode: '',
  projectKey: '',
  currentLabel: '',
  done: 0,
  total: 0,
  pagePatch: null,
};

export function ReaddyConversionJobProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState(idleView);
  const [error, setError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const tokenRef = useRef(0);
  const runIdRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const applyProgress = useCallback(
    (projectKey: string, framerProjectUrl: string, progress: ReaddyConversionProgress) => {
      const status = progress.patch?.migrationStatus;
      if (status) {
        patchSavedPageProgress(
          projectKey,
          progress.pageId,
          {
            migrationStatus: status,
            jobId: progress.patch?.jobId,
            sectionCount: progress.patch?.sectionCount,
            framerPageNodeId: progress.patch?.framerPageNodeId,
            lastSyncedAt: progress.patch?.lastSyncedAt,
          },
          framerProjectUrl,
        );
      }
      const finished = status === 'migrated' || status === 'failed';
      tokenRef.current += status ? 1 : 0;
      const token = tokenRef.current;
      setView((prev) => ({
        ...prev,
        currentLabel: progress.message,
        done: finished ? prev.done + 1 : prev.done,
        pagePatch: status
          ? {
              token,
              projectKey,
              pageId: progress.pageId,
              page: progress.patch ?? {},
            }
          : prev.pagePatch,
      }));
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
    setView((prev) => ({
      ...prev,
      phase: result.kind === 'success' ? 'success' : 'failed',
      currentLabel: summary,
      done: result.pages.length,
    }));
  }, []);

  const stopPoll = useCallback(() => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const watchServerRun = useCallback((input: ReaddyConversionRunInput, runId: string) => {
    const seen = new Set<string>();
    pollRef.current = window.setInterval(() => {
      void (async () => {
        const { data, error: readError } = await supabase
          .from('framer_conversion_runs')
          .select('status, progress, error')
          .eq('id', runId)
          .maybeSingle();
        if (readError || !data) return;
        const progress = (data.progress ?? {}) as {
          currentLabel?: string;
          done?: number;
          pages?: Array<{
            pageId?: string;
            status?: 'migrated' | 'failed';
            jobId?: string | null;
            sectionCount?: number;
            framerPageNodeId?: string | null;
            lastSyncedAt?: string | null;
            error?: string;
          }>;
          emailError?: string;
          summary?: string;
        };
        for (const page of progress.pages ?? []) {
          if (!page.pageId || !page.status) continue;
          const key = `${page.pageId}:${page.status}`;
          if (seen.has(key)) continue;
          seen.add(key);
          applyProgress(input.projectKey, input.framerProjectUrl, {
            pageId: page.pageId,
            index: seen.size - 1,
            total: input.pages.length,
            message: progress.currentLabel || page.pageId,
            patch: {
              migrationStatus: page.status === 'migrated' ? 'migrated' : 'failed',
              jobId: page.jobId,
              sectionCount: page.sectionCount,
              framerPageNodeId: page.framerPageNodeId,
              lastSyncedAt: page.lastSyncedAt,
            },
          });
        }
        const terminal = data.status === 'success' || data.status === 'failed' || data.status === 'cancelled';
        setView((prev) => ({
          ...prev,
          currentLabel: progress.summary || progress.currentLabel || prev.currentLabel,
          phase: terminal ? (data.status === 'success' ? 'success' : 'failed') : prev.phase,
        }));
        if (!terminal) return;
        stopPoll();
        runningRef.current = false;
        runIdRef.current = null;
        const summary = progress.summary || progress.currentLabel || '轉換已結束';
        setError(typeof data.error === 'string' ? data.error : undefined);
        setEmailError(progress.emailError);
        popupNotice(data.status === 'success' && !progress.emailError, `${input.siteName} 轉換結果`, summary);
      })();
    }, 2000);
  }, [applyProgress, stopPoll]);

  const start = useCallback((input: ReaddyConversionRunInput) => {
    if (runningRef.current) {
      toast.message('已有轉換在後台進行');
      return;
    }
    runningRef.current = true;
    cancelRef.current = false;
    runIdRef.current = null;
    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setError(undefined);
    setEmailError(undefined);
    setView({
      phase: 'running',
      siteName: input.siteName,
      readdyCode: input.readdyCode,
      projectKey: input.projectKey,
      currentLabel: `準備轉換 ${input.pages.length} 個頁面`,
      done: 0,
      total: input.pages.length,
      pagePatch: null,
    });
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }

    void (async () => {
      try {
        const queued = await enqueueReaddyConversion(input);
        runIdRef.current = queued.run_id;
        toast.message(`已排入伺服器佇列，共 ${input.pages.length} 個頁面。完成後會彈出通知，並寄結果郵件。`);
        watchServerRun(input, queued.run_id);
      } catch (err) {
        if (!conversionWorkerIsMissing(err)) {
          runningRef.current = false;
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setView((prev) => ({ ...prev, phase: 'failed', currentLabel: message }));
          return;
        }
        toast.message(`佇列尚未部署，改在這個瀏覽器轉換，共 ${input.pages.length} 個頁面，每次同時轉換 ${FRAMER_PAGE_SYNC_CONCURRENCY} 頁。`);
        try {
          const result = await runReaddyConversion(
            input,
            (progress) => applyProgress(input.projectKey, input.framerProjectUrl, progress),
            () => cancelRef.current,
          );
          await finish(input, result, runId);
        } catch (fallbackErr) {
          const message = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          await finish(input, {
            kind: 'failed',
            pages: [],
            unstarted: input.pages.length,
            cancelled: false,
            error: message,
          }, runId);
        } finally {
          runningRef.current = false;
        }
      }
    })();
  }, [applyProgress, finish, watchServerRun]);

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
