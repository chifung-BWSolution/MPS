import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Code2,
  Grid3X3,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_FRAMER_PROJECT_URL,
  DEFAULT_GITHUB_BRANCH,
  DEFAULT_GRID_CONFIG,
  SAMPLE_READDY_TSX,
} from '@/lib/readdyFramerSample';
import {
  FRAMER_OAUTH_MESSAGE,
  analyzeGitHubProject,
  createFramerProject,
  disconnectFramerOAuth,
  fetchGitHubPageBundle,
  getFramerOAuthStatus,
  isValidFramerProjectUrl,
  listFramerCatalog,
  listGitHubBranches,
  listGitHubRepos,
  listRecentFramerJobs,
  parseReaddyToIr,
  processUploadedReaddyFile,
  saveTeamGitHubToken,
  startFramerOAuth,
  syncFramerStep,
} from '@/lib/readdyFramerApi';
import {
  analyzeReaddyFileMap,
  assembleReaddyPageCode,
} from '@/lib/readdyProjectAnalyzer';
import { extractReaddyCode } from '@/lib/readdyConversionMail';
import { loadSavedPageProgress, savePageProgress } from '@/lib/readdyFramerProgress';
import { useReaddyConversionJob } from '@/context/ReaddyConversionJobContext';
import type {
  ExecutionStageState,
  FramerIrPayload,
  FramerOAuthStatus,
  FramerProjectSummary,
  FramerSyncJob,
  FramerWorkspaceSummary,
  GitHubRepoMeta,
  GitHubRepoSummary,
  GridConfig,
  ReaddyDiscoveredPage,
  ReaddyPageMigrationStatus,
  ReaddyProjectAnalysis,
  SourceType,
  WorkbenchLogEntry,
} from '@/types/readdyFramer';
import { WorkbenchHeader } from './WorkbenchHeader';
import { SourceConfigPanel } from './SourceConfigPanel';
import { PageInventoryPanel } from './PageInventoryPanel';
import { GridAnchorPanel } from './GridAnchorPanel';
import { LayersPanel } from './LayersPanel';
import { GridCanvasPreview } from './GridCanvasPreview';
import { ExecutionProgressModal } from './ExecutionProgressModal';
import { FaithfulHomeFrame } from './site/ReaddySitePreview';

function pickLandingPage(pages: ReaddyDiscoveredPage[]): ReaddyDiscoveredPage | undefined {
  return pages.find((page) => page.path === '/') || pages.find((page) => page.pageKind === 'home') || pages[0];
}

function createInitialStages(): ExecutionStageState[] {
  return [
    { key: 'ast', code: '01', label: 'AST 結構解析', progress: 0, status: 'idle', detail: '等待解析當前頁面' },
    { key: 'grid', code: '02', label: '12列網格對齊', progress: 0, status: 'idle', detail: '等待網格鎖定' },
    { key: 'tokens', code: '03', label: 'Token 樣式映射', progress: 0, status: 'idle', detail: '等待樣式提取' },
    { key: 'mcp', code: '04', label: 'MCP 畫布寫入', progress: 0, status: 'idle', detail: '等待 Framer 同步' },
  ];
}

