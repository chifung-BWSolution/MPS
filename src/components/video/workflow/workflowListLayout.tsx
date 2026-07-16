import { useState, type MouseEvent, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRODUCTION_TASK_KEYS, PRODUCTION_TASK_LABELS } from '@/lib/videoWorkflowUtils';

// 必須使用完整字面量 class，Tailwind 才能掃描並生成 grid 樣式
export const WORKFLOW_LIST_GRID_PRODUCTION =
  'grid grid-cols-[minmax(100px,152px)_minmax(112px,148px)_minmax(120px,1.2fr)_92px_repeat(5,52px)_minmax(88px,0.85fr)_108px_64px_88px] gap-x-3 gap-y-2 items-center min-w-[1100px]';

export const WORKFLOW_LIST_GRID_REVIEW =
  'grid grid-cols-[minmax(100px,152px)_minmax(112px,148px)_minmax(120px,1.2fr)_92px_repeat(5,52px)_minmax(118px,0.9fr)_108px_88px_88px] gap-x-3 gap-y-2 items-center min-w-[1150px]';

export const WORKFLOW_LIST_GRID_PUBLISH =
  'grid grid-cols-[minmax(100px,152px)_minmax(112px,148px)_minmax(120px,1.2fr)_92px_repeat(5,52px)_minmax(118px,0.9fr)_108px_96px_56px] gap-x-3 gap-y-2 items-center min-w-[1070px]';

export const WORKFLOW_LIST_DATE_CELL = 'text-muted-foreground shrink-0 whitespace-nowrap tabular-nums';

export function WorkflowListChannelCell({
  code,
  publicName,
}: {
  code: string;
  publicName?: string;
}) {
  return (
    <div className="min-w-0 leading-tight">
      <div className="font-mono text-[11px] font-bold truncate" title={code}>
        {code}
      </div>
      {publicName?.trim() ? (
        <div className="text-[10px] text-muted-foreground truncate mt-0.5" title={publicName}>
          {publicName}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowListVideoCodeCell({
  videoCode,
  statusBadge,
}: {
  videoCode: string;
  statusBadge: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 min-w-0 pr-1">
      <span
        className="font-mono text-[11px] text-muted-foreground truncate"
        title={videoCode}
      >
        {videoCode}
      </span>
      {statusBadge}
    </div>
  );
}

type HeaderProps = {
  variant: 'production' | 'review' | 'publish';
  className?: string;
};

export function WorkflowVideoListHeader({ variant, className }: HeaderProps) {
  const grid =
    variant === 'production'
      ? WORKFLOW_LIST_GRID_PRODUCTION
      : variant === 'publish'
        ? WORKFLOW_LIST_GRID_PUBLISH
        : WORKFLOW_LIST_GRID_REVIEW;
  return (
    <div className={cn(grid, 'px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground border-b border-border/60', className)}>
      <span>頻道</span>
      <span>Video Code</span>
      <span>主題</span>
      <span className="shrink-0 whitespace-nowrap">拍攝日</span>
      {PRODUCTION_TASK_KEYS.map(key => (
        <span key={key} className="text-center whitespace-nowrap">{PRODUCTION_TASK_LABELS[key]}</span>
      ))}
      <span>影片存放位置</span>
      <span className="shrink-0 whitespace-nowrap">計劃發佈日期</span>
      {variant === 'production' ? (
        <>
          <span />
          <span />
        </>
      ) : variant === 'publish' ? (
        <>
          <span />
          <span />
        </>
      ) : (
        <>
          <span className="text-center whitespace-nowrap">行政審查</span>
          <span className="text-center whitespace-nowrap">管理批核</span>
        </>
      )}
    </div>
  );
}

export function formatWorkflowPlannedPublishDate(value?: string): string {
  return value?.trim() || '—';
}

export function formatWorkflowStoragePath(value?: string): string {
  return value?.trim() || '—';
}

/** Copy storage path to clipboard; shows — when empty. */
export function CopyStoragePathButton({
  path,
  className,
}: {
  path?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const trimmed = path?.trim() ?? '';

  if (!trimmed) {
    return <span className="text-muted-foreground">—</span>;
  }

  const handleCopy = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={trimmed}
      className={cn(
        'inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium whitespace-nowrap',
        'border border-border bg-white text-teal-700 hover:bg-teal-50 hover:border-teal-200 transition-colors',
        className,
      )}
    >
      <Copy size={12} />
      {copied ? '已複製' : '複製視頻地址'}
    </button>
  );
}
