import { useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  Code2,
  FolderGit2,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { isValidFramerProjectUrl } from '@/lib/readdyFramerApi';
import { CollapsePane } from './CollapsePane';
import type {
  FramerOAuthStatus,
  GitHubRepoSummary,
  ReaddyProjectAnalysis,
  SourceType,
} from '@/types/readdyFramer';

function formatFramerProjectLabel(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '未設定 Framer 專案';
  try {
    const u = new URL(trimmed);
    const seg = u.pathname.split('/projects/')[1]?.replace(/\/+$/, '');
    return seg || trimmed;
  } catch {
    return trimmed;
  }
}

interface SourceConfigPanelProps {
  framerProjectUrl: string;
  onFramerProjectUrlChange: (val: string) => void;
  oauthStatus: FramerOAuthStatus | null;
  oauthConnecting: boolean;
  onConnectFramer: () => void;

  sourceType: SourceType;
  onSourceTypeChange: (mode: SourceType) => void;

  // GitHub state
  githubRepoUrl: string;
  githubRepos: GitHubRepoSummary[];
  githubReposLoading: boolean;
  githubReposError: string | null;
  onSelectGitHubRepo: (repo: GitHubRepoSummary) => void;
  onRefreshGitHubRepos: () => void;
  githubBranch: string;
  onGithubBranchChange: (val: string) => void;
  githubBranches: string[];
  githubBranchesLoading: boolean;
  githubLoading: boolean;
  onAnalyzeGitHubProject: () => void;
  onSaveTeamGitHubToken: (token: string) => Promise<void>;

  // Upload state
  uploadLoading: boolean;
  onUploadFile: (file: File) => void;

  // Paste state
  pasteCode: string;
  onPasteCodeChange: (code: string) => void;
  onAnalyzePasteCode: () => void;

  // Current project summary
  analysis: ReaddyProjectAnalysis | null;
}

export function SourceConfigPanel({
  framerProjectUrl,
  onFramerProjectUrlChange,
  oauthStatus,
  oauthConnecting,
  onConnectFramer,
  sourceType,
  onSourceTypeChange,
  githubRepoUrl,
  githubRepos,
  githubReposLoading,
  githubReposError,
  onSelectGitHubRepo,
  onRefreshGitHubRepos,
  githubBranch,
  onGithubBranchChange,
  githubBranches,
  githubBranchesLoading,
  githubLoading,
  onAnalyzeGitHubProject,
  onSaveTeamGitHubToken,
  uploadLoading,
  onUploadFile,
  pasteCode,
  onPasteCodeChange,
  onAnalyzePasteCode,
  analysis,
}: SourceConfigPanelProps) {
  const [tokenPanelOpen, setTokenPanelOpen] = useState(false);
  const [repoPopoverOpen, setRepoPopoverOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [patInput, setPatInput] = useState('');
  const [savingPat, setSavingPat] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const urlValid = isValidFramerProjectUrl(framerProjectUrl);
  const mcpConnected = Boolean(oauthStatus?.connected);

  const branchOptions = githubBranches.length > 0 ? githubBranches : [githubBranch || 'main'];
  const selectedRepo = githubRepos.find((r) => r.html_url === githubRepoUrl) || null;

  const modeBadgeLabel =
    sourceType === 'upload'
      ? 'ZIP / Project'
      : sourceType === 'github'
        ? 'GitHub Analyzer'
        : 'Single Paste';

  const handleSavePat = async () => {
    setSavingPat(true);
    try {
      await onSaveTeamGitHubToken(patInput);
      setPatInput('');
      setTokenPanelOpen(false);
    } finally {
      setSavingPat(false);
    }
  };

  return (
    <section className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#0BB59B]/15 text-[#08967F] font-mono text-[11px] font-bold">
            01
          </span>
          <h2 className="text-[14px] font-bold text-[#101B2D]">
            導入專案並分析頁面
          </h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-200/70 text-[#08967F] text-[11px] font-medium">
            {modeBadgeLabel}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? '展開導入專案設定' : '收合導入專案設定'}
            title={collapsed ? '展開導入專案設定' : '收合導入專案設定'}
            className="p-1 rounded-md text-slate-400 hover:text-[#101B2D] hover:bg-slate-100 transition-colors"
          >
            <ChevronDown
              size={14}
              className={cn(
                'transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                !collapsed && 'rotate-180',
              )}
            />
          </button>
        </div>
      </div>

      <div className="grid">
        <CollapsePane open={collapsed} className="col-start-1 row-start-1 self-start">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="w-full text-left rounded-lg border border-slate-200/80 bg-slate-50/80 hover:border-slate-300 hover:bg-slate-50 px-3 py-2 space-y-1.5 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {githubLoading || uploadLoading ? (
                <>
                  <Loader2 size={13} className="animate-spin text-[#0BB59B] shrink-0" />
                  <span className="text-[12px] font-medium text-[#101B2D] truncate">
                    正在分析 {selectedRepo?.name || (sourceType === 'github' ? '倉庫' : '專案')}…
                  </span>
                  {sourceType === 'github' && githubBranch && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600 font-mono text-[10px] shrink-0">
                      {githubBranch}
                    </span>
                  )}
                </>
              ) : analysis ? (
                <>
                  <CheckCircle2 size={13} className="text-[#0BB59B] shrink-0" />
                  <span className="text-[12px] font-semibold font-mono text-[#101B2D] truncate">
                    {analysis.githubMeta?.repo || selectedRepo?.name || analysis.projectName}
                  </span>
                  {analysis.sourceType === 'github' && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600 font-mono text-[10px] shrink-0">
                      {analysis.githubMeta?.branch || githubBranch}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {sourceType === 'github' ? (
                    <FolderGit2 size={13} className="text-slate-400 shrink-0" />
                  ) : sourceType === 'upload' ? (
                    <Upload size={13} className="text-slate-400 shrink-0" />
                  ) : (
                    <Code2 size={13} className="text-slate-400 shrink-0" />
                  )}
                  <span className="text-[12px] text-slate-600 truncate font-mono">
                    {sourceType === 'github' && selectedRepo ? selectedRepo.name : '尚未分析專案'}
                  </span>
                  {sourceType === 'github' && selectedRepo && githubBranch && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600 font-mono text-[10px] shrink-0">
                      {githubBranch}
                    </span>
                  )}
                </>
              )}
            </div>
            {!githubLoading && !uploadLoading && analysis && (
              <span className="text-[11px] font-mono text-slate-500 shrink-0 tabular-nums">
                {analysis.pages.length} 頁{analysis.totalFiles > 0 ? ` · ${analysis.totalFiles} 檔` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0 text-slate-500">
              <Link2 size={11} className="text-slate-400 shrink-0" />
              <span className="truncate font-mono">{formatFramerProjectLabel(framerProjectUrl)}</span>
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  mcpConnected ? 'bg-[#0BB59B]' : 'bg-amber-400',
                )}
                title={mcpConnected ? 'Framer MCP 已連線' : 'Framer MCP 未授權'}
              />
            </div>
            <span className="shrink-0 text-[10.5px] text-slate-400">展開設定</span>
          </div>
        </button>
        </CollapsePane>
        <CollapsePane open={!collapsed} className="col-start-1 row-start-1 self-start">
        <div className="space-y-3.5">

      {/* Framer Project URL */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[12px] font-medium text-slate-600">
            Framer Project URL
          </label>
          {mcpConnected ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#08967F]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0BB59B]" />
              已連線
            </span>
          ) : (
            <button
              type="button"
              onClick={onConnectFramer}
              disabled={oauthConnecting}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700"
            >
              <KeyRound size={11} />
              {oauthConnecting ? '開啟授權中…' : '未授權，點此連線 Framer'}
            </button>
          )}
        </div>
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-50/70 transition-colors',
            urlValid
              ? 'border-slate-200 focus-within:border-[#0BB59B]'
              : 'border-amber-300 focus-within:border-amber-500',
          )}
        >
          <Link2 size={14} className="text-slate-400 shrink-0" />
          <input
            type="url"
            value={framerProjectUrl}
            onChange={(e) => onFramerProjectUrlChange(e.target.value)}
            placeholder="https://framer.com/projects/Your-Project--xxxx"
            className="w-full bg-transparent text-[12px] font-mono text-[#101B2D] outline-none placeholder:text-slate-400"
          />
        </div>
        {!urlValid && framerProjectUrl.trim().length > 0 && (
          <p className="text-[11px] text-amber-600">
            請輸入完整 Framer 專案連結（格式如 https://framer.com/projects/...）
          </p>
        )}
      </div>

      {/* 3-Mode Source Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200/70">
        <button
          type="button"
          onClick={() => onSourceTypeChange('github')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[12px] font-medium transition-all',
            sourceType === 'github'
              ? 'bg-white text-[#101B2D] shadow-sm font-semibold'
              : 'text-slate-500 hover:text-[#101B2D]',
          )}
        >
          <FolderGit2 size={13} />
          <span>GitHub 倉庫</span>
        </button>
        <button
          type="button"
          onClick={() => onSourceTypeChange('upload')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[12px] font-medium transition-all',
            sourceType === 'upload'
              ? 'bg-white text-[#101B2D] shadow-sm font-semibold'
              : 'text-slate-500 hover:text-[#101B2D]',
          )}
        >
          <Upload size={13} />
          <span>上傳 ZIP</span>
        </button>
        <button
          type="button"
          onClick={() => onSourceTypeChange('paste')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[12px] font-medium transition-all',
            sourceType === 'paste'
              ? 'bg-white text-[#101B2D] shadow-sm font-semibold'
              : 'text-slate-500 hover:text-[#101B2D]',
          )}
        >
          <Code2 size={13} />
          <span>貼上單頁</span>
        </button>
      </div>

      {/* Mode 1: Local ZIP / File Upload */}
      {sourceType === 'upload' && (
        <div className="rounded-lg border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2.5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) {
                setCollapsed(true);
                onUploadFile(f);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors bg-white',
              dragOver
                ? 'border-[#0BB59B] bg-teal-50/50'
                : 'border-slate-200 hover:border-[#0BB59B]',
            )}
          >
            {uploadLoading ? (
              <div className="flex flex-col items-center gap-2 py-1">
                <Loader2 size={20} className="animate-spin text-[#0BB59B]" />
                <span className="text-[12px] font-medium text-slate-600">
                  正在解壓並分析路由、組件依賴與設計系統…
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload size={18} className="text-[#0BB59B]" />
                <p className="text-[12px] font-semibold text-[#101B2D]">
                  拖放或點擊上傳 Readdy 導出包 (.zip)
                </p>
                <p className="text-[11px] text-slate-400">
                  自動解析 router/config.tsx、所有語系頁面、文章數據與 OKLCH 主題色
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".tsx,.jsx,.html,.zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setCollapsed(true);
                  onUploadFile(f);
                }
                e.target.value = '';
              }}
            />
          </div>

          {analysis && analysis.sourceType === 'upload' && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-emerald-50 border border-emerald-200/80 text-[11px] text-emerald-800">
              <span className="inline-flex items-center gap-1.5 font-medium truncate">
                <CheckCircle2 size={13} className="text-[#0BB59B] shrink-0" />
                <span className="truncate">
                  已盤點 {analysis.totalFiles} 個檔案 · 識別 {analysis.pages.length} 個頁面
                </span>
              </span>
              {Boolean(analysis.uploadedAssetCount) && (
                <span className="font-mono text-[10px] shrink-0">
                  +{analysis.uploadedAssetCount} 圖
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mode 2: GitHub Repository Analyzer */}
      {sourceType === 'github' && (
        <div className="rounded-lg border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-600">
              Readdy 同步的 GitHub 倉庫
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onRefreshGitHubRepos}
                disabled={githubReposLoading || !oauthStatus?.github_configured}
                title="重新載入含 Readdy 的倉庫列表"
                aria-label="重新載入含 Readdy 的倉庫列表"
                className="p-1 rounded border border-slate-200 bg-white text-slate-500 hover:text-[#101B2D] hover:bg-slate-50 disabled:opacity-45 transition-colors"
              >
                <RefreshCw size={11} className={cn(githubReposLoading && 'animate-spin text-[#0BB59B]')} />
              </button>
              <button
                type="button"
                onClick={() => setTokenPanelOpen((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border transition-colors',
                  oauthStatus?.github_configured
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
                )}
              >
                <Lock size={10} />
                <span>
                  {oauthStatus?.github_configured
                    ? `Token (${oauthStatus.github_token_preview})`
                    : 'Private Token'}
                </span>
              </button>
            </div>
          </div>

          <CollapsePane open={tokenPanelOpen} className="!-mt-3">
            <div className="pt-3">
            <div className="rounded-lg bg-white border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#101B2D] flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-[#0BB59B]" />
                  團隊共用 GitHub PAT（私有倉庫用）
                </span>
                <span className="text-[10px] text-slate-400">Contents: Read</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={patInput}
                  onChange={(e) => setPatInput(e.target.value)}
                  placeholder={
                    oauthStatus?.github_configured
                      ? `已儲存 ${oauthStatus.github_token_preview}（輸入覆蓋或留空清除）`
                      : '貼上 github_pat_... 或 ghp_...'
                  }
                  className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 text-[12px] font-mono outline-none focus:border-[#0BB59B]"
                />
                <button
                  type="button"
                  disabled={savingPat}
                  onClick={() => void handleSavePat()}
                  className="px-3 py-1.5 rounded bg-[#101B2D] text-white text-[11px] font-semibold hover:bg-[#1a2b46] disabled:opacity-50"
                >
                  {savingPat ? '驗證中…' : '儲存'}
                </button>
              </div>
            </div>
            </div>
          </CollapsePane>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {oauthStatus?.github_configured ? (
              <Popover open={repoPopoverOpen} onOpenChange={setRepoPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={repoPopoverOpen}
                    disabled={githubReposLoading && githubRepos.length === 0}
                    className="sm:col-span-2 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-slate-300 text-[12px] text-[#101B2D] outline-none focus:border-[#0BB59B] transition-colors text-left min-w-0 disabled:opacity-60"
                  >
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                      {githubReposLoading && githubRepos.length === 0 ? (
                        <>
                          <Loader2 size={12} className="animate-spin text-[#0BB59B] shrink-0" />
                          <span className="text-slate-500 truncate">載入 Readdy 倉庫中…</span>
                        </>
                      ) : selectedRepo ? (
                        <>
                          {selectedRepo.is_private && (
                            <Lock size={11} className="text-amber-600 shrink-0" />
                          )}
                          <span className="truncate font-mono" title={selectedRepo.full_name}>
                            {selectedRepo.name}
                          </span>
                        </>
                      ) : githubRepos.length === 0 ? (
                        <span className="text-slate-400 truncate">找不到含 Readdy 字樣的倉庫</span>
                      ) : (
                        <span className="text-slate-400 truncate">選擇含 Readdy 的倉庫…</span>
                      )}
                    </span>
                    <ChevronsUpDown size={13} className="text-slate-400 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="z-[120] w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="搜尋含 Readdy 的倉庫…" className="h-8 text-[12px]" />
                    <CommandList className="max-h-60">
                      <CommandEmpty className="py-4 px-3 text-center text-[11.5px] text-slate-500">
                        找不到符合條件的 Readdy 倉庫
                      </CommandEmpty>
                      <CommandGroup heading={`僅顯示含 Readdy 字樣的倉庫（${githubRepos.length}）`}>
                        {githubRepos.map((repo) => {
                          const isSelected = repo.html_url === githubRepoUrl;
                          return (
                            <CommandItem
                              key={repo.id}
                              value={`${repo.name} ${repo.full_name} ${repo.description || ''}`}
                              onSelect={() => {
                                onSelectGitHubRepo(repo);
                                setRepoPopoverOpen(false);
                              }}
                              className={cn(
                                'flex items-start gap-2 py-2 px-2.5 cursor-pointer rounded-md',
                                'data-[selected=true]:bg-[#E7F6F2] data-[selected=true]:text-[#101B2D]',
                              )}
                            >
                              <Check
                                className={cn(
                                  '!size-3.5 mt-0.5 shrink-0 !text-[#0BB59B]',
                                  isSelected ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[12px] font-semibold !text-[#101B2D] truncate">
                                    {repo.name}
                                  </span>
                                  {repo.is_private && (
                                    <Lock className="!size-3 !text-amber-600 shrink-0" />
                                  )}
                                </div>
                                <div className="text-[10.5px] font-mono !text-slate-500 truncate">
                                  {repo.full_name} · {repo.default_branch}
                                </div>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <button
                type="button"
                onClick={() => setTokenPanelOpen(true)}
                className="sm:col-span-2 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-white hover:border-amber-300 text-[12px] text-slate-400 outline-none transition-colors text-left min-w-0"
              >
                <span className="truncate">請先設定 GitHub Token</span>
                <ChevronsUpDown size={13} className="text-slate-300 shrink-0" />
              </button>
            )}
            <select
              value={githubBranch}
              onChange={(e) => onGithubBranchChange(e.target.value)}
              disabled={githubBranchesLoading || !githubRepoUrl}
              className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[12px] font-mono text-[#101B2D] outline-none focus:border-[#0BB59B] disabled:opacity-60"
            >
              {branchOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {githubReposError ? (
            <div className="flex items-center justify-between gap-2 text-[11px] text-rose-600">
              <span className="truncate">{githubReposError}</span>
              <button
                type="button"
                onClick={onRefreshGitHubRepos}
                className="shrink-0 font-semibold underline hover:text-rose-700"
              >
                重試
              </button>
            </div>
          ) : !oauthStatus?.github_configured ? (
            <p className="text-[11px] text-slate-500">
              僅顯示名稱含 Readdy 的倉庫；請先點擊上方 Private Token 設定團隊 GitHub PAT
            </p>
          ) : !githubReposLoading && githubRepos.length === 0 ? (
            <p className="text-[11px] text-amber-700">
              找不到名稱含 Readdy 的倉庫；若為私有倉庫，請確認 GitHub PAT 已開放「All repositories」與「Contents: Read」權限。
            </p>
          ) : selectedRepo ? (
            <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono text-slate-500">
              <span className="truncate">已選倉庫：{selectedRepo.full_name}</span>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-sans font-medium shrink-0',
                  selectedRepo.is_private
                    ? 'bg-amber-50 text-amber-700 border border-amber-200/80'
                    : 'bg-slate-100 text-slate-600',
                )}
              >
                {selectedRepo.is_private ? 'Private' : 'Public'}
              </span>
            </div>
          ) : null}

          <button
            type="button"
            disabled={githubLoading || githubReposLoading || !githubRepoUrl.trim()}
            onClick={() => {
              setCollapsed(true);
              onAnalyzeGitHubProject();
            }}
            className="w-full py-2 px-4 rounded-lg bg-[#101B2D] hover:bg-[#192842] text-white text-[12px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {githubLoading ? (
              <Loader2 size={14} className="animate-spin text-[#0BB59B]" />
            ) : (
              <ScanSearch size={14} className="text-[#0BB59B]" />
            )}
            <span>{githubLoading ? '正在分析倉庫結構…' : '分析倉庫與所有頁面'}</span>
          </button>
        </div>
      )}

      {/* Mode 3: Direct Single-Page Paste */}
      {sourceType === 'paste' && (
        <div className="rounded-lg border border-slate-200/90 bg-slate-50/70 p-3 space-y-2.5">
          <textarea
            value={pasteCode}
            onChange={(e) => onPasteCodeChange(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="貼上 Readdy 單頁 TSX / HTML 代碼…"
            className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-[11.5px] leading-relaxed font-mono text-[#101B2D] outline-none focus:border-[#0BB59B] resize-y"
          />
          <button
            type="button"
            onClick={() => {
              if (pasteCode.trim()) setCollapsed(true);
              onAnalyzePasteCode();
            }}
            className="w-full py-2 px-4 rounded-lg bg-[#101B2D] hover:bg-[#192842] text-white text-[12px] font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <ScanSearch size={14} className="text-[#0BB59B]" />
            <span>分析此段代碼</span>
          </button>
        </div>
      )}
        </div>
        </CollapsePane>
      </div>
    </section>
  );
}
