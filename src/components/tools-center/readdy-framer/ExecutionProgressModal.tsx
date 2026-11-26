import { useEffect, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Terminal,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ExecutionStageState, WorkbenchLogEntry } from '@/types/readdyFramer';

interface ExecutionProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isRunning: boolean;
  focus: 'parse' | 'sync';
  stages: ExecutionStageState[];
  logs: WorkbenchLogEntry[];
}

type ParsePhase = 'idle' | 'running' | 'done' | 'error';

function parsePhase(stages: ExecutionStageState[]): ParsePhase {
  if (stages.some((stage) => stage.status === 'error')) return 'error';
  if (stages.some((stage) => stage.status === 'running')) return 'running';
  if (stages.length > 0 && stages.every((stage) => stage.status === 'done')) return 'done';
  return 'idle';
}

function parsePhaseLabel(phase: ParsePhase): string {
  if (phase === 'running') return '解析中';
  if (phase === 'done') return '已完成';
  if (phase === 'error') return '解析失敗';
  return '等待解析';
}

function stageStatusLabel(status: ExecutionStageState['status']): string {
  if (status === 'running') return '進行中';
  if (status === 'done') return '完成';
  if (status === 'error') return '失敗';
  return '等待';
}

function sharedErrorDetail(stages: ExecutionStageState[]): string | null {
  const errors = stages.filter((stage) => stage.status === 'error' && stage.detail);
  if (errors.length < 2) return null;
  const first = errors[0].detail;
  return errors.every((stage) => stage.detail === first) ? first : null;
}

