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
  globalProgressPct: number;
  isRunning: boolean;
  stages: ExecutionStageState[];
  logs: WorkbenchLogEntry[];
}

export function ExecutionProgressModal({
  open,
  onOpenChange,
  globalProgressPct,
  isRunning,
  stages,
  logs,
}: ExecutionProgressModalProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border-slate-200">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-[16px] font-bold text-[#101B2D] flex items-center gap-2">
                <span>編譯與遠端 MCP 寫入監控</span>
                {isRunning && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0BB59B]/15 text-[#08967F] text-[11px] font-semibold">
                    <Loader2 size={11} className="animate-spin" />
                    執行中
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-[12px] text-slate-500 mt-1">
                Edge Function 清洗 IR JSON 並透過 Streamable HTTP 分步寫入 mcp.framer.com
              </DialogDescription>
            </div>
            <span className="text-[20px] font-extrabold font-mono text-[#0BB59B] tabular-nums">
              {globalProgressPct}%
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Global Progress Bar with shimmer while running */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>全局流水線進度</span>
              <span className="font-mono tabular-nums">{globalProgressPct} / 100%</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200/70">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  isRunning
                    ? 'bg-gradient-to-r from-[#0BB59B] via-[#34E4C8] to-[#0BB59B] animate-rf-shimmer'
                    : 'bg-[#0BB59B]',
                )}
                style={{ width: `${Math.min(100, Math.max(0, globalProgressPct))}%` }}
              />
            </div>
          </div>

          {/* 4-Stage Meters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {stages.map((stage) => (
              <div
                key={stage.key}
                className={cn(
                  'rounded-lg border p-3 space-y-2 transition-colors',
                  stage.status === 'running'
                    ? 'border-[#0BB59B] bg-teal-50/40'
                    : stage.status === 'error'
                      ? 'border-rose-300 bg-rose-50/40'
                      : 'border-slate-200 bg-slate-50/60',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-[#101B2D]">
                    {stage.code}. {stage.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums">
                    {stage.status === 'done' && (
                      <CheckCircle2 size={13} className="text-[#0BB59B]" />
                    )}
                    {stage.status === 'running' && (
                      <Loader2 size={13} className="text-[#0BB59B] animate-spin" />
                    )}
                    {stage.status === 'error' && (
                      <AlertCircle size={13} className="text-rose-500" />
                    )}
                    <span className="text-slate-600">{stage.progress}%</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-300',
                      stage.status === 'error' ? 'bg-rose-500' : 'bg-[#0BB59B]',
                    )}
                    style={{ width: `${stage.progress}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {stage.detail || '等待前置步驟'}
                </p>
              </div>
            ))}
          </div>

          {/* Terminal Log Viewer */}
          <div className="rounded-lg border border-[#1E2E48] bg-[#0B1322] text-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-[#101B2D] border-b border-white/10 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 font-mono text-slate-300">
                <Terminal size={12} className="text-[#0BB59B]" />
                <span>Edge Function &amp; MCP Logs</span>
              </div>
              <span className="text-slate-400 font-mono text-[10px]">
                {logs.length} entries
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px] leading-relaxed">
              {logs.length === 0 ? (
                <div className="text-slate-500">
                  等待觸發解析或 Framer MCP 同步…
                </div>
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
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
