import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PRODUCTION_TASK_KEYS, PRODUCTION_TASK_LABELS } from '@/lib/videoWorkflowUtils';

/** 頻道：編號 + 公開名稱 */
const WORKFLOW_LIST_COL_CHANNEL = 'minmax(140px, 1.15fr)';
/** Video Code + 狀態徽章，僅佔內容寬度 */
const WORKFLOW_LIST_COL_VIDEO_CODE = 'max-content';
const WORKFLOW_LIST_COL_TITLE = 'minmax(108px, 1fr)';
const WORKFLOW_LIST_COL_SHOOT_DATE = '92px';
const WORKFLOW_LIST_COL_PROGRESS = 'repeat(5, 52px)';
const WORKFLOW_LIST_COL_STORAGE = 'minmax(88px, 0.85fr)';
const WORKFLOW_LIST_COL_PLANNED_DATE = '108px';

export const WORKFLOW_LIST_GRID_PRODUCTION = [
  'grid grid-cols-[',
  WORKFLOW_LIST_COL_CHANNEL,
  '_',
  WORKFLOW_LIST_COL_VIDEO_CODE,
  '_',
  WORKFLOW_LIST_COL_TITLE,
  '_',
  WORKFLOW_LIST_COL_SHOOT_DATE,
  '_',
  WORKFLOW_LIST_COL_PROGRESS,
  '_',
  WORKFLOW_LIST_COL_STORAGE,
  '_',
  WORKFLOW_LIST_COL_PLANNED_DATE,
  '_64px_88px]',
  'gap-2 items-center min-w-[1100px]',
].join('');

export const WORKFLOW_LIST_GRID_REVIEW = [
  'grid grid-cols-[',
  WORKFLOW_LIST_COL_CHANNEL,
  '_',
  WORKFLOW_LIST_COL_VIDEO_CODE,
  '_',
  WORKFLOW_LIST_COL_TITLE,
  '_',
  WORKFLOW_LIST_COL_SHOOT_DATE,
  '_',
  WORKFLOW_LIST_COL_PROGRESS,
  '_',
  WORKFLOW_LIST_COL_STORAGE,
  '_',
  WORKFLOW_LIST_COL_PLANNED_DATE,
  '_56px]',
  'gap-2 items-center min-w-[1000px]',
].join('');

export const WORKFLOW_LIST_GRID_PUBLISH = [
  'grid grid-cols-[',
  WORKFLOW_LIST_COL_CHANNEL,
  '_',
  WORKFLOW_LIST_COL_VIDEO_CODE,
  '_',
  WORKFLOW_LIST_COL_TITLE,
  '_',
  WORKFLOW_LIST_COL_SHOOT_DATE,
  '_',
  WORKFLOW_LIST_COL_PROGRESS,
  '_',
  WORKFLOW_LIST_COL_STORAGE,
  '_',
  WORKFLOW_LIST_COL_PLANNED_DATE,
  '_96px_56px]',
  'gap-2 items-center min-w-[1040px]',
].join('');

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
    <div className="flex items-center gap-1 w-max max-w-full">
      <span
        className="font-mono text-[11px] text-muted-foreground whitespace-nowrap"
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
