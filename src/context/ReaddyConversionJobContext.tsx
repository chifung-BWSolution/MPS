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
import {
  buildReaddyConversionResultEmail,
  hongKongDateLabel,
  READDY_CONVERSION_RESULT_TO,
  type ReaddyConversionMailInput,
} from '@/lib/readdyConversionMail';
import {
  runReaddyConversion,
  type ReaddyConversionProgress,
  type ReaddyConversionRunInput,
  type ReaddyConversionRunResult,
} from '@/lib/readdyConversionRun';
import { patchSavedPageProgress } from '@/lib/readdyFramerProgress';
import { sendEmail } from '@/lib/resendApi';
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

  const applyProgress = useCallback((projectKey: string, progress: ReaddyConversionProgress) => {
    const status = progress.patch?.migrationStatus;
    if (status) {
      patchSavedPageProgress(projectKey, progress.pageId, {
        migrationStatus: status,
        jobId: progress.patch?.jobId,
        sectionCount: progress.patch?.sectionCount,
        framerPageNodeId: progress.patch?.framerPageNodeId,
        lastSyncedAt: progress.patch?.lastSyncedAt,
      });
    }
    const finished = status === 'migrated' || status === 'failed';
    tokenRef.current += status ? 1 : 0;
    const token = tokenRef.current;
    setView((prev) => ({
      ...prev,
      currentLabel: progress.message,
      done: finished ? progress.index + 1 : prev.done,
      pagePatch: status
        ? {
            token,
            projectKey,
            pageId: progress.pageId,
            page: progress.patch ?? {},
          }
        : prev.pagePatch,
    }));
  }, []);

  const finish = useCallback(async (input: ReaddyConversionRunInput, result: ReaddyConversionRunResult) => {
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
    };
    const email = buildReaddyConversionResultEmail(mailInput);
    let mailError: string | undefined;
    try {
      await sendEmail({
        to: READDY_CONVERSION_RESULT_TO,
        subject: email.subject,
        html: email.html,
        text: email.text,
        idempotencyKey: `readdy-conversion/${input.projectKey}/${input.readdyCode}/${Date.now()}`.slice(0, 256),
      });
    } catch (err) {
      mailError = err instanceof Error ? err.message : String(err);
    }

    const migrated = result.pages.filter((page) => page.status === 'migrated').length;
    const failedCount = result.pages.filter((page) => page.status === 'failed').length;
    const summary = mailError
      ? `完成 ${migrated} 頁、失敗 ${failedCount} 頁。結果郵件未能寄出：${mailError}`
      : `完成 ${migrated} 頁、失敗 ${failedCount} 頁。結果郵件已寄到 ${READDY_CONVERSION_RESULT_TO}`;
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

  const start = useCallback((input: ReaddyConversionRunInput) => {
    if (runningRef.current) {
      toast.message('已有轉換在後台進行');
      return;
    }
    runningRef.current = true;
    cancelRef.current = false;
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
    toast.message(`已轉入後台，共 ${input.pages.length} 個頁面。完成後會彈出通知，並寄結果郵件。`);
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }

    void (async () => {
      try {
        const result = await runReaddyConversion(
          input,
          (progress) => applyProgress(input.projectKey, progress),
          () => cancelRef.current,
        );
        await finish(input, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await finish(input, {
          kind: 'failed',
          pages: [],
          unstarted: input.pages.length,
          cancelled: false,
          error: message,
        });
      } finally {
        runningRef.current = false;
      }
    })();
  }, [applyProgress, finish]);

  const cancel = useCallback(() => {
    if (!runningRef.current) return;
    cancelRef.current = true;
    setView((prev) => ({ ...prev, currentLabel: '正在中止，目前這頁寫完後會停下來' }));
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
