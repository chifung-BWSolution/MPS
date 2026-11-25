import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  History,
  KeyRound,
  Loader2,
  LogOut,
  PlugZap,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FramerOAuthStatus, FramerSyncJob } from '@/types/readdyFramer';

interface WorkbenchHeaderProps {
  globalProgressPct: number;
  isBusy: boolean;
  oauthStatus: FramerOAuthStatus | null;
  oauthConnecting: boolean;
  recentJobs: FramerSyncJob[];
  activeJobId: string | null;
  onOpenProgressModal: () => void;
  onConnectFramer: () => void;
  onDisconnectFramer: () => void;
  onSelectJob: (job: FramerSyncJob) => void;
  onRefreshStatus: () => void;
  conversionRunning: boolean;
  onStartConversion: () => void;
}

export function WorkbenchHeader({
  globalProgressPct,
  isBusy,
  oauthStatus,
  oauthConnecting,
  recentJobs,
  activeJobId,
  onOpenProgressModal,
  onConnectFramer,
  onDisconnectFramer,
  onSelectJob,
  onRefreshStatus,
  conversionRunning,
  onStartConversion,
}: WorkbenchHeaderProps) {
  const [mcpMenuOpen, setMcpMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const connected = Boolean(oauthStatus?.connected);

  return (
    <div className="bg-[#101B2D] text-white rounded-xl px-5 py-3 shadow-sm border border-[#1E2E48] flex flex-wrap items-center justify-between gap-3 shrink-0">
      {/* Left Brand + Subtitle */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 rounded-md bg-[#0BB59B] flex items-center justify-center shrink-0 shadow-sm">
          <span className="text-[#08151F] font-extrabold text-xs">M</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span className="font-bold text-[14px] tracking-tight whitespace-nowrap">
            Readdy → Framer 轉換工作台
          </span>
          <span className="hidden md:inline text-white/25">|</span>
          <span className="hidden md:inline text-[11px] text-slate-300/80 font-mono truncate">
            GitHub Sync · Code Upload · Grid Lock · Remote MCP
          </span>
        </div>
      </div>

      {/* Right Status Pills */}
      <div className="flex flex-wrap items-center gap-2 relative">
        <button
          type="button"
          onClick={onStartConversion}
          disabled={conversionRunning}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0BB59B] text-[#08151F] text-[11px] font-bold hover:bg-[#09a78e] disabled:opacity-70"
          title="把未跳過、尚未搬完的頁面放進後台轉換，完成後寄出結果郵件"
        >
          {conversionRunning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          <span>{conversionRunning ? '後台轉換中' : '一鍵轉換'}</span>
        </button>

        {/* History Switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setHistoryOpen((v) => !v);
              setMcpMenuOpen(false);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 transition-colors"
            title="載入歷史轉換記錄"
          >
            <History size={12} className="text-slate-300" />
            <span>任務記錄 ({recentJobs.length})</span>
          </button>
          {historyOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white text-[#101B2D] rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <span className="text-[11px] font-semibold text-slate-600">
                  最近轉換任務
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-700"
                >
                  關閉
                </button>
              </div>
              {recentJobs.length === 0 ? (
                <div className="p-4 text-[12px] text-slate-400 text-center">
                  尚無已解析的歷史任務
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {recentJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        onSelectJob(job);
                        setHistoryOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors',
                        activeJobId === job.id && 'bg-teal-50/70',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium truncate">
                          {job.page_title ||
                            job.ir_payload?.pageMeta?.title ||
                            (job.github_repo_meta?.repo
                              ? `${job.github_repo_meta.repo}`
                              : job.source_type === 'upload'
                                ? '本地上傳工程'
                                : '貼上代碼轉換')}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono shrink-0">
                          {job.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                        {job.page_path || job.ir_payload?.pageMeta?.path || job.framer_project_url}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Execution Progress Pill */}
        <button
          type="button"
          onClick={onOpenProgressModal}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-medium text-white transition-colors"
        >
          {isBusy ? (
            <Loader2 size={12} className="text-[#0BB59B] animate-spin" />
          ) : (
            <Activity size={12} className="text-[#0BB59B]" />
          )}
          <span className="tabular-nums">執行進度 {globalProgressPct}%</span>
        </button>

        {/* Framer MCP Connection Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (!connected) {
                onConnectFramer();
              } else {
                setMcpMenuOpen((v) => !v);
                setHistoryOpen(false);
              }
            }}
            disabled={oauthConnecting}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-medium transition-colors',
              connected
                ? 'bg-[#0BB59B]/15 border-[#0BB59B]/40 text-[#5CEBD5] hover:bg-[#0BB59B]/25'
                : 'bg-amber-500/15 border-amber-400/40 text-amber-200 hover:bg-amber-500/25',
            )}
            title={connected ? '點擊管理 Framer MCP 共用授權' : '點擊連接 Framer MCP 帳號'}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                connected ? 'bg-[#0BB59B]' : 'bg-amber-400 animate-pulse',
              )}
            />
            <span className="font-mono">mcp.framer.com</span>
            {oauthConnecting && <Loader2 size={11} className="animate-spin ml-0.5" />}
          </button>

          {mcpMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white text-[#101B2D] rounded-lg shadow-xl border border-slate-200 z-50 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <CheckCircle2 size={14} className="text-[#0BB59B]" />
                  <span>團隊共用 Framer MCP 已連線</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onRefreshStatus();
                    setMcpMenuOpen(false);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-700"
                >
                  關閉
                </button>
              </div>
              <div className="text-[11px] text-slate-500 space-y-1 bg-slate-50 rounded p-2 font-mono">
                <div>Token: {oauthStatus?.token_preview || '—'}</div>
                <div>
                  連線時間:{' '}
                  {oauthStatus?.connected_at
                    ? new Date(oauthStatus.connected_at).toLocaleString()
                    : '—'}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMcpMenuOpen(false);
                    onConnectFramer();
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-[#101B2D] text-white text-[11px] font-medium hover:bg-[#192842]"
                >
                  <KeyRound size={12} />
                  重新授權
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMcpMenuOpen(false);
                    onDisconnectFramer();
                  }}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded border border-rose-200 text-rose-600 text-[11px] font-medium hover:bg-rose-50"
                >
                  <LogOut size={12} />
                  中斷
                </button>
              </div>
            </div>
          )}
        </div>

        {!connected && (
          <button
            type="button"
            onClick={onConnectFramer}
            disabled={oauthConnecting}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-[#101B2D] hover:bg-slate-100 text-[11px] font-semibold transition-colors"
          >
            <PlugZap size={12} className="text-[#0BB59B]" />
            <span>一鍵授權 Framer</span>
          </button>
        )}
      </div>
    </div>
  );
}
