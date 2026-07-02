import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { useVideoWorkflowListFilter } from '@/hooks/useVideoWorkflowListFilter';
import type { VideoOutputInput } from '@/types/videoOutput';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  countWorkflowBinaryStatus,
  filterWorkflowBinaryStatus,
  getPublishScopeVideos,
  isPublishComplete,
  isWorkflowPendingPublish,
  isWorkflowPublished,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
  type WorkflowBinaryStatusFilter,
} from '@/lib/videoWorkflowUtils';
import { ProductionProgressMarks } from '@/components/video/workflow/ProductionProgressMarks';
import { PublishConfirmModal } from '@/components/video/workflow/PublishConfirmModal';
import { WorkflowListFilters } from '@/components/video/workflow/WorkflowListFilters';
import { WorkflowStatusSummaryBar } from '@/components/video/workflow/WorkflowStatusSummaryBar';
import { PlatformPublishModal } from '@/components/video/PlatformPublishModal';
import {
  formatWorkflowPlannedPublishDate,
  formatWorkflowStoragePath,
  WORKFLOW_LIST_DATE_CELL,
  WORKFLOW_LIST_GRID_PUBLISH,
  WorkflowVideoListHeader,
} from '@/components/video/workflow/workflowListLayout';
import { Button } from '@/components/ui/button';

const PUBLISH_STATUS_ITEMS = [
  { id: 'pending', label: '待發佈', activeClassName: VIDEO_WORKFLOW_STAGE_COLORS.publish },
  { id: 'done', label: '已發佈', activeClassName: VIDEO_WORKFLOW_STAGE_COLORS.published },
] as const;

function PublishListRow({
  video,
  onOpenPublishRecord,
  onPublish,
}: {
  video: VideoWorkflowMock;
  onOpenPublishRecord: () => void;
  onPublish: () => void;
}) {
  const pending = isWorkflowPendingPublish(video);
  const canPublish = pending && isPublishComplete(video);

  return (
    <div className={cn(WORKFLOW_LIST_GRID_PUBLISH, 'px-3 py-2.5 border-b border-border/50 hover:bg-muted/20 text-[12px]')}>
      <span className="text-muted-foreground font-medium">{video.vchannelCode}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted-foreground truncate">{video.videoCode}</span>
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded shrink-0',
              pending ? VIDEO_WORKFLOW_STAGE_COLORS.publish : VIDEO_WORKFLOW_STAGE_COLORS.published,
            )}
          >
            {pending ? VIDEO_WORKFLOW_STAGE_LABELS.publish : VIDEO_WORKFLOW_STAGE_LABELS.published}
          </span>
        </div>
      </div>
      <p className="font-semibold truncate min-w-0" title={video.title}>{video.title}</p>
      <span className={WORKFLOW_LIST_DATE_CELL}>{video.shootAt ?? '—'}</span>
      <ProductionProgressMarks video={video} />
      <span className="text-muted-foreground truncate" title={video.storagePath}>
        {formatWorkflowStoragePath(video.storagePath)}
      </span>
      <span className={WORKFLOW_LIST_DATE_CELL}>{formatWorkflowPlannedPublishDate(video.plannedPublishDate)}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-[11px] px-2"
        onClick={onOpenPublishRecord}
      >
        平台發佈記錄
      </Button>
      {pending ? (
        <Button
          type="button"
          size="sm"
          className="h-7 text-[11px] px-2 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
          onClick={onPublish}
          disabled={!canPublish}
          title={canPublish ? undefined : '請先填寫至少一個平台發佈鏈接'}
        >
          發佈
        </Button>
      ) : (
        <span className="text-[11px] text-muted-foreground text-center">—</span>
      )}
    </div>
  );
}

export function VideoPublishModule() {
  const { videos, getVideoOutputById, updateVideo, completePublish } = useVideoWorkflow();
  const [publishRecordTargetId, setPublishRecordTargetId] = useState<string | null>(null);
  const [publishConfirmTargetId, setPublishConfirmTargetId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<WorkflowBinaryStatusFilter>('all');

  const scopeVideos = useMemo(() => getPublishScopeVideos(videos), [videos]);
  const {
    channels,
    vchannelFilter,
    setVchannelFilter,
    searchQuery,
    setSearchQuery,
    filteredVideos: contextVideos,
  } = useVideoWorkflowListFilter(scopeVideos, 'submittedForReviewAt');

  const statusCounts = useMemo(
    () => countWorkflowBinaryStatus(contextVideos, isWorkflowPendingPublish, isWorkflowPublished),
    [contextVideos],
  );

  const filteredVideos = useMemo(
    () => filterWorkflowBinaryStatus(contextVideos, statusFilter, isWorkflowPendingPublish, isWorkflowPublished),
    [contextVideos, statusFilter],
  );

  const handleStatusClick = (id: string) => {
    setStatusFilter(prev => (prev === id ? 'all' : (id as WorkflowBinaryStatusFilter)));
  };

  const publishRecordVideo = publishRecordTargetId ? getVideoOutputById(publishRecordTargetId) ?? null : null;
  const publishConfirmTarget = publishConfirmTargetId
    ? videos.find(v => v.id === publishConfirmTargetId)
    : undefined;

  const handleSavePublish = async (input: Partial<VideoOutputInput>) => {
    if (!publishRecordTargetId) return new Error('未選擇影片');
    const err = await updateVideo(publishRecordTargetId, {
      platformPublish: input.platformPublish,
      publishedDate: input.publishedDate,
    });
    if (err) return new Error(err);
    return null;
  };

  const handleConfirmPublish = async (videoId: string) => {
    const err = await completePublish(videoId, {});
    if (err) return;
    setPublishConfirmTargetId(null);
  };

  const emptyMessage =
    scopeVideos.length === 0
      ? '目前沒有發佈相關的影片（需先完成審核）'
      : statusFilter === 'pending'
        ? '沒有符合條件的待發佈影片'
        : statusFilter === 'done'
          ? '沒有符合條件的已發佈影片'
          : '沒有符合條件的影片';

  return (
    <div className="space-y-4">
      <WorkflowStatusSummaryBar
        filteredCount={filteredVideos.length}
        contextCount={contextVideos.length}
        activeFilter={statusFilter}
        items={[...PUBLISH_STATUS_ITEMS]}
        counts={{ pending: statusCounts.pending, done: statusCounts.done }}
        onSelectAll={() => setStatusFilter('all')}
        onSelectItem={handleStatusClick}
        ariaLabel="發佈狀態篩選"
      />

      <WorkflowListFilters
        channels={channels}
        vchannelFilter={vchannelFilter}
        onVchannelFilterChange={setVchannelFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      {filteredVideos.length === 0 ? (
        <div className="text-center py-16 text-[13px] text-muted-foreground bg-white rounded-md border">
          {emptyMessage}
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-x-auto">
          <WorkflowVideoListHeader variant="publish" />
          {filteredVideos.map(video => (
            <PublishListRow
              key={video.id}
              video={video}
              onOpenPublishRecord={() => setPublishRecordTargetId(video.id)}
              onPublish={() => setPublishConfirmTargetId(video.id)}
            />
          ))}
        </div>
      )}

      {publishRecordVideo && (
        <PlatformPublishModal
          video={publishRecordVideo}
          onClose={() => setPublishRecordTargetId(null)}
          onSave={handleSavePublish}
        />
      )}

      <PublishConfirmModal
        open={!!publishConfirmTarget}
        video={publishConfirmTarget}
        onClose={() => setPublishConfirmTargetId(null)}
        onConfirm={handleConfirmPublish}
      />
    </div>
  );
}
