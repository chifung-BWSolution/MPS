import {
  assembleReaddyPageCode,
} from '@/lib/readdyProjectAnalyzer';
import {
  fetchGitHubPageBundle,
  isFramerSessionLimitError,
  parseReaddyToIr,
  syncFramerStep,
  type FramerMcpSessionHint,
} from '@/lib/readdyFramerApi';
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

/** Framer 帳號同時工作階段上限。每條連線會重複使用，不會每頁重開。 */
export const FRAMER_PAGE_SYNC_CONCURRENCY = 9;

export async function runReaddyConversion(
  input: ReaddyConversionRunInput,
  report: (progress: ReaddyConversionProgress) => void,
  isCancelled: () => boolean,
): Promise<ReaddyConversionRunResult> {
  const total = input.pages.length;
  const workerCount = Math.min(FRAMER_PAGE_SYNC_CONCURRENCY, total);
  const results: Array<ReaddyConversionPageResult | undefined> = new Array(total);
  const queue = input.pages.map((_, index) => index);
  const slotState = Array.from({ length: workerCount }, () => ({
    session: null as FramerMcpSessionHint | null,
    alive: true,
  }));
  let cancelled = false;

  async function convertOnePage(
    index: number,
    slot: number,
    session: FramerMcpSessionHint | null,
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
      if (!loaded.code.trim()) {
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

      const step0 = await syncFramerStep({
        job_id: parsed.job_id,
        step_index: 0,
        framer_project_url: input.framerProjectUrl.trim(),
        page_path: page.path,
        page_title: page.title,
        session_slot: slot,
        mcp_session: activeMcpSession,
      });
      activeMcpSession = step0.mcp_session ?? activeMcpSession;

      let framerPageNodeId: string | null = step0.framer_page_node_id ?? null;
      for (let step = 0; step < sectionCount; step += 1) {
        if (isCancelled()) {
          cancelled = true;
          throw new Error('已中止');
        }
        const section = parsed.ir_payload.sections[step];
        report({
          pageId: page.id,
          index,
          total,
          message: `寫入 ${page.path}（${step + 1}/${sectionCount}）${section?.name ? `：${section.name}` : ''}`,
        });
        const synced = await syncFramerStep({
          job_id: parsed.job_id,
          step_index: step + 1,
          framer_project_url: input.framerProjectUrl.trim(),
          page_path: page.path,
          page_title: page.title,
          session_slot: slot,
          mcp_session: activeMcpSession,
        });
        activeMcpSession = synced.mcp_session ?? activeMcpSession;
        framerPageNodeId = synced.framer_page_node_id ?? framerPageNodeId;
      }

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
      report({
        pageId: page.id,
        index,
        total,
        message: `${page.path} 失敗：${message}`,
        patch: { migrationStatus: 'failed' },
      });
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

  async function worker(slot: number) {
    const state = slotState[slot];
    while (state.alive && !cancelled) {
      if (isCancelled()) {
        cancelled = true;
        break;
      }
      const index = queue.shift();
      if (index === undefined) break;
      const hadSession = Boolean(state.session);
      const outcome = await convertOnePage(index, slot, state.session);
      if (outcome.session) state.session = outcome.session;
      const openRejected = outcome.limit && !hadSession && !outcome.session;
      if (openRejected) {
        state.alive = false;
        const peerAlive = slotState.some((peer, peerIndex) => peerIndex !== slot && peer.alive);
        if (peerAlive) queue.unshift(index);
        else results[index] = outcome.result;
        break;
      }
      results[index] = outcome.result;
      if (outcome.cancelled || outcome.limit) {
        state.alive = false;
        break;
      }
    }
  }

  if (workerCount > 0) {
    await Promise.all(Array.from({ length: workerCount }, (_, slot) => worker(slot)));
  }

  const pages = results.filter((row): row is ReaddyConversionPageResult => Boolean(row));
  const unstarted = queue.length;

  const failed = pages.some((page) => page.status === 'failed') || cancelled || unstarted > 0;
  const error = cancelled
    ? '已中止'
    : pages.find((page) => page.status === 'failed')?.error;

  return {
    kind: failed ? 'failed' : 'success',
    pages,
    unstarted,
    cancelled,
    error: failed ? error : undefined,
  };
}