function LogPanel({
  title,
  logs,
  emptyText,
}: {
  title: string;
  logs: WorkbenchLogEntry[];
  emptyText: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [logs.length]);

  return (
    <div className="rounded-lg border border-[#1E2E48] bg-[#0B1322] text-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-[#101B2D] border-b border-white/10 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 font-mono text-slate-300">
          <Terminal size={12} className="text-[#0BB59B]" />
          <span>{title}</span>
        </div>
        <span className="text-slate-400 font-mono text-[10px]">
          {logs.length} entries
        </span>
      </div>
      <div
        ref={scrollerRef}
        className="max-h-40 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500">{emptyText}</div>
        ) : (
          logs.map((entry, idx) => {
            const timeStr = entry.ts
              ? new Date(entry.ts).toLocaleTimeString('en-GB', { hour12: false })
              : '--:--:--';
            const levelClass =
              entry.level === 'success'
                ? 'text-[#34E4C8]'
                : entry.level === 'error'
                  ? 'text-rose-400'
                  : entry.level === 'warn'
                    ? 'text-amber-300'
                    : 'text-sky-300';
            return (
              <div key={`${entry.ts}-${idx}`} className="flex items-start gap-2">
                <span className="text-slate-500 shrink-0">[{timeStr}]</span>
                <span className={cn('uppercase shrink-0 w-14', levelClass)}>
                  {entry.level}
                </span>
                <span className="text-slate-200 break-words">{entry.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function ExecutionProgressModal({
  open,
  onOpenChange,
  isRunning,
  focus,
  stages,
  logs,
}: ExecutionProgressModalProps) {
  const compileStages = stages.filter((stage) => stage.key !== 'mcp');
  const mcpStage = stages.find((stage) => stage.key === 'mcp');
  const phase = parsePhase(compileStages);
  const repeatedError = sharedErrorDetail(compileStages);
  const mcpPct = mcpStage?.progress ?? 0;
  const compileLogs = logs.filter((entry) => entry.stage !== 'mcp');
  const mcpLogs = logs.filter((entry) => entry.stage === 'mcp');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border-slate-200">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-[16px] font-bold text-[#101B2D] flex items-center gap-2">
                <span>{focus === 'sync' ? 'MCP 畫布寫入監控' : '頁面解析監控'}</span>
                {isRunning && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0BB59B]/15 text-[#08967F] text-[11px] font-semibold">
                    <Loader2 size={11} className="animate-spin" />
                    執行中
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-slate-500 mt-1">
                {focus === 'sync'
                  ? '透過 Streamable HTTP 分步寫入 mcp.framer.com'
                  : '清洗頁面結構、對齊格點並映射樣式'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {focus === 'parse' && (
          <>
          <div
            className={cn(
              'rounded-lg border p-3 space-y-3',
              phase === 'error' ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50/60',
            )}
          >
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-slate-500">解析狀態</span>
              <span
                className={cn(
                  'font-semibold',
                  phase === 'error' ? 'text-rose-600' : phase === 'idle' ? 'text-slate-400' : 'text-[#08967F]',
                )}
              >
                {parsePhaseLabel(phase)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="解析狀態"
              aria-busy={phase === 'running'}
              aria-valuenow={phase === 'done' ? 100 : phase === 'idle' ? 0 : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 overflow-hidden rounded-full bg-slate-200/80"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  phase === 'running' && 'animate-rf-indeterminate bg-[#0BB59B]',
                  phase === 'done' && 'w-full bg-[#0BB59B]',
                  phase === 'error' && 'w-full bg-rose-500',
                  phase === 'idle' && 'w-0',
                )}
              />
            </div>
            {repeatedError && (
              <p className="text-[11px] leading-snug text-rose-600 break-words">{repeatedError}</p>
            )}
            <div className="divide-y divide-slate-200/80">
              {compileStages.map((stage) => {
                const detail = stage.detail && stage.detail !== repeatedError ? stage.detail : '';
                return (
                  <div key={stage.key} className="min-w-0 space-y-0.5 py-2 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-1.5 text-[12px] font-semibold leading-snug text-[#101B2D]">
                      <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                        {stage.status === 'done' && (
                          <CheckCircle2 size={14} className="text-[#0BB59B]" />
                        )}
                        {stage.status === 'running' && (
                          <Loader2 size={14} className="text-[#0BB59B] animate-spin" />
                        )}
                        {stage.status === 'error' && (
                          <AlertCircle size={14} className="text-rose-500" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 break-words">
                        {stage.code}. {stage.label}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-[10px] font-semibold',
                          stage.status === 'error'
                            ? 'text-rose-600'
                            : stage.status === 'idle'
                              ? 'text-slate-400'
                              : 'text-[#08967F]',
                        )}
                      >
                        {stageStatusLabel(stage.status)}
                      </span>
                    </div>
                    {detail && (
                      <p className="pl-5 text-[11px] leading-snug text-slate-500 break-words">
                        {detail}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <LogPanel
            title="編譯日誌"
            logs={compileLogs}
            emptyText="等待觸發頁面解析…"
          />
          </>
          )}

          {focus === 'sync' && (
          <>
          <div
            className={cn(
              'rounded-lg border p-3 space-y-2',
              mcpStage?.status === 'running'
                ? 'border-[#0BB59B] bg-teal-50/40'
                : mcpStage?.status === 'error'
                  ? 'border-rose-300 bg-rose-50/40'
                  : 'border-slate-200 bg-white',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-bold text-[#101B2D]">
                {mcpStage?.status === 'done' && (
                  <CheckCircle2 size={14} className="shrink-0 text-[#0BB59B]" />
                )}
                {mcpStage?.status === 'running' && (
                  <Loader2 size={14} className="shrink-0 text-[#0BB59B] animate-spin" />
                )}
                {mcpStage?.status === 'error' && (
                  <AlertCircle size={14} className="shrink-0 text-rose-500" />
                )}
                <span className="min-w-0 break-words">
                  {mcpStage ? `${mcpStage.code}. ${mcpStage.label}` : '04. MCP 畫布寫入'}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 text-[12px] font-semibold',
                  mcpStage?.status === 'error' ? 'text-rose-600' : 'text-[#08967F]',
                )}
              >
                {mcpStage?.status === 'running'
                  ? '寫入中'
                  : mcpStage?.status === 'error'
                    ? '失敗'
                    : mcpStage?.status === 'done'
                      ? '完成'
                      : mcpPct > 0
                        ? `${mcpPct}%`
                        : '等待'}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="MCP 畫布寫入"
              aria-busy={mcpStage?.status === 'running'}
              aria-valuenow={mcpStage?.status === 'running' ? undefined : Math.min(100, Math.max(0, mcpPct))}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 overflow-hidden rounded-full bg-slate-200/80"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  mcpStage?.status === 'running' && 'animate-rf-indeterminate bg-[#0BB59B]',
                  mcpStage?.status === 'error' && 'w-full bg-rose-500',
                  mcpStage?.status !== 'running' && mcpStage?.status !== 'error' && 'bg-[#0BB59B]',
                )}
                style={
                  mcpStage?.status === 'running' || mcpStage?.status === 'error'
                    ? undefined
                    : { width: `${Math.min(100, Math.max(0, mcpPct))}%` }
                }
              />
            </div>
            <p className="text-[11px] leading-snug text-slate-500 break-words">
              {mcpStage?.detail || '等待 Framer 同步'}
            </p>
          </div>

          <LogPanel
            title="MCP 寫入日誌"
            logs={mcpLogs}
            emptyText="等待 Framer MCP 同步…"
          />
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
