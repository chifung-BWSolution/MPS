import { cn } from '@/lib/utils';
import { PRODUCTION_TASK_KEYS, PRODUCTION_TASK_LABELS } from '@/lib/videoWorkflowUtils';

export const WORKFLOW_LIST_GRID_PRODUCTION =
  'grid grid-cols-[44px_minmax(96px,0.85fr)_minmax(112px,1.15fr)_92px_repeat(5,36px)_minmax(96px,1fr)_108px_64px_88px] gap-2 items-center min-w-[1128px]';

export const WORKFLOW_LIST_GRID_REVIEW =
  'grid grid-cols-[44px_minmax(96px,0.85fr)_minmax(112px,1.15fr)_92px_repeat(5,36px)_minmax(96px,1fr)_108px_56px] gap-2 items-center min-w-[1028px]';

export const WORKFLOW_LIST_DATE_CELL = 'text-muted-foreground shrink-0 whitespace-nowrap tabular-nums';

type HeaderProps = {
  variant: 'production' | 'review';
  className?: string;
};

export function WorkflowVideoListHeader({ variant, className }: HeaderProps) {
  const grid = variant === 'production' ? WORKFLOW_LIST_GRID_PRODUCTION : WORKFLOW_LIST_GRID_REVIEW;
  return (
    <div className={cn(grid, 'px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground border-b border-border/60', className)}>
      <span>頻道</span>
      <span>Video Code</span>
      <span>主題</span>
      <span className="shrink-0 whitespace-nowrap">拍攝日</span>
      {PRODUCTION_TASK_KEYS.map(key => (
        <span key={key} className="text-center">{PRODUCTION_TASK_LABELS[key]}</span>
      ))}
      <span>影片存放位置</span>
      <span className="shrink-0 whitespace-nowrap">計劃發佈日期</span>
      {variant === 'production' ? (
        <>
          <span />
          <span />
        </>
      ) : (
        <span />
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
