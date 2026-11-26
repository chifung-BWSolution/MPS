import { FileClock, Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ALT_RUN_STATUS_LABELS,
  type AltRunRow,
  type AltRunStatus,
} from '@/lib/altTypes.ts';
import { cn } from '@/lib/utils';
import { formatDateTime } from './AltPilotUtils';

const RUN_STATUS_CLASS: Record<AltRunStatus, string> = {
  analyzed: 'border-slate-200 bg-slate-50 text-slate-600',
  generating: 'border-amber-200 bg-amber-50 text-amber-700',
  ready: 'border-teal-200 bg-teal-50 text-teal-700',
  exported: 'border-blue-200 bg-blue-50 text-blue-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  archived: 'border-slate-200 bg-slate-100 text-slate-500',
};

export interface AltRunHistoryProps {
  runs: AltRunRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (runId: string) => void;
  loading: boolean;
}

export function AltRunHistory({ runs, open, onOpenChange, onSelect, loading }: AltRunHistoryProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
        <SheetHeader className="shrink-0 space-y-1 border-b border-border px-6 py-4 pr-12 text-left">
          <SheetTitle className="text-[16px]">歷史紀錄</SheetTitle>
          <SheetDescription className="text-[12px]">
            最近 30 次頁面分析；點擊可重看建議與匯出。
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              載入中…
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
              <FileClock size={28} className="opacity-40" />
              <p className="text-[12px]">還沒有分析紀錄。貼上頁面 URL 開始第一次。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onSelect(run.id)}
                  className="w-full rounded-lg border border-border bg-white p-3 text-left transition-colors hover:border-teal-300 hover:bg-[#f0fdfa]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-[#0d1a2d]">
                        {run.page_title || run.page_url}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {run.page_host}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        RUN_STATUS_CLASS[run.status],
                      )}
                    >
                      {ALT_RUN_STATUS_LABELS[run.status]}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                    <span>{formatDateTime(run.created_at)}</span>
                    <span>·</span>
                    <span>{run.image_count} 張</span>
                    <span>·</span>
                    <span>已生成 {run.generated_count}</span>
                    {run.keyword ? (
                      <>
                        <span>·</span>
                        <span className="truncate">{run.keyword}</span>
                      </>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
