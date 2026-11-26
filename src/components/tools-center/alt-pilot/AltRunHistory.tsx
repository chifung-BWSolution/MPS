import { useState } from 'react';
import { FileClock, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  canDelete: boolean;
  onDelete: (runId: string) => void;
  deletingId: string | null;
}

export function AltRunHistory({
  runs,
  open,
  onOpenChange,
  onSelect,
  loading,
  canDelete,
  onDelete,
  deletingId,
}: AltRunHistoryProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setConfirmId(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[82vh] gap-0 p-0 sm:max-w-[620px]">
        <DialogHeader className="border-b border-border px-6 py-4 pr-12 text-left">
          <DialogTitle className="text-[16px]">歷史紀錄</DialogTitle>
          <DialogDescription className="text-[12px]">
            最近 30 次頁面分析；點擊可重看建議與匯出。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto p-3">
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
                <div
                  key={run.id}
                  className={cn(
                    'overflow-hidden rounded-lg border border-border bg-white transition-colors',
                    confirmId === run.id ? 'border-rose-300' : 'hover:border-teal-300',
                  )}
                >
                  <div className="flex items-start gap-1 p-2">
                    <button
                      type="button"
                      onClick={() => onSelect(run.id)}
                      className="min-w-0 flex-1 rounded-md p-1 text-left transition-colors hover:bg-[#f0fdfa]"
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

                    {canDelete ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-1 h-8 w-8 shrink-0 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`刪除 ${run.page_title || run.page_url}`}
                        onClick={() => setConfirmId(run.id)}
                        disabled={deletingId === run.id}
                      >
                        {deletingId === run.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </Button>
                    ) : null}
                  </div>

                  {confirmId === run.id ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-[11px] text-rose-700">
                        刪除後，這頁的分析與 ALT 建議會一起移除；已匯出的檔案不受影響。
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setConfirmId(null)}
                          disabled={deletingId === run.id}
                        >
                          取消
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            onDelete(run.id);
                            setConfirmId(null);
                          }}
                          disabled={deletingId === run.id}
                        >
                          {deletingId === run.id ? '刪除中…' : '確認刪除'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
