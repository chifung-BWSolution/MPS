import {
  assembleReaddyPageCode,
} from '@/lib/readdyProjectAnalyzer';
import {
  fetchGitHubPageBundle,
  isFramerSessionLimitError,
  parseReaddyToIr,
  publishFramerProject,
  syncFramerPage,
  type FramerMcpSessionHint,
} from '@/lib/readdyFramerApi';
import { formatFramerPublishNote } from '@/lib/framerPublish';
import type { ReaddyConversionPageResult } from '@/lib/readdyConversionMail';
import type {
  GitHubRepoMeta,
  GridConfig,
  ReaddyDiscoveredPage,
  ReaddyProjectAnalysis,
  SourceType,
} from '@/types/readdyFramer';

export type ReaddyConversionRunInput = {
  projectKey: string;
  siteName: string;
  readdyCode: string;
  framerProjectUrl: string;
  sourceType: SourceType;
  gridConfig: GridConfig;
  analysis: ReaddyProjectAnalysis;
  fileMap: Record<string, string>;
  githubRepoUrl: string;
  githubAllPaths: string[];
  pages: ReaddyDiscoveredPage[];
};

export type ReaddyConversionProgress = {
  pageId: string;
  index: number;
  total: number;
  message: string;
  patch?: Partial<ReaddyDiscoveredPage>;
};

export type ReaddyConversionRunResult = {
  kind: 'success' | 'failed';
  pages: ReaddyConversionPageResult[];
  unstarted: number;
  cancelled: boolean;
  error?: string;
  publishNote?: string;
};

async function loadPageCode(
  input: ReaddyConversionRunInput,
  page: ReaddyDiscoveredPage,
): Promise<{ code: string; includedFiles: string[]; repoMeta: GitHubRepoMeta | null }> {
  if (input.sourceType === 'github' && input.analysis.githubMeta) {
    const res = await fetchGitHubPageBundle({
      repo_url: input.githubRepoUrl,
      branch: input.analysis.githubMeta.branch,
      page,
      shared_files: input.analysis.sharedFiles,
      all_paths: input.githubAllPaths,
    });
    return { code: res.code, includedFiles: res.included_files, repoMeta: res.repo_meta };
  }
  const assembled = assembleReaddyPageCode(page, input.fileMap, input.analysis);
  return { code: assembled.code, includedFiles: assembled.includedFiles, repoMeta: null };
}

/** Leave slot 0 for a manual Workbench sync. Background workers use slots 1–6. */
export const FRAMER_PAGE_SYNC_CONCURRENCY = 6;
/** Framer keeps a rejected open counted for 360 seconds. */
export const FRAMER_SESSION_LIMIT_RETRY_MS = 360_000;

