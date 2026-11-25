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

function averageProgress(stages: ExecutionStageState[]): number {
  if (stages.length === 0) return 0;
  const sum = stages.reduce((acc, stage) => acc + stage.progress, 0);
  return Math.round(sum / stages.length);
}

function stageFillClass(stage: ExecutionStageState): string {
  if (stage.status === 'error') return 'bg-rose-500';
  if (stage.status === 'running') {
    return 'bg-gradient-to-r from-[#0BB59B] via-[#34E4C8] to-[#0BB59B] animate-rf-shimmer';
  }
  return 'bg-[#0BB59B]';
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
  const compilePct = averageProgress(compileStages);
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
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>全局流水線進度</span>
              <span className="font-mono tabular-nums text-[13px] font-bold text-[#0BB59B]">
                {compilePct}%
              </span>
            </div>
            <div className="flex h-3 gap-1">
              {compileStages.map((stage) => (
                <div
                  key={stage.key}
                  className="relative h-full flex-1 overflow-hidden rounded-full border border-slate-200/70 bg-slate-100"
                  title={`${stage.code}. ${stage.label} ${stage.progress}%`}
                >
                  <div
                    className={cn('h-full transition-all duration-300', stageFillClass(stage))}
                    style={{ width: `${Math.min(100, Math.max(0, stage.progress))}%` }}
                  />
                </div>
              ))}
            </div>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.max(compileStages.length, 1)}, minmax(0, 1fr))` }}
            >
              {compileStages.map((stage) => (
                <div key={stage.key} className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-[#101B2D]">
                    {stage.status === 'done' && (
                      <CheckCircle2 size={12} className="shrink-0 text-[#0BB59B]" />
                    )}
                    {stage.status === 'running' && (
                      <Loader2 size={12} className="shrink-0 text-[#0BB59B] animate-spin" />
                    )}
                    {stage.status === 'error' && (
                      <AlertCircle size={12} className="shrink-0 text-rose-500" />
                    )}
                    <span className="truncate">
                      {stage.code}. {stage.label}
                    </span>
                    <span className="ml-auto shrink-0 font-mono tabular-nums text-slate-500">
                      {stage.progress}%
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">
                    {stage.detail || '等待前置步驟'}
                  </p>
                </div>
              ))}
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
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#101B2D]">
                {mcpStage?.status === 'done' && (
                  <CheckCircle2 size={14} className="text-[#0BB59B]" />
                )}
                {mcpStage?.status === 'running' && (
                  <Loader2 size={14} className="text-[#0BB59B] animate-spin" />
                )}
                {mcpStage?.status === 'error' && (
                  <AlertCircle size={14} className="text-rose-500" />
                )}
                {mcpStage ? `${mcpStage.code}. ${mcpStage.label}` : '04. MCP 畫布寫入'}
              </span>
              <span className="font-mono tabular-nums text-[13px] font-bold text-[#0BB59B]">
                {mcpPct}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200/70">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  mcpStage ? stageFillClass(mcpStage) : 'bg-[#0BB59B]',
                )}
                style={{ width: `${Math.min(100, Math.max(0, mcpPct))}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 truncate">
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