export function ReaddyFramerWorkbench() {
  // OAuth & History
  const [oauthStatus, setOauthStatus] = useState<FramerOAuthStatus | null>(null);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [recentJobs, setRecentJobs] = useState<FramerSyncJob[]>([]);
  const oauthPopupRef = useRef<Window | null>(null);

  // Step 01 Source Config
  const [framerProjectUrl, setFramerProjectUrl] = useState(DEFAULT_FRAMER_PROJECT_URL);
  const [framerProjects, setFramerProjects] = useState<FramerProjectSummary[]>([]);
  const [framerWorkspaces, setFramerWorkspaces] = useState<FramerWorkspaceSummary[]>([]);
  const [framerCatalogLoading, setFramerCatalogLoading] = useState(false);
  const [framerCatalogError, setFramerCatalogError] = useState<string | null>(null);
  const [framerCatalogTruncated, setFramerCatalogTruncated] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>('github');
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [githubRepos, setGithubRepos] = useState<GitHubRepoSummary[]>([]);
  const [githubReposLoading, setGithubReposLoading] = useState(false);
  const [githubReposError, setGithubReposError] = useState<string | null>(null);
  const [githubBranch, setGithubBranch] = useState(DEFAULT_GITHUB_BRANCH);
  const [githubBranches, setGithubBranches] = useState<string[]>([DEFAULT_GITHUB_BRANCH]);
  const [githubBranchesLoading, setGithubBranchesLoading] = useState(false);
  const [githubAllPaths, setGithubAllPaths] = useState<string[]>([]);
  const [githubRepoMeta, setGithubRepoMeta] = useState<GitHubRepoMeta | null>(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [pasteCode, setPasteCode] = useState(SAMPLE_READDY_TSX);
  const githubRepoUrlRef = useRef(githubRepoUrl);
  githubRepoUrlRef.current = githubRepoUrl;
  const branchReqSeqRef = useRef(0);

  // Project Analysis & Page Inventory (Step 02)
  const [analysis, setAnalysis] = useState<ReaddyProjectAnalysis | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [projectFileMap, setProjectFileMap] = useState<Record<string, string>>({});
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [loadingPageId, setLoadingPageId] = useState<string | null>(null);

  // Active Page Assembled Code & Step 03 State
  const [rawCode, setRawCode] = useState(SAMPLE_READDY_TSX);
  const [codeSummary, setCodeSummary] = useState<string>('');
  const [includedFiles, setIncludedFiles] = useState<string[]>([]);
  const [toolDrawer, setToolDrawer] = useState<'grid' | 'code' | null>(null);

  const [gridConfig, setGridConfig] = useState<GridConfig>(DEFAULT_GRID_CONFIG);
  const [gridConfirmed, setGridConfirmed] = useState(true);
  const [highlightConfirmWarning, setHighlightConfirmWarning] = useState(false);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [irPayload, setIrPayload] = useState<FramerIrPayload | null>(null);
  const [parsing, setParsing] = useState(false);
  const [pageRailNarrow, setPageRailNarrow] = useState(false);
  const [railWidePx, setRailWidePx] = useState<number | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const pageRailNarrowRef = useRef(false);
  const progressOpenTimerRef = useRef<number | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [showGridOverlay, setShowGridOverlay] = useState(true);
  const [expandedCanvas, setExpandedCanvas] = useState(false);
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Progress Modal state
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [stages, setStages] = useState<ExecutionStageState[]>(createInitialStages);
  const [logs, setLogs] = useState<WorkbenchLogEntry[]>([]);

  const appendLogs = useCallback((entries: WorkbenchLogEntry[]) => {
    setLogs((prev) => [...prev, ...entries]);
  }, []);

  const pushLog = useCallback(
    (level: WorkbenchLogEntry['level'], stage: string, message: string) => {
      appendLogs([{ ts: new Date().toISOString(), level, stage, message }]);
    },
    [appendLogs],
  );

  const refreshOAuthStatus = useCallback(async () => {
    try {
      const status = await getFramerOAuthStatus();
      setOauthStatus(status);
    } catch {
      // ignore initial status fetch failure if offline/unconfigured
    }
  }, []);

  const refreshFramerCatalog = useCallback(async () => {
    setFramerCatalogLoading(true);
    setFramerCatalogError(null);
    try {
      const catalog = await listFramerCatalog();
      setFramerProjects(catalog.projects);
      setFramerWorkspaces(catalog.workspaces);
      setFramerCatalogTruncated(Boolean(catalog.truncated));
    } catch (error) {
      setFramerCatalogError(error instanceof Error ? error.message : '無法讀取 Framer 專案');
    } finally {
      setFramerCatalogLoading(false);
    }
  }, []);

  const handleCreateFramerProject = useCallback(async (input: { title: string; workspaceId: string }) => {
    try {
      const created = await createFramerProject({
        title: input.title,
        workspace_id: input.workspaceId,
      });
      const workspace = framerWorkspaces.find((item) => item.id === input.workspaceId);
      const project: FramerProjectSummary = {
        ...created,
        workspaceId: created.workspaceId || input.workspaceId,
        workspaceName: created.workspaceName || workspace?.name || null,
      };
      setFramerProjects((prev) => [project, ...prev.filter((item) => item.id !== project.id)]);
      setFramerProjectUrl(project.url);
      toast.success(`已建立 Framer 專案「${project.title}」`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '建立 Framer 專案失敗');
      throw error;
    }
  }, [framerWorkspaces]);

  const refreshHistory = useCallback(async () => {
    try {
      const jobs = await listRecentFramerJobs(25);
      setRecentJobs(jobs);
    } catch {
      // ignore if migration not pushed yet
    }
  }, []);

  const measureRailWidth = useCallback(() => {
    const el = splitRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const next = Math.round(Math.min(560, Math.max(360, w * 0.34)));
    setRailWidePx((prev) => (prev === next ? prev : next));
  }, []);

  useLayoutEffect(() => {
    measureRailWidth();
  }, [measureRailWidth]);

  useEffect(() => {
    const el = splitRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => measureRailWidth());
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureRailWidth]);

  const narrowPageRail = () => {
    if (pageRailNarrowRef.current) return;
    pageRailNarrowRef.current = true;
    setPageRailNarrow(true);
  };

  const expandPageRail = () => {
    if (!pageRailNarrowRef.current) return;
    pageRailNarrowRef.current = false;
    setPageRailNarrow(false);
  };

  useEffect(() => {
    return () => {
      if (progressOpenTimerRef.current) window.clearTimeout(progressOpenTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void refreshOAuthStatus();
    void refreshHistory();
  }, [refreshOAuthStatus, refreshHistory]);

  useEffect(() => {
    if (!oauthStatus?.connected) return;
    void refreshFramerCatalog();
  }, [oauthStatus?.connected, refreshFramerCatalog]);

  // Listen for Framer OAuth popup completion
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; ok?: boolean; message?: string } | null;
      if (!data || data.type !== FRAMER_OAUTH_MESSAGE) return;
      setOauthConnecting(false);
      if (data.ok) {
        toast.success(data.message || 'Framer MCP 授權完成');
        pushLog('success', 'mcp', '團隊共用 Framer MCP OAuth 授權完成');
        void refreshOAuthStatus();
      } else {
        toast.error(data.message || 'Framer MCP 授權失敗');
        pushLog('error', 'mcp', data.message || 'Framer MCP 授權失敗');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pushLog, refreshOAuthStatus]);

  const handleConnectFramer = async () => {
    setOauthConnecting(true);
    try {
      const { authorization_url } = await startFramerOAuth();
      const popup = window.open(
        authorization_url,
        'mps-framer-oauth',
        'width=540,height=700,menubar=no,toolbar=no,status=no',
      );
      if (!popup) {
        setOauthConnecting(false);
        toast.error('瀏覽器封鎖了授權彈窗，請允許彈出視窗後再試。');
        return;
      }
      oauthPopupRef.current = popup;
      const poll = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(poll);
          setOauthConnecting(false);
          void refreshOAuthStatus();
        }
      }, 600);
    } catch (err) {
      setOauthConnecting(false);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      pushLog('error', 'mcp', msg);
    }
  };

  const handleDisconnectFramer = async () => {
    try {
      const next = await disconnectFramerOAuth();
      setOauthStatus(next);
      toast.message('已中斷團隊 Framer MCP 連線');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const loadBranchesForRepo = useCallback(
    async (repoUrl: string, fallbackBranch = DEFAULT_GITHUB_BRANCH) => {
      const seq = ++branchReqSeqRef.current;
      setGithubBranchesLoading(true);
      try {
        const res = await listGitHubBranches({ repo_url: repoUrl });
        if (seq !== branchReqSeqRef.current) return;
        const nextBranches = res.branches.length > 0 ? res.branches : [fallbackBranch];
        setGithubBranches(nextBranches);
        setGithubBranch((prev) =>
          nextBranches.includes(prev) ? prev : res.default_branch || fallbackBranch,
        );
      } catch {
        // keep fallback branch list silently
      } finally {
        if (seq === branchReqSeqRef.current) {
          setGithubBranchesLoading(false);
        }
      }
    },
    [],
  );

  const refreshGitHubRepos = useCallback(
    async (opts?: { silent?: boolean }) => {
      setGithubReposLoading(true);
      setGithubReposError(null);
      try {
        const res = await listGitHubRepos();
        if (!res.configured) {
          setGithubRepos([]);
          setGithubRepoUrl('');
          setGithubBranches([DEFAULT_GITHUB_BRANCH]);
          setGithubBranch(DEFAULT_GITHUB_BRANCH);
          return;
        }
        setGithubRepos(res.repos);
        const currentUrl = githubRepoUrlRef.current;
        const currentMatch = res.repos.find((r) => r.html_url === currentUrl);
        if (res.repos.length === 0) {
          setGithubRepoUrl('');
          setGithubBranches([DEFAULT_GITHUB_BRANCH]);
          setGithubBranch(DEFAULT_GITHUB_BRANCH);
        } else if (!currentMatch) {
          const first = res.repos[0];
          const defBranch = first.default_branch || DEFAULT_GITHUB_BRANCH;
          setGithubRepoUrl(first.html_url);
          setGithubBranch(defBranch);
          setGithubBranches([defBranch]);
          void loadBranchesForRepo(first.html_url, defBranch);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setGithubReposError(msg);
        if (!opts?.silent) {
          toast.error(msg);
        }
      } finally {
        setGithubReposLoading(false);
      }
    },
    [loadBranchesForRepo],
  );

  const handleSelectGitHubRepo = useCallback(
    (repo: GitHubRepoSummary) => {
      const defBranch = repo.default_branch || DEFAULT_GITHUB_BRANCH;
      setGithubRepoUrl(repo.html_url);
      setGithubBranch(defBranch);
      setGithubBranches([defBranch]);
      void loadBranchesForRepo(repo.html_url, defBranch);
    },
    [loadBranchesForRepo],
  );

  useEffect(() => {
    if (sourceType !== 'github') return;
    if (oauthStatus?.github_configured) {
      void refreshGitHubRepos({ silent: true });
    } else if (oauthStatus && !oauthStatus.github_configured) {
      setGithubRepos([]);
      setGithubReposError(null);
    }
  }, [sourceType, oauthStatus?.github_configured, oauthStatus, refreshGitHubRepos]);

  const handleSaveTeamGitHubToken = async (token: string) => {
    const res = await saveTeamGitHubToken(token);
    setOauthStatus(res);
    if (token.trim()) {
      toast.success(
        `團隊 GitHub Token 已驗證並儲存${res.github_login ? ` (@${res.github_login})` : ''}`,
      );
      void refreshGitHubRepos({ silent: false });
    } else {
      toast.message('已清除儲存的團隊 GitHub Token');
      setGithubRepos([]);
      setGithubRepoUrl('');
      setGithubReposError(null);
      setGithubBranches([DEFAULT_GITHUB_BRANCH]);
      setGithubBranch(DEFAULT_GITHUB_BRANCH);
    }
  };

  const hydrateAnalysisWithProgress = useCallback(
    (rawAnalysis: ReaddyProjectAnalysis, jobs: FramerSyncJob[]): ReaddyProjectAnalysis => {
      const saved = loadSavedPageProgress(rawAnalysis.projectKey);
      const jobByPath = new Map<string, FramerSyncJob>();
      for (const j of jobs) {
        const p = j.page_path || j.ir_payload?.pageMeta?.path;
        if (p && !jobByPath.has(p)) {
          jobByPath.set(p, j);
        }
      }

      const pages = rawAnalysis.pages.map((p) => {
        const local = saved[p.id];
        const remote = jobByPath.get(p.path);
        if (local) {
          return {
            ...p,
            migrationStatus: local.migrationStatus,
            jobId: local.jobId ?? remote?.id ?? null,
            sectionCount: local.sectionCount ?? remote?.ir_payload?.sections?.length,
            framerPageNodeId: local.framerPageNodeId ?? remote?.ir_payload?.pageMeta?.framerPageNodeId,
            lastSyncedAt: local.lastSyncedAt ?? remote?.updated_at ?? null,
          };
        }
        if (remote) {
          const remoteStatus: ReaddyPageMigrationStatus =
            remote.status === 'completed'
              ? 'migrated'
              : remote.status === 'failed'
                ? 'failed'
                : remote.status === 'syncing'
                  ? 'syncing'
                  : 'parsed';
          return {
            ...p,
            migrationStatus: remoteStatus,
            jobId: remote.id,
            sectionCount: remote.ir_payload?.sections?.length,
            framerPageNodeId: remote.ir_payload?.pageMeta?.framerPageNodeId,
            lastSyncedAt: remote.updated_at ?? remote.created_at,
          };
        }
        return p;
      });

      return { ...rawAnalysis, pages };
    },
    [],
  );

  const updatePageState = useCallback(
    (pageId: string, patch: Partial<ReaddyDiscoveredPage>) => {
      setAnalysis((prev) => {
        if (!prev) return prev;
        const nextPages = prev.pages.map((p) =>
          p.id === pageId ? { ...p, ...patch } : p,
        );
        savePageProgress(prev.projectKey, nextPages);
        return { ...prev, pages: nextPages };
      });
    },
    [],
  );

  const conversionJob = useReaddyConversionJob();
  const seenPatchToken = useRef(0);

  useEffect(() => {
    const patch = conversionJob.pagePatch;
    if (!patch || patch.token === seenPatchToken.current) return;
    if (!analysis || patch.projectKey !== analysis.projectKey) return;
    seenPatchToken.current = patch.token;
    updatePageState(patch.pageId, patch.page);
    void refreshHistory();
  }, [analysis, conversionJob.pagePatch, refreshHistory, updatePageState]);

  const selectAndAssemblePage = useCallback(
    async (
      page: ReaddyDiscoveredPage,
      projAnalysis: ReaddyProjectAnalysis,
      fileMap: Record<string, string>,
      allPathsForGh: string[],
      restoreCachedJob = true,
    ) => {
      setActivePageId(page.id);
      setIrPayload(null);
      setActiveJobId(null);
      setSelectedSectionId(null);

      // If there's an existing parsed/migrated job for this page in recentJobs, restore preview
      const existingJob = restoreCachedJob
        ? recentJobs.find(
            (j) =>
              (j.id === page.jobId ||
                j.page_path === page.path ||
                j.ir_payload?.pageMeta?.path === page.path) &&
              j.ir_payload?.sections?.length,
          )
        : undefined;

      if (projAnalysis.sourceType === 'github' && projAnalysis.githubMeta) {
        setLoadingPageId(page.id);
        try {
          const res = await fetchGitHubPageBundle({
            repo_url: githubRepoUrl,
            branch: projAnalysis.githubMeta.branch,
            page,
            shared_files: projAnalysis.sharedFiles,
            all_paths: allPathsForGh,
          });
          setRawCode(res.code);
          setIncludedFiles(res.included_files);
          setCodeSummary(res.summary);
          setGithubRepoMeta(res.repo_meta);
          pushLog('info', 'ast', `已從 GitHub 組裝頁面 ${page.path}：${res.summary}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(`載入頁面 ${page.path} 失敗：${msg}`);
          pushLog('error', 'ast', msg);
        } finally {
          setLoadingPageId(null);
        }
      } else {
        const assembled = assembleReaddyPageCode(page, fileMap, projAnalysis);
        setRawCode(assembled.code);
        setIncludedFiles(assembled.includedFiles);
        setCodeSummary(assembled.summary);
      }

      if (existingJob?.ir_payload) {
        setActiveJobId(existingJob.id);
        setIrPayload(existingJob.ir_payload);
        setSelectedSectionId(existingJob.ir_payload.sections[0]?.id || null);
      }
    },
    [githubRepoUrl, pushLog, recentJobs],
  );

  const handleUploadFile = async (file: File) => {
    setUploadLoading(true);
    try {
      const result = await processUploadedReaddyFile(file);
      const hydrated = hydrateAnalysisWithProgress(result.analysis, recentJobs);
      setAnalysis(hydrated);
      setProjectFileMap(result.fileMap);
      setGithubRepoMeta(null);
      setSourceLabel(file.name);

      const firstPage = pickLandingPage(hydrated.pages);
      if (firstPage) {
        await selectAndAssemblePage(firstPage, hydrated, result.fileMap, [], false);
      }

      toast.success(
        `分析完成：共掃描 ${hydrated.totalFiles} 個檔案，識別 ${hydrated.pages.length} 個頁面`,
      );
      pushLog(
        'success',
        'ast',
        `ZIP 解析完成 [${hydrated.projectName}]：${hydrated.pages.length} 個頁面（${Object.entries(hydrated.localeCounts)
          .map(([k, v]) => `${k}:${v}`)
          .join(' / ')}）`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadLoading(false);
    }
  };

  const handleAnalyzeGitHubProject = async () => {
    if (!githubRepoUrl.trim()) {
      toast.error('請先選擇要分析的 Readdy GitHub 倉庫。');
      return;
    }
    setGithubLoading(true);
    try {
      const res = await analyzeGitHubProject({
        repo_url: githubRepoUrl,
        branch: githubBranch,
      });
      const hydrated = hydrateAnalysisWithProgress(res.analysis, recentJobs);
      setAnalysis(hydrated);
      setProjectFileMap({});
      setGithubAllPaths(res.all_paths || []);
      setSourceLabel(hydrated.githubMeta?.full_name || githubRepoUrl);
      if (hydrated.githubMeta?.branches?.length) {
        setGithubBranches(hydrated.githubMeta.branches);
      }
      if (hydrated.githubMeta?.branch) {
        setGithubBranch(hydrated.githubMeta.branch);
      }

      const firstPage = pickLandingPage(hydrated.pages);
      if (firstPage) {
        await selectAndAssemblePage(firstPage, hydrated, {}, res.all_paths || [], false);
      }

      toast.success(
        `倉庫分析完成：${hydrated.projectName}（${hydrated.pages.length} 個頁面）`,
      );
      pushLog(
        'success',
        'ast',
        `GitHub 倉庫掃描完成 [${hydrated.githubMeta?.full_name}]：${hydrated.pages.length} 個頁面`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      pushLog('error', 'ast', msg);
    } finally {
      setGithubLoading(false);
    }
  };

  const handleAnalyzePasteCode = async () => {
    if (!pasteCode.trim()) {
      toast.error('請先貼上 Readdy 代碼。');
      return;
    }
    const fileMap = { 'LandingPage.tsx': pasteCode };
    const rawAnalysis = analyzeReaddyFileMap(fileMap, {
      sourceType: 'paste',
      projectName: 'Pasted Landing Page',
    });
    const hydrated = hydrateAnalysisWithProgress(rawAnalysis, recentJobs);
    setAnalysis(hydrated);
    setProjectFileMap(fileMap);
    setGithubRepoMeta(null);
    setSourceLabel('paste');
    if (hydrated.pages[0]) {
      await selectAndAssemblePage(hydrated.pages[0], hydrated, fileMap, []);
    }
    toast.success('單頁代碼分析完成');
  };

  const activePage = useMemo(
    () => analysis?.pages.find((p) => p.id === activePageId) || null,
    [analysis, activePageId],
  );

  const activePageIndex = useMemo(() => {
    if (!analysis || !activePage) return -1;
    return analysis.pages.findIndex((p) => p.id === activePage.id);
  }, [analysis, activePage]);

  const handleSelectPage = (page: ReaddyDiscoveredPage) => {
    if (!analysis) return;
    void selectAndAssemblePage(page, analysis, projectFileMap, githubAllPaths);
  };

  const handleToggleSkipPage = (pageId: string) => {
    const target = analysis?.pages.find((p) => p.id === pageId);
    if (!target) return;
    const nextStatus: ReaddyPageMigrationStatus =
      target.migrationStatus === 'skipped' ? 'pending' : 'skipped';
    updatePageState(pageId, { migrationStatus: nextStatus });
  };

  const handleStepPage = (direction: -1 | 1) => {
    if (!analysis || analysis.pages.length === 0) return;
    const idx = activePageIndex >= 0 ? activePageIndex : 0;
    const nextIdx = Math.min(analysis.pages.length - 1, Math.max(0, idx + direction));
    if (nextIdx !== idx) {
      handleSelectPage(analysis.pages[nextIdx]);
    }
  };

  const handleJumpNextPending = useCallback(() => {
    if (!analysis) return;
    const next =
      analysis.pages.find(
        (p, idx) =>
          idx > activePageIndex &&
          (p.migrationStatus === 'pending' || p.migrationStatus === 'failed'),
      ) ||
      analysis.pages.find(
        (p) => p.migrationStatus === 'pending' || p.migrationStatus === 'failed',
      );
    if (next) {
      void selectAndAssemblePage(next, analysis, projectFileMap, githubAllPaths);
    } else {
      toast.success('所有未跳過的頁面都已遷移完成！');
    }
  }, [activePageIndex, analysis, githubAllPaths, projectFileMap, selectAndAssemblePage]);

  const handleParseCurrentPage = async () => {
    if (!gridConfirmed) {
      setHighlightConfirmWarning(true);
      setToolDrawer('grid');
      toast.error('請先勾選「已確認格點」，鎖定 12 列網格基準後再解析。');
      return;
    }
    if (!isValidFramerProjectUrl(framerProjectUrl)) {
      toast.error('請輸入有效的目標 Framer Project URL。');
      return;
    }
    if (!rawCode.trim()) {
      toast.error('請先選擇要遷移的頁面，或先在 Step 01 分析專案。');
      return;
    }

    setHighlightConfirmWarning(false);
    narrowPageRail();
    setParsing(true);
    if (progressOpenTimerRef.current) window.clearTimeout(progressOpenTimerRef.current);
    progressOpenTimerRef.current = window.setTimeout(() => {
      setProgressModalOpen(true);
      progressOpenTimerRef.current = null;
    }, 420);
    const pageLabel = activePage ? `${activePage.path} (${activePage.title})` : 'Single Page';

    setLogs([
      {
        ts: new Date().toISOString(),
        level: 'info',
        stage: 'ast',
        message: `開始解析頁面 [${pageLabel}] → Framer IR…`,
      },
    ]);
    setStages([
      { key: 'ast', code: '01', label: 'AST 結構解析', progress: 45, status: 'running', detail: `解析 ${pageLabel}` },
      { key: 'grid', code: '02', label: '12列網格對齊', progress: 20, status: 'running', detail: `${gridConfig.desktop_width}px / ${gridConfig.columns} Col` },
      { key: 'tokens', code: '03', label: 'Token 樣式映射', progress: 10, status: 'running', detail: analysis?.cssTokens.primaryHex || '提取主題色' },
      { key: 'mcp', code: '04', label: 'MCP 畫布寫入', progress: 0, status: 'idle', detail: '等待解析完成後寫入' },
    ]);

    try {
      const res = await parseReaddyToIr({
        framer_project_url: framerProjectUrl.trim(),
        source_type: sourceType,
        github_repo_meta: sourceType === 'github' ? githubRepoMeta : null,
        storage_bundle_path: analysis?.storageBundlePath ?? null,
        grid_config: gridConfig,
        raw_readdy_code: rawCode,
        tailwind_config: analysis?.tailwindConfig ?? null,
        asset_url_map: analysis?.assetUrlMap ?? {},
        page_meta: activePage
          ? {
              path: activePage.path,
              title: activePage.title,
              locale: activePage.locale,
              pageKind: activePage.pageKind,
              sourceFile: activePage.sourceFile,
              includedFiles,
            }
          : undefined,
        css_tokens: analysis?.cssTokens,
        project_name: analysis?.projectName,
      });

      setActiveJobId(res.job_id);
      setIrPayload(res.ir_payload);
      setSelectedSectionId(res.ir_payload.sections[0]?.id || null);
      appendLogs(res.logs);

      if (activePage) {
        updatePageState(activePage.id, {
          migrationStatus: 'parsed',
          jobId: res.job_id,
          sectionCount: res.ir_payload.sections.length,
        });
      }

      setStages([
        {
          key: 'ast',
          code: '01',
          label: 'AST 結構解析',
          progress: 100,
          status: 'done',
          detail: `識別 ${res.ir_payload.sections.length} 個區塊 (${res.parser_engine})`,
        },
        {
          key: 'grid',
          code: '02',
          label: '12列網格對齊',
          progress: 100,
          status: 'done',
          detail: `${gridConfig.container_max_width}px 容器 · ${gridConfig.columns} 列`,
        },
        {
          key: 'tokens',
          code: '03',
          label: 'Token 樣式映射',
          progress: 100,
          status: 'done',
          detail: `主色 ${res.ir_payload.designTokens.colors.primary}`,
        },
        {
          key: 'mcp',
          code: '04',
          label: 'MCP 畫布寫入',
          progress: 0,
          status: 'idle',
          detail: '就緒：可點擊「同步此頁到 Framer」',
        },
      ]);
      toast.success(`頁面 ${activePage?.path || '/'} 解析完成，共 ${res.ir_payload.sections.length} 個區塊`);
      void refreshHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog('error', 'ast', msg);
      if (activePage) updatePageState(activePage.id, { migrationStatus: 'failed' });
      setStages((prev) =>
        prev.map((s) => (s.status === 'running' ? { ...s, status: 'error', detail: msg } : s)),
      );
      toast.error(msg);
    } finally {
      setParsing(false);
    }
  };

  const updateSectionStatus = (
    sectionIdx: number,
    syncStatus: 'pending' | 'syncing' | 'synced' | 'failed',
  ) => {
    setIrPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((sec, i) =>
          i === sectionIdx ? { ...sec, syncStatus } : sec,
        ),
      };
    });
  };

  const handleSyncSingleSection = async (stepIndex: number) => {
    if (!activeJobId || !irPayload) return;
    if (!oauthStatus?.connected) {
      toast.error('請先授權團隊共用的 Framer MCP 帳號（右上角 mcp.framer.com）。');
      void handleConnectFramer();
      return;
    }

    const sectionIdx = stepIndex - 1;
    setProgressModalOpen(true);
    updateSectionStatus(sectionIdx, 'syncing');
    setStages((prev) =>
      prev.map((s) =>
        s.key === 'mcp'
          ? {
              ...s,
              status: 'running',
              detail: `正在寫入區塊 ${stepIndex}/${irPayload.sections.length}…`,
            }
          : s,
      ),
    );

    try {
      const res = await syncFramerStep({
        job_id: activeJobId,
        step_index: stepIndex,
        framer_project_url: framerProjectUrl.trim(),
        page_path: activePage?.path || irPayload.pageMeta?.path,
        page_title: activePage?.title || irPayload.pageMeta?.title,
      });
      updateSectionStatus(sectionIdx, 'synced');
      if (res.logs?.length) appendLogs(res.logs);
      const syncedCount = irPayload.sections.filter(
        (_s, idx) => idx === sectionIdx || _s.syncStatus === 'synced',
      ).length;
      const mcpPct = Math.round((syncedCount / irPayload.sections.length) * 100);
      if (mcpPct === 100 && activePage) {
        updatePageState(activePage.id, {
          migrationStatus: 'migrated',
          framerPageNodeId: res.framer_page_node_id,
          lastSyncedAt: new Date().toISOString(),
        });
      }
      setStages((prev) =>
        prev.map((s) =>
          s.key === 'mcp'
            ? {
                ...s,
                progress: mcpPct,
                status: mcpPct === 100 ? 'done' : 'idle',
                detail: `已寫入 ${syncedCount}/${irPayload.sections.length} 個區塊`,
              }
            : s,
        ),
      );
      toast.success(`區塊 ${stepIndex} 已寫入 Framer (${res.duration_ms}ms)`);
      void refreshHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateSectionStatus(sectionIdx, 'failed');
      pushLog('error', 'mcp', msg);
      setStages((prev) =>
        prev.map((s) => (s.key === 'mcp' ? { ...s, status: 'error', detail: msg } : s)),
      );
      toast.error(msg);
    }
  };

  const handleSyncAll = async () => {
    if (!activeJobId || !irPayload || irPayload.sections.length === 0) return;
    if (!oauthStatus?.connected) {
      toast.error('請先完成右上角「mcp.framer.com」OAuth 授權，再執行同步。');
      void handleConnectFramer();
      return;
    }

    setSyncingAll(true);
    setProgressModalOpen(true);
    const total = irPayload.sections.length;
    const pagePath = activePage?.path || irPayload.pageMeta?.path || '/';
    const pageTitle = activePage?.title || irPayload.pageMeta?.title || pagePath;

    if (activePage) {
      updatePageState(activePage.id, { migrationStatus: 'syncing' });
    }

    try {
      setStages((prev) =>
        prev.map((s) =>
          s.key === 'mcp'
            ? { ...s, progress: 5, status: 'running', detail: `連線 mcp.framer.com 定位頁面 ${pagePath}…` }
            : s,
        ),
      );
      const step0Res = await syncFramerStep({
        job_id: activeJobId,
        step_index: 0,
        framer_project_url: framerProjectUrl.trim(),
        page_path: pagePath,
        page_title: pageTitle,
      });
      if (step0Res.logs?.length) appendLogs(step0Res.logs);

      for (let i = 0; i < total; i++) {
        const stepNo = i + 1;
        const sec = irPayload.sections[i];
        updateSectionStatus(i, 'syncing');
        setStages((prev) =>
          prev.map((s) =>
            s.key === 'mcp'
              ? {
                  ...s,
                  progress: Math.round((i / total) * 100),
                  status: 'running',
                  detail: `寫入 (${stepNo}/${total})：${sec.name}`,
                }
              : s,
          ),
        );

        const res = await syncFramerStep({
          job_id: activeJobId,
          step_index: stepNo,
          framer_project_url: framerProjectUrl.trim(),
          page_path: pagePath,
          page_title: pageTitle,
        });
        updateSectionStatus(i, 'synced');
        if (res.logs?.length) appendLogs(res.logs);
      }

      if (activePage) {
        updatePageState(activePage.id, {
          migrationStatus: 'migrated',
          framerPageNodeId: step0Res.framer_page_node_id,
          lastSyncedAt: new Date().toISOString(),
        });
      }

      setStages((prev) =>
        prev.map((s) =>
          s.key === 'mcp'
            ? { ...s, progress: 100, status: 'done', detail: `${pagePath} 全部 ${total} 個區塊已寫入 Framer` }
            : s,
        ),
      );
      toast.success(`頁面 ${pagePath} 已完成搬移（${total} 個區塊）！`, {
        action: {
          label: '跳至下一待搬頁',
          onClick: handleJumpNextPending,
        },
      });
      void refreshHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog('error', 'mcp', msg);
      if (activePage) updatePageState(activePage.id, { migrationStatus: 'failed' });
      setStages((prev) =>
        prev.map((s) => (s.key === 'mcp' ? { ...s, status: 'error', detail: msg } : s)),
      );
      toast.error(msg);
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSelectHistoryJob = (job: FramerSyncJob) => {
    setActiveJobId(job.id);
    setSourceType(job.source_type);
    setFramerProjectUrl(job.framer_project_url);
    if (job.grid_config) setGridConfig(job.grid_config);
    setRawCode(job.raw_readdy_code);
    setIrPayload(job.ir_payload);
    setGithubRepoMeta(job.github_repo_meta);
    setLogs(Array.isArray(job.step_logs) ? job.step_logs : []);
    const matchedPath = job.page_path || job.ir_payload?.pageMeta?.path;
    if (matchedPath && analysis) {
      const match = analysis.pages.find((p) => p.path === matchedPath);
      if (match) setActivePageId(match.id);
    }
    const sections = job.ir_payload?.sections || [];
    const syncedCount = sections.filter((s) => s.syncStatus === 'synced').length;
    const mcpPct = sections.length > 0 ? Math.round((syncedCount / sections.length) * 100) : 0;
    setStages([
      { key: 'ast', code: '01', label: 'AST 結構解析', progress: job.ir_payload ? 100 : 0, status: job.ir_payload ? 'done' : 'idle', detail: `共 ${sections.length} 個區塊` },
      { key: 'grid', code: '02', label: '12列網格對齊', progress: job.ir_payload ? 100 : 0, status: job.ir_payload ? 'done' : 'idle', detail: `${job.grid_config?.columns || 12} 列柵格` },
      { key: 'tokens', code: '03', label: 'Token 樣式映射', progress: job.ir_payload ? 100 : 0, status: job.ir_payload ? 'done' : 'idle', detail: '已載入歷史樣式' },
      { key: 'mcp', code: '04', label: 'MCP 畫布寫入', progress: mcpPct, status: mcpPct === 100 ? 'done' : 'idle', detail: `已同步 ${syncedCount}/${sections.length}` },
    ]);
    toast.success(`已載入歷史任務${matchedPath ? ` (${matchedPath})` : ''}`);
  };

  const handleStartBackgroundConversion = () => {
    if (conversionJob.phase === 'running') {
      toast.message('已有轉換在後台進行');
      return;
    }
    if (!gridConfirmed) {
      setHighlightConfirmWarning(true);
      setToolDrawer('grid');
      toast.error('請先勾選「已確認格點」，鎖定 12 列網格基準後再轉換。');
      return;
    }
    if (!isValidFramerProjectUrl(framerProjectUrl)) {
      toast.error('請輸入有效的目標 Framer Project URL。');
      return;
    }
    if (!oauthStatus?.connected) {
      toast.error('請先授權團隊共用的 Framer MCP 帳號（右上角 mcp.framer.com）。');
      void handleConnectFramer();
      return;
    }
    if (!analysis || analysis.pages.length === 0) {
      toast.error('請先分析 Readdy 專案，再一鍵轉換。');
      return;
    }
    const pages = analysis.pages.filter(
      (page) => page.migrationStatus !== 'skipped' && page.migrationStatus !== 'migrated',
    );
    if (pages.length === 0) {
      toast.message('沒有待轉換的頁面。已跳過或已搬完的頁面不會重跑。');
      return;
    }
    conversionJob.start({
      projectKey: analysis.projectKey,
      siteName: analysis.projectName,
      readdyCode: extractReaddyCode([
        sourceLabel,
        analysis.githubMeta?.repo,
        analysis.githubMeta?.full_name,
        githubRepoUrl,
        analysis.projectName,
      ]),
      framerProjectUrl: framerProjectUrl.trim(),
      sourceType: analysis.sourceType,
      gridConfig,
      analysis,
      fileMap: projectFileMap,
      githubRepoUrl,
      githubAllPaths,
      pages,
    });
  };

  const sections = irPayload?.sections || [];
  const globalProgressPct = useMemo(() => {
    const sum = stages.reduce((acc, s) => acc + s.progress, 0);
    return Math.round(sum / stages.length);
  }, [stages]);

  return (
    <div className="-m-6 min-h-[calc(100vh-48px-var(--app-banner-h))] xl:h-[calc(100vh-48px-var(--app-banner-h))] xl:overflow-hidden bg-[#F4F6F9] p-4 sm:p-5 flex flex-col gap-4">
      <WorkbenchHeader
        globalProgressPct={globalProgressPct}
        isBusy={parsing || syncingAll}
        oauthStatus={oauthStatus}
        oauthConnecting={oauthConnecting}
        recentJobs={recentJobs}
        activeJobId={activeJobId}
        onOpenProgressModal={() => setProgressModalOpen(true)}
        onConnectFramer={() => void handleConnectFramer()}
        onDisconnectFramer={() => void handleDisconnectFramer()}
        onSelectJob={handleSelectHistoryJob}
        onRefreshStatus={() => void refreshOAuthStatus()}
      />

      {/* Main Split Grid */}
      <div ref={splitRef} className="flex flex-col xl:flex-row gap-4 flex-1 min-h-0">
        {/* Left Column: Integrated Step 01 Project Import + Step 02 Page Inventory */}
        <div
          className="relative flex w-full min-h-0 min-w-0 flex-col overflow-hidden xl:shrink-0 xl:grow-0 xl:w-[var(--page-rail-w)] xl:transition-[width] xl:duration-500 xl:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{
            ['--page-rail-w' as string]: pageRailNarrow ? '300px' : railWidePx ? `${railWidePx}px` : '34%',
          }}
        >
          <aside className="bg-white rounded-xl border border-slate-200/90 shadow-card flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-200/80">
              <SourceConfigPanel
                framerProjectUrl={framerProjectUrl}
                onFramerProjectUrlChange={setFramerProjectUrl}
                framerProjects={framerProjects}
                framerWorkspaces={framerWorkspaces}
                framerCatalogLoading={framerCatalogLoading}
                framerCatalogError={framerCatalogError}
                framerCatalogTruncated={framerCatalogTruncated}
                onRefreshFramerCatalog={() => void refreshFramerCatalog()}
                onCreateFramerProject={handleCreateFramerProject}
                oauthStatus={oauthStatus}
                oauthConnecting={oauthConnecting}
                onConnectFramer={() => void handleConnectFramer()}
                sourceType={sourceType}
                onSourceTypeChange={setSourceType}
                githubRepoUrl={githubRepoUrl}
                githubRepos={githubRepos}
                githubReposLoading={githubReposLoading}
                githubReposError={githubReposError}
                onSelectGitHubRepo={handleSelectGitHubRepo}
                onRefreshGitHubRepos={() => void refreshGitHubRepos({ silent: false })}
                githubBranch={githubBranch}
                onGithubBranchChange={setGithubBranch}
                githubBranches={githubBranches}
                githubBranchesLoading={githubBranchesLoading}
                githubLoading={githubLoading}
                onAnalyzeGitHubProject={() => void handleAnalyzeGitHubProject()}
                onSaveTeamGitHubToken={handleSaveTeamGitHubToken}
                uploadLoading={uploadLoading}
                onUploadFile={(f) => void handleUploadFile(f)}
                pasteCode={pasteCode}
                onPasteCodeChange={setPasteCode}
                onAnalyzePasteCode={() => void handleAnalyzePasteCode()}
                analysis={analysis}
              />

              <PageInventoryPanel
                analysis={analysis}
                activePageId={activePageId}
                loadingPageId={loadingPageId}
                onSelectPage={handleSelectPage}
                onToggleSkipPage={handleToggleSkipPage}
              />
            </div>
            <div className="shrink-0 border-t border-slate-200/90 bg-white px-3 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={parsing || !rawCode.trim() || loadingPageId !== null}
                  onClick={() => void handleParseCurrentPage()}
                  title={activePage ? `解析 ${activePage.title}` : '先選擇要解析的頁面'}
                  className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#101B2D] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#192842] disabled:opacity-45"
                >
                  {parsing ? (
                    <Loader2 size={13} className="shrink-0 animate-spin text-[#0BB59B]" />
                  ) : (
                    <Sparkles size={13} className="shrink-0 text-[#0BB59B]" />
                  )}
                  <span className="truncate">{parsing ? '解析中…' : '解析此頁區塊'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartBackgroundConversion}
                  disabled={conversionJob.phase === 'running'}
                  title="把未跳過、尚未搬完的頁面放進後台轉換，完成後寄出結果郵件"
                  className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0BB59B] px-3 py-2 text-[12px] font-semibold text-[#08151F] transition-colors hover:bg-[#09a78e] disabled:opacity-70"
                >
                  {conversionJob.phase === 'running' ? (
                    <Loader2 size={13} className="shrink-0 animate-spin" />
                  ) : (
                    <Sparkles size={13} className="shrink-0" />
                  )}
                  <span className="truncate">
                    {conversionJob.phase === 'running' ? '後台轉換中' : '一鍵轉換'}
                  </span>
                </button>
                {pageRailNarrow && (
                  <button
                    type="button"
                    onClick={expandPageRail}
                    title="展開頁面欄"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#101B2D]"
                  >
                    <ChevronRight size={15} />
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* Right Column: Step 03 Per-Page Assembly, Parsing & Migration */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <section className="relative bg-white rounded-xl border border-slate-200/90 shadow-card p-4 sm:p-5 flex-1 flex flex-col min-h-0 gap-4 overflow-hidden">
            {/* Active Page Migration Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#101B2D] text-white font-mono text-[11px] font-bold mt-0.5 shrink-0">
                  03
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-bold text-[#101B2D] truncate">
                      {activePage
                        ? activePage.title
                        : sections.length > 0
                          ? `已解析 ${sections.length} 個區塊`
                          : '選擇左側頁面開始逐頁搬移'}
                    </h2>
                    {activePage && (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[11px]">
                        {activePage.path}
                      </span>
                    )}
                    {activePage && (
                      <span className="px-2 py-0.5 rounded bg-teal-50 text-[#08967F] text-[10.5px] font-semibold uppercase">
                        {activePage.locale}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-slate-400 mt-0.5 truncate">
                    {codeSummary ||
                      (activePage
                        ? `來源：${activePage.sourceFile}`
                        : '先解析目前頁面的關聯組件為結構化區塊，核對後寫入對應 Framer 頁面')}
                  </p>
                </div>
              </div>

              {/* Navigation + Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {analysis && analysis.pages.length > 1 && (
                  <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                    <button
                      type="button"
                      disabled={activePageIndex <= 0}
                      onClick={() => handleStepPage(-1)}
                      className="p-1.5 text-slate-600 hover:bg-white disabled:opacity-35"
                      title="上一頁"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="px-2 text-[11px] font-mono text-slate-600 tabular-nums">
                      {activePageIndex + 1}/{analysis.pages.length}
                    </span>
                    <button
                      type="button"
                      disabled={activePageIndex < 0 || activePageIndex >= analysis.pages.length - 1}
                      onClick={() => handleStepPage(1)}
                      className="p-1.5 text-slate-600 hover:bg-white disabled:opacity-35"
                      title="下一頁"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setToolDrawer((current) => (current === 'grid' ? null : 'grid'))}
                  aria-expanded={toolDrawer === 'grid'}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-medium transition-colors ${
                    toolDrawer === 'grid'
                      ? 'border-[#0BB59B] bg-teal-50 text-[#08967F]'
                      : 'border-slate-200 bg-white text-[#101B2D] hover:bg-slate-50'
                  }`}
                >
                  <Grid3X3 size={13} className="text-[#0BB59B]" />
                  <span>{gridConfig.columns}Col</span>
                </button>

                <button
                  type="button"
                  onClick={() => setToolDrawer((current) => (current === 'code' ? null : 'code'))}
                  aria-expanded={toolDrawer === 'code'}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-medium transition-colors ${
                    toolDrawer === 'code'
                      ? 'border-[#0BB59B] bg-teal-50 text-[#08967F]'
                      : 'border-slate-200 bg-white text-[#101B2D] hover:bg-slate-50'
                  }`}
                >
                  <Code2 size={13} className={toolDrawer === 'code' ? 'text-[#0BB59B]' : 'text-slate-500'} />
                  <span>組裝源碼</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProgressModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11.5px] font-medium text-[#101B2D]"
                >
                  <Activity size={13} className="text-[#0BB59B]" />
                  <span>日誌</span>
                </button>

                <button
                  type="button"
                  disabled={sections.length === 0 || syncingAll}
                  onClick={() => void handleSyncAll()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0BB59B] hover:bg-[#099e87] text-white text-[12px] font-bold transition-colors disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
                >
                  {syncingAll ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  <span>
                    {syncingAll ? '寫入 Framer 中…' : '同步此頁到 Framer'}
                  </span>
                </button>
              </div>
            </div>

            {/* Equal-Height Split: Layers & Grid Canvas Preview */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
            <div
              className={
                expandedCanvas
                  ? 'grid h-full grid-cols-1 gap-4'
                  : 'grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-1'
              }
            >
              {!expandedCanvas && (
                <LayersPanel
                  sections={sections}
                  hoveredSectionId={hoveredSectionId}
                  selectedSectionId={selectedSectionId}
                  syncingAll={syncingAll}
                  onHoverSection={setHoveredSectionId}
                  onSelectSection={setSelectedSectionId}
                  onSyncSingleSection={(stepIdx) => void handleSyncSingleSection(stepIdx)}
                />
              )}

              <GridCanvasPreview
                gridConfig={gridConfig}
                designTokens={irPayload?.designTokens}
                sections={sections}
                showGridOverlay={showGridOverlay}
                onToggleGridOverlay={() => setShowGridOverlay((v) => !v)}
                expandedCanvas={expandedCanvas}
                onToggleExpandedCanvas={() => setExpandedCanvas((v) => !v)}
                hoveredSectionId={hoveredSectionId}
                selectedSectionId={selectedSectionId}
                onHoverSection={setHoveredSectionId}
                onSelectSection={setSelectedSectionId}
                pagePreview={
                  (activePage?.path === '/' || activePage?.path === '/cn/') &&
                  rawCode.includes('讓現場音樂，成為賓客記得住的部分') ? (
                    <FaithfulHomeFrame />
                  ) : undefined
                }
              />
            </div>

            {toolDrawer && (
              <>
                <button
                  type="button"
                  aria-label="關閉側欄"
                  onClick={() => setToolDrawer(null)}
                  className="absolute inset-0 z-20 bg-[#101B2D]/15"
                />
                <aside className="absolute inset-y-0 right-0 z-30 flex w-[min(640px,100%)] flex-col border-l border-slate-200 bg-white shadow-[-16px_0_40px_rgba(16,27,45,0.12)]">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-[#101B2D]">
                        {toolDrawer === 'code' ? '組裝源碼' : '格點設定'}
                      </div>
                      <div className="truncate text-[11px] text-slate-400">
                        {toolDrawer === 'code'
                          ? activePage
                            ? `${activePage.path} · ${includedFiles.length} files · ${rawCode.length.toLocaleString()} chars`
                            : '可微調後重新解析'
                          : `Desktop ${gridConfig.desktop_width} · Max ${gridConfig.container_max_width} · Gap ${gridConfig.gutter}px`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setToolDrawer(null)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-[#101B2D]"
                      aria-label="關閉"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {toolDrawer === 'code' ? (
                      <textarea
                        value={rawCode}
                        onChange={(e) => setRawCode(e.target.value)}
                        spellCheck={false}
                        className="h-full min-h-[420px] w-full resize-none rounded-lg border border-slate-200 bg-slate-50/60 p-3 font-mono text-[11.5px] leading-relaxed text-[#101B2D] outline-none focus:border-[#0BB59B]"
                      />
                    ) : (
                      <GridAnchorPanel
                        gridConfig={gridConfig}
                        onChangeGridConfig={setGridConfig}
                        gridConfirmed={gridConfirmed}
                        onToggleConfirmed={() => {
                          setGridConfirmed((v) => !v);
                          setHighlightConfirmWarning(false);
                        }}
                        highlightConfirmWarning={highlightConfirmWarning}
                      />
                    )}
                  </div>
                </aside>
              </>
            )}
            </div>
          </section>
        </div>
      </div>

      <ExecutionProgressModal
        open={progressModalOpen}
        onOpenChange={setProgressModalOpen}
        globalProgressPct={globalProgressPct}
        isRunning={parsing || syncingAll}
        stages={stages}
        logs={logs}
      />
    </div>
  );
}