export async function runReaddyConversion(
  input: ReaddyConversionRunInput,
  report: (progress: ReaddyConversionProgress) => void,
  isCancelled: () => boolean,
): Promise<ReaddyConversionRunResult> {
  const total = input.pages.length;
  const workerCount = Math.min(FRAMER_PAGE_SYNC_CONCURRENCY, total);
  const results: Array<ReaddyConversionPageResult | undefined> = new Array(total);
  type QueuedPage = { index: number; attempt: number };
  const ready: QueuedPage[] = input.pages.map((_, index) => ({ index, attempt: 0 }));
  const deferred: Array<QueuedPage & { notBefore: number }> = [];
  let inflight = 0;
  const waiters: Array<() => void> = [];
  const slotState = Array.from({ length: workerCount }, () => ({
    session: null as FramerMcpSessionHint | null,
  }));
  let cancelled = false;

  function wakeWaiters() {
    const pending = waiters.splice(0);
    for (const finish of pending) finish();
  }

  function takeJob(): QueuedPage | null {
    const now = Date.now();
    for (let i = deferred.length - 1; i >= 0; i -= 1) {
      if (deferred[i].notBefore <= now) {
        ready.push({ index: deferred[i].index, attempt: deferred[i].attempt });
        deferred.splice(i, 1);
      }
    }
    return ready.shift() ?? null;
  }

  function subscribe(): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        const at = waiters.indexOf(finish);
        if (at >= 0) waiters.splice(at, 1);
        resolve();
      };
      waiters.push(finish);
    });
  }

  async function convertOnePage(
    index: number,
    slot: number,
    session: FramerMcpSessionHint | null,
    sessionLimitIsFinal: boolean,
  ): Promise<{
    result: ReaddyConversionPageResult;
    session: FramerMcpSessionHint | null;
    limit: boolean;
    cancelled: boolean;
  }> {
    const page = input.pages[index];
    let activeMcpSession = session;
    report({
      pageId: page.id,
      index,
      total,
      message: `正在轉換 ${page.path}（${index + 1}/${total}，同時 ${workerCount} 頁）`,
      patch: { migrationStatus: 'syncing' },
    });

    try {
      const loaded = await loadPageCode(input, page);
      if (!loaded.code.trim() && !input.analysis.sourceOrigin?.trim()) {
        throw new Error('這個頁面沒有可解析的代碼');
      }
      if (isCancelled()) {
        cancelled = true;
        throw new Error('已中止');
      }

      const parsed = await parseReaddyToIr({
        framer_project_url: input.framerProjectUrl.trim(),
        source_type: input.sourceType,
        github_repo_meta: input.sourceType === 'github' ? loaded.repoMeta : null,
        storage_bundle_path: input.analysis.storageBundlePath ?? null,
        grid_config: input.gridConfig,
        raw_readdy_code: loaded.code,
        tailwind_config: input.analysis.tailwindConfig ?? null,
        asset_url_map: input.analysis.assetUrlMap ?? {},
        page_meta: {
          path: page.path,
          title: page.title,
          locale: page.locale,
          pageKind: page.pageKind,
          sourceFile: page.sourceFile,
          includedFiles: loaded.includedFiles,
        },
        css_tokens: input.analysis.cssTokens,
        project_name: input.siteName,
        source_origin: input.analysis.sourceOrigin,
      });

      const sectionCount = parsed.ir_payload.sections.length;
      report({
        pageId: page.id,
        index,
        total,
        message: `${page.path} 已解析 ${sectionCount} 個區塊`,
        patch: {
          migrationStatus: 'parsed',
          jobId: parsed.job_id,
          sectionCount,
        },
      });

      if (sectionCount === 0) {
        throw new Error('解析後沒有可寫入的區塊');
      }

      if (isCancelled()) {
        cancelled = true;
        throw new Error('已中止');
      }
      report({
        pageId: page.id,
        index,
        total,
        message: `一次寫入 ${page.path} 的 ${sectionCount} 個區塊`,
        patch: {
          migrationStatus: 'syncing',
          jobId: parsed.job_id,
          sectionCount,
        },
      });
      const synced = await syncFramerPage({
        job_id: parsed.job_id,
        framer_project_url: input.framerProjectUrl.trim(),
        page_path: page.path,
        page_title: page.title,
        session_slot: slot,
        mcp_session: activeMcpSession,
        publish: false,
      });
      activeMcpSession = synced.mcp_session ?? activeMcpSession;
      const framerPageNodeId = synced.framer_page_node_id ?? null;

      const lastSyncedAt = new Date().toISOString();
      report({
        pageId: page.id,
        index,
        total,
        message: `${page.path} 已寫入 Framer`,
        patch: {
          migrationStatus: 'migrated',
          jobId: parsed.job_id,
          sectionCount,
          framerPageNodeId,
          lastSyncedAt,
        },
      });
      return {
        result: {
          path: page.path,
          title: page.title,
          status: 'migrated',
          sectionCount,
        },
        session: activeMcpSession,
        limit: false,
        cancelled: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stopped = message === '已中止' || cancelled;
      const hitSessionLimit = isFramerSessionLimitError(message);
      if (stopped) cancelled = true;
      if (hitSessionLimit && !sessionLimitIsFinal && !stopped) {
        report({
          pageId: page.id,
          index,
          total,
          message: `${page.path} 已達 Framer 工作階段上限，360 秒後再試`,
          patch: { migrationStatus: 'pending' },
        });
      } else {
        report({
          pageId: page.id,
          index,
          total,
          message: `${page.path} 失敗：${message}`,
          patch: { migrationStatus: 'failed' },
        });
      }
      return {
        result: {
          path: page.path,
          title: page.title,
          status: 'failed',
          sectionCount: page.sectionCount ?? 0,
          error: message,
        },
        session: activeMcpSession,
        limit: hitSessionLimit,
        cancelled: stopped,
      };
    }
  }

  async function worker(workerIndex: number) {
    const slot = workerIndex + 1;
    const state = slotState[workerIndex];
    while (!cancelled) {
      if (isCancelled()) {
        cancelled = true;
        wakeWaiters();
        break;
      }
      const job = takeJob();
      if (!job) {
        if (ready.length === 0 && deferred.length === 0 && inflight === 0) break;
        const until = deferred.reduce((min, item) => Math.min(min, item.notBefore), Number.POSITIVE_INFINITY);
        const waitMs = Math.min(1000, Math.max(0, (Number.isFinite(until) ? until : Date.now() + 1000) - Date.now()));
        const waiter = subscribe();
        if (ready.length > 0 || deferred.some((item) => item.notBefore <= Date.now())) {
          wakeWaiters();
          continue;
        }
        if (ready.length === 0 && deferred.length === 0 && inflight === 0) {
          wakeWaiters();
          break;
        }
        await Promise.race([
          waiter,
          new Promise<void>((resolve) => {
            setTimeout(resolve, waitMs);
          }),
        ]);
        continue;
      }
      inflight += 1;
      const outcome = await convertOnePage(job.index, slot, state.session, job.attempt >= 1);
      inflight -= 1;
      if (outcome.session) state.session = outcome.session;
      if (outcome.cancelled) {
        cancelled = true;
        results[job.index] = outcome.result;
        wakeWaiters();
        break;
      }
      if (outcome.limit && job.attempt < 1) {
        state.session = null;
        deferred.push({
          index: job.index,
          attempt: job.attempt + 1,
          notBefore: Date.now() + FRAMER_SESSION_LIMIT_RETRY_MS,
        });
        wakeWaiters();
        continue;
      }
      results[job.index] = outcome.result;
      wakeWaiters();
    }
  }

  if (workerCount > 0) {
    await Promise.all(Array.from({ length: workerCount }, (_, workerIndex) => worker(workerIndex)));
  }

  const pages = results.filter((row): row is ReaddyConversionPageResult => Boolean(row));
  const unstarted = total - pages.length;

  const failed = pages.some((page) => page.status === 'failed') || cancelled || unstarted > 0;
  const error = cancelled
    ? '已中止'
    : pages.find((page) => page.status === 'failed')?.error;

  let publishNote: string | undefined;
  if (!cancelled && pages.some((page) => page.status === 'migrated')) {
    try {
      const published = await publishFramerProject({
        framer_project_url: input.framerProjectUrl.trim(),
        session_slot: 1,
        mcp_session: slotState[0]?.session ?? null,
      });
      publishNote = formatFramerPublishNote(published.publish) ?? undefined;
    } catch (err) {
      publishNote = `Publish 失敗：${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return {
    kind: failed ? 'failed' : 'success',
    pages,
    unstarted,
    cancelled,
    error: failed ? error : undefined,
    publishNote,
  };
}
