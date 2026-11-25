import { useEffect, useMemo, useRef, useState } from 'react';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FramerSyncJob } from '@/types/readdyFramer';

interface PageAnalysisHistoryMenuProps {
  jobs: FramerSyncJob[];
  activePagePath: string | null;
  activeJobId: string | null;
  onSelectJob: (job: FramerSyncJob) => void;
}

const STATUS_LABEL: Record<FramerSyncJob['status'], string> = {
  pending: '待處理',
  parsed: '已分析',
  syncing: '寫入中',
  completed: '已上傳',
  failed: '失敗',
};

function formatAnalysisTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-HK', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function groupPageAnalyses(jobs: FramerSyncJob[], activePath: string | null) {
  const map = new Map<string, { path: string; title: string; jobs: FramerSyncJob[] }>();
  for (const job of jobs) {
    const path = job.page_path || job.ir_payload?.pageMeta?.path || '（未標示頁面）';
    const title = job.page_title || job.ir_payload?.pageMeta?.title || path;
    const group = map.get(path);
    if (group) group.jobs.push(job);
    else map.set(path, { path, title, jobs: [job] });
  }
  const groups = [...map.values()];
  for (const group of groups) {
    group.jobs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
  groups.sort((a, b) => {
    if (activePath && a.path === activePath) return -1;
    if (activePath && b.path === activePath) return 1;
    const aTime = a.jobs[0]?.created_at || '';
    const bTime = b.jobs[0]?.created_at || '';
    return aTime < bTime ? 1 : -1;
  });
  return groups;
}

export function PageAnalysisHistoryMenu({
  jobs,
  activePagePath,
  activeJobId,
  onSelectJob,
}: PageAnalysisHistoryMenuProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const groups = useMemo(() => groupPageAnalyses(jobs, activePagePath), [jobs, activePagePath]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setOpen(true);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        title="每個頁面每一次分析的記錄"
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-medium transition-colors',
          open
            ? 'border-[#0BB59B] bg-teal-50 text-[#08967F]'
            : 'border-slate-200 bg-white text-[#101B2D] hover:bg-slate-50',
        )}
      >
        <History size={13} className={open ? 'text-[#0BB59B]' : 'text-slate-500'} />
        <span>分析記錄 ({jobs.length})</span>
      </button>
      {open && anchor && (
        <div
          className="fixed z-50 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white text-[#101B2D] shadow-xl"
          style={{ top: anchor.top, right: anchor.right }}
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
            <div>
              <div className="text-[11px] font-semibold text-slate-600">頁面分析記錄</div>
              <div className="text-[10px] text-slate-400">每一次解析各自留一筆</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-slate-400 hover:text-slate-700"
            >
              關閉
            </button>
          </div>
          {groups.length === 0 ? (
            <div className="p-4 text-center text-[12px] leading-relaxed text-slate-400">
              尚無頁面分析。每次解析頁面都會記在這裡。
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {groups.map((group) => {
                const isCurrent = Boolean(activePagePath && group.path === activePagePath);
                return (
                  <div key={group.path} className="border-b border-slate-100 last:border-b-0">
                    <div className="sticky top-0 bg-white/95 px-3 py-1.5 text-[10px] font-semibold text-slate-500 backdrop-blur-sm">
                      {isCurrent ? '此頁 · ' : ''}
                      <span className="font-mono">{group.path}</span>
                      {group.title && group.title !== group.path ? ` · ${group.title}` : ''}
                    </div>
                    {group.jobs.map((job) => {
                      const sectionCount = job.ir_payload?.sections?.length;
                      return (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => {
                            onSelectJob(job);
                            setOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50',
                            activeJobId === job.id && 'bg-teal-50/70',
                          )}
                        >
                          <span className="truncate text-[11px] text-slate-600">
                            {formatAnalysisTime(job.created_at)}
                            {typeof sectionCount === 'number' ? ` · ${sectionCount} 個區塊` : ''}
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]',
                              job.status === 'completed' && 'bg-emerald-50 text-emerald-700',
                              job.status === 'failed' && 'bg-rose-50 text-rose-700',
                              job.status === 'syncing' && 'bg-amber-50 text-amber-700',
                              (job.status === 'parsed' || job.status === 'pending') &&
                                'bg-slate-100 text-slate-600',
                            )}
                          >
                            {STATUS_LABEL[job.status] || job.status}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
