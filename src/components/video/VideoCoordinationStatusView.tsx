import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VideoOutput, VideoOutputStatus } from '@/types/videoOutput';
import {
  VIDEO_OUTPUT_STATUS_COLORS,
  VIDEO_OUTPUT_STATUS_LABELS,
  deriveVideoOutputStatus,
  formatShootLocation,
  getEffectivePublishDate,
} from '@/lib/videoOutputUtils';

const STATUS_COLUMNS: VideoOutputStatus[] = [
  'pending',
  'in_production',
  'pending_review',
  'pending_publish',
  'published',
];

const COLUMN_BORDER: Record<VideoOutputStatus, string> = {
  pending: 'border-slate-300',
  in_production: 'border-amber-400',
  pending_review: 'border-blue-400',
  pending_publish: 'border-purple-400',
  published: 'border-teal-400',
};

const COLUMN_HEADER_BG: Record<VideoOutputStatus, string> = {
  pending: 'bg-slate-50',
  in_production: 'bg-amber-50',
  pending_review: 'bg-blue-50',
  pending_publish: 'bg-purple-50',
  published: 'bg-teal-50',
};

const CATEGORY_COLORS = {
  internal: 'bg-sky-100 text-sky-700',
  client: 'bg-orange-100 text-orange-700',
} as const;

const UNASSIGNED_MONTH_KEY = 'unassigned';

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Group by publish/planned date month; fall back to shoot date; undated → unassigned */
function getVideoMonthKey(video: VideoOutput): string {
  const date = getEffectivePublishDate(video) || video.shootAt?.trim() || null;
  if (!date) return UNASSIGNED_MONTH_KEY;
  const match = date.match(/^(\d{4})-(\d{2})/);
  if (!match) return UNASSIGNED_MONTH_KEY;
  return `${match[1]}-${match[2]}`;
}

function formatMonthLabel(monthKey: string): string {
  if (monthKey === UNASSIGNED_MONTH_KEY) return '未定日期';
  const [year, month] = monthKey.split('-');
  return `${year}年${Number(month)}月`;
}

function getMilestoneProgress(video: VideoOutput): { done: number; total: number } {
  const milestones = [
    Boolean(video.shootAt?.trim() || video.shootHk || video.shootSz),
    video.rawFootageDone,
    video.needsEditing != null,
    video.demoDone,
    video.copySc || video.copyTc || video.copyEn,
  ];
  const done = milestones.filter(Boolean).length;
  return { done, total: milestones.length };
}

