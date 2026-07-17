import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VideoOutput, VideoOutputStatus } from '@/types/videoOutput';
import {
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

/** Figure-2 style: top accent + soft header wash */
const STATUS_BAR_STYLE: Record<VideoOutputStatus, { border: string; bg: string }> = {
  pending: { border: 'border-slate-400', bg: 'bg-slate-50' },
  in_production: { border: 'border-amber-400', bg: 'bg-amber-50' },
  pending_review: { border: 'border-blue-400', bg: 'bg-blue-50' },
  pending_publish: { border: 'border-purple-400', bg: 'bg-purple-50' },
  published: { border: 'border-teal-400', bg: 'bg-teal-50' },
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

function sortMonthKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    if (a === UNASSIGNED_MONTH_KEY) return 1;
    if (b === UNASSIGNED_MONTH_KEY) return -1;
    return b.localeCompare(a);
  });
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

type MonthGroup = {
  key: string;
  videos: VideoOutput[];
};

function groupByMonth(videos: VideoOutput[]): MonthGroup[] {
  const map = new Map<string, VideoOutput[]>();
  for (const video of videos) {
    const key = getVideoMonthKey(video);
    const list = map.get(key);
    if (list) list.push(video);
    else map.set(key, [video]);
  }
  return sortMonthKeys([...map.keys()]).map(key => ({
    key,
    videos: map.get(key)!,
  }));
}

type Props = {
  videos: VideoOutput[];
  workLogTotals: Map<string, number>;
  onPublish?: (video: VideoOutput) => void;
};

export function VideoCoordinationStatusView({ videos, workLogTotals, onPublish }: Props) {
  const currentMonthKey = useMemo(() => getCurrentMonthKey(), []);

  const statusCounts = useMemo(() => {
    const counts: Record<VideoOutputStatus, number> = {
      pending: 0,
      in_production: 0,
      pending_review: 0,
      pending_publish: 0,
      published: 0,
    };
    for (const video of videos) {
      counts[deriveVideoOutputStatus(video)]++;
    }
    return counts;
  }, [videos]);

  const videosByStatus = useMemo(() => {
    const map = {} as Record<VideoOutputStatus, VideoOutput[]>;
    for (const status of STATUS_COLUMNS) map[status] = [];
    for (const video of videos) {
      map[deriveVideoOutputStatus(video)].push(video);
    }
    return map;
  }, [videos]);

  /** Which status sections are expanded; null = default (all with videos) */
  const [expandedStatuses, setExpandedStatuses] = useState<Set<VideoOutputStatus> | null>(null);

  const defaultExpandedStatuses = useMemo(() => {
    const keys = new Set<VideoOutputStatus>();
    for (const status of STATUS_COLUMNS) {
      if (statusCounts[status] > 0) keys.add(status);
    }
    return keys;
  }, [statusCounts]);

  const activeStatuses = expandedStatuses ?? defaultExpandedStatuses;

  const toggleStatus = (status: VideoOutputStatus) => {
    setExpandedStatuses(prev => {
      const base = prev ?? defaultExpandedStatuses;
      const next = new Set(base);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  /** Expanded months keyed by `${status}:${monthKey}`; null = defaults */
  const [expandedMonths, setExpandedMonths] = useState<Set<string> | null>(null);

  const defaultExpandedMonths = useMemo(() => {
    const keys = new Set<string>();
    for (const status of STATUS_COLUMNS) {
      const months = groupByMonth(videosByStatus[status]);
      if (months.some(m => m.key === currentMonthKey)) {
        keys.add(`${status}:${currentMonthKey}`);
      } else if (months[0]) {
        keys.add(`${status}:${months[0].key}`);
      }
    }
    return keys;
  }, [videosByStatus, currentMonthKey]);

  const activeMonths = expandedMonths ?? defaultExpandedMonths;

  const toggleMonth = (status: VideoOutputStatus, monthKey: string) => {
    const id = `${status}:${monthKey}`;
    setExpandedMonths(prev => {
      const base = prev ?? defaultExpandedMonths;
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Figure-2 status bar — stays above the list */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2"
        role="group"
        aria-label="狀態分組"
      >
        {STATUS_COLUMNS.map(status => {
          const style = STATUS_BAR_STYLE[status];
          const expanded = activeStatuses.has(status);
          const count = statusCounts[status];
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              className={cn(
                'flex items-center justify-between gap-2 px-3 py-2.5 rounded-md border-t-2 text-left transition-all',
                style.border,
                style.bg,
                expanded
                  ? 'ring-2 ring-teal-600/25 shadow-sm'
                  : 'opacity-80 hover:opacity-100',
              )}
            >
              <span className="text-[13px] font-bold text-foreground/90">
                {VIDEO_OUTPUT_STATUS_LABELS[status]}
              </span>
              <span className="text-[11px] bg-white px-1.5 py-0.5 rounded shadow-sm font-medium tabular-nums shrink-0">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status → Month groups */}
      <div className="space-y-3">
        {STATUS_COLUMNS.map(status => {
          if (!activeStatuses.has(status)) return null;

          const statusVideos = videosByStatus[status];
          const monthGroups = groupByMonth(statusVideos);
          const style = STATUS_BAR_STYLE[status];

          return (
            <div
              key={status}
              className={cn(
                'rounded-md border border-[rgba(13,26,45,0.08)] bg-white shadow-card overflow-hidden border-t-2',
                style.border,
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-between px-4 py-2.5',
                  style.bg,
                )}
              >
                <span className="text-[14px] font-bold">
                  {VIDEO_OUTPUT_STATUS_LABELS[status]}
                </span>
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  {statusVideos.length} 部
                </span>
              </div>

              {statusVideos.length === 0 ? (
                <div className="text-center py-10 text-[12px] text-muted-foreground border-t border-border/50">
                  暫無影片
                </div>
              ) : (
                <div className="divide-y divide-border/50 border-t border-border/50">
                  {monthGroups.map(month => {
                    const monthId = `${status}:${month.key}`;
                    const monthExpanded = activeMonths.has(monthId);
                    const isCurrent = month.key === currentMonthKey;

                    return (
                      <div key={month.key}>
                        <button
                          type="button"
                          onClick={() => toggleMonth(status, month.key)}
                          className={cn(
                            'w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors',
                            isCurrent && 'bg-teal-50/40',
                          )}
                        >
                          {monthExpanded ? (
                            <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                          )}
                          <span
                            className={cn(
                              'text-[13px] font-semibold',
                              isCurrent ? 'text-teal-700' : 'text-foreground',
                            )}
                          >
                            {formatMonthLabel(month.key)}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-600 text-white">
                              本月
                            </span>
                          )}
                          <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">
                            {month.videos.length} 部
                          </span>
                        </button>

                        {monthExpanded && (
                          <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
                            {month.videos.map(video => (
                              <StatusVideoCard
                                key={video.id}
                                video={video}
                                hours={workLogTotals.get(video.id)}
                                onPublish={onPublish}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