function StatusVideoCard({
  video,
  hours,
  onPublish,
}: {
  video: VideoOutput;
  hours?: number;
  onPublish?: (video: VideoOutput) => void;
}) {
  const status = deriveVideoOutputStatus(video);
  const { done, total } = getMilestoneProgress(video);
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const dateLabel =
    status === 'published'
      ? video.publishedDate?.trim() || video.plannedPublishDate?.trim()
      : video.plannedPublishDate?.trim() || video.shootAt?.trim();
  const datePrefix = status === 'published' ? '發佈' : video.plannedPublishDate?.trim() ? '計劃' : '拍攝';
  const location = formatShootLocation(video.shootHk, video.shootSz);

  return (
    <div
      className={cn(
        'bg-white rounded border border-border/50 p-3 transition-shadow hover:shadow-md',
        status === 'published' && onPublish && 'cursor-pointer',
      )}
      onClick={status === 'published' && onPublish ? () => onPublish(video) : undefined}
      role={status === 'published' && onPublish ? 'button' : undefined}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-[13px] font-medium line-clamp-2" title={video.title}>
          {video.title}
        </span>
        <span
          className={cn(
            'shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded',
            CATEGORY_COLORS[video.projectCategory],
          )}
        >
          {video.projectCategory === 'internal' ? '內部' : '客戶'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
        <span className="font-mono font-semibold text-foreground/80">{video.channelCode}</span>
        <span>·</span>
        <span className="font-mono truncate" title={video.videoCode}>{video.videoCode}</span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          {dateLabel ? `${datePrefix}: ${dateLabel}` : location !== '—' ? location : '—'}
        </span>
        {hours != null && hours > 0 && (
          <span className="shrink-0 font-medium text-teal-700 tabular-nums">{hours.toFixed(1)}h</span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

function MonthStatusBoard({
  videos,
  workLogTotals,
  onPublish,
}: {
  videos: VideoOutput[];
  workLogTotals: Map<string, number>;
  onPublish?: (video: VideoOutput) => void;
}) {
  const columns = STATUS_COLUMNS.reduce(
    (acc, status) => {
      acc[status] = videos.filter(v => deriveVideoOutputStatus(v) === status);
      return acc;
    },
    {} as Record<VideoOutputStatus, VideoOutput[]>,
  );

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 min-w-[900px] xl:min-w-0">
        {STATUS_COLUMNS.map(status => (
          <div
            key={status}
            className={cn(
              'rounded-md p-3 border-t-2 min-h-[160px] bg-muted/20',
              COLUMN_BORDER[status],
            )}
          >
            <div
              className={cn(
                'flex items-center justify-between mb-3 px-2 py-1.5 rounded',
                COLUMN_HEADER_BG[status],
              )}
            >
              <span className="text-[13px] font-bold flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-block w-2 h-2 rounded-full',
                    VIDEO_OUTPUT_STATUS_COLORS[status].split(' ')[0],
                  )}
                />
                {VIDEO_OUTPUT_STATUS_LABELS[status]}
              </span>
              <span className="text-[11px] bg-white px-1.5 py-0.5 rounded shadow-sm font-medium tabular-nums">
                {columns[status].length}
              </span>
            </div>

            <div className="space-y-2">
              {columns[status].map(video => (
                <StatusVideoCard
                  key={video.id}
                  video={video}
                  hours={workLogTotals.get(video.id)}
                  onPublish={onPublish}
                />
              ))}
              {columns[status].length === 0 && (
                <div className="text-center py-6 text-[12px] text-muted-foreground">暫無影片</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type MonthGroup = {
  key: string;
  videos: VideoOutput[];
};

type Props = {
  videos: VideoOutput[];
  workLogTotals: Map<string, number>;
  onPublish?: (video: VideoOutput) => void;
};

export function VideoCoordinationStatusView({ videos, workLogTotals, onPublish }: Props) {
  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);

  const monthGroups = useMemo((): MonthGroup[] => {
    const map = new Map<string, VideoOutput[]>();
    for (const video of videos) {
      const key = getVideoMonthKey(video);
      const list = map.get(key);
      if (list) list.push(video);
      else map.set(key, [video]);
    }

    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === UNASSIGNED_MONTH_KEY) return 1;
        if (b === UNASSIGNED_MONTH_KEY) return -1;
        return b.localeCompare(a); // YYYY-MM descending
      })
      .map(([key, groupVideos]) => ({ key, videos: groupVideos }));
  }, [videos]);

  /** null = use default (current month, or newest if current has no videos) */
  const [expandedOverride, setExpandedOverride] = useState<Set<string> | null>(null);

  const defaultExpanded = useMemo(() => {
    const keys = new Set<string>();
    if (monthGroups.some(g => g.key === currentMonthKey)) {
      keys.add(currentMonthKey);
    } else if (monthGroups[0]) {
      keys.add(monthGroups[0].key);
    }
    return keys;
  }, [monthGroups, currentMonthKey]);

  const expandedMonths = expandedOverride ?? defaultExpanded;

  const toggleMonth = (key: string) => {
    setExpandedOverride(prev => {
      const base = prev ?? defaultExpanded;
      const next = new Set(base);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {monthGroups.map(group => {
        const expanded = expandedMonths.has(group.key);
        const isCurrent = group.key === currentMonthKey;

        return (
          <div
            key={group.key}
            className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white shadow-card overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleMonth(group.key)}
              className={cn(
                'w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors',
                isCurrent && 'bg-teal-50/40',
              )}
            >
              {expanded ? (
                <ChevronDown size={14} className="text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              )}
              <span
                className={cn(
                  'text-[14px] font-semibold',
                  isCurrent ? 'text-teal-700' : 'text-foreground',
                )}
              >
                {formatMonthLabel(group.key)}
              </span>
              {isCurrent && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-600 text-white">
                  本月
                </span>
              )}
              <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">
                {group.videos.length} 部
              </span>
            </button>

            {expanded && (
              <div className="px-3 pb-3 pt-1 border-t border-border/50">
                <MonthStatusBoard
                  videos={group.videos}
                  workLogTotals={workLogTotals}
                  onPublish={onPublish}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
