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
  isWorkflowPendingPublish,
  isWorkflowPublished,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
  type WorkflowBinaryStatusFilter,
} from '@/lib/videoWorkflowUtils';
import { ProductionProgressMarks } from '@/components/video/workflow/ProductionProgressMarks';
import { WorkflowListFilters } from '@/components/video/workflow/WorkflowListFilters';
import { WorkflowStatusSummaryBar } from '@/components/video/workflow/WorkflowStatusSummaryBar';
import { PlatformPublishModal } from '@/components/video/PlatformPublishModal';
import {
  CopyStoragePathButton,
  formatWorkflowPlannedPublishDate,
  WORKFLOW_LIST_DATE_CELL,
  WORKFLOW_LIST_GRID_PUBLISH,
  WorkflowListChannelCell,
  WorkflowListVideoCodeCell,
  WorkflowVideoListHeader,
} from '@/components/video/workflow/workflowListLayout';
import { Button } from '@/components/ui/button';

const PUBLISH_STATUS_ITEMS = [
  { id: 'pending', label: '待發佈', activeClassName: VIDEO_WORKFLOW_STAGE_COLORS.publish },
  { id: 'done', label: '已發佈', activeClassName: VIDEO_WORKFLOW_STAGE_COLORS.published },
] as const;

function PublishListRow({
  video,
  onPublish,
}: {
  video: VideoWorkflowMock;
  onPublish: () => void;
}) {
  const pending = isWorkflowPendingPublish(video);

  return (
    <div className={cn(WORKFLOW_LIST_GRID_PUBLISH, 'px-3 py-2.5 border-b border-border/50 hover:bg-muted/20 text-[12px]')}>
      <WorkflowListChannelCell code={video.vchannelCode} publicName={video.vchannelPublicName} />
      <WorkflowListVideoCodeCell
        videoCode={video.videoCode}
        statusBadge={
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap',
              pending ? VIDEO_WORKFLOW_STAGE_COLORS.publish : VIDEO_WORKFLOW_STAGE_COLORS.published,
            )}
          >
            {pending ? VIDEO_WORKFLOW_STAGE_LABELS.publish : VIDEO_WORKFLOW_STAGE_LABELS.published}
          </span>
        }
      />
      <p className="font-semibold truncate min-w-0" title={video.title}>{video.title}</p>
      <span className={WORKFLOW_LIST_DATE_CELL}>{video.shootAt ?? '—'}</span>
      <ProductionProgressMarks video={video} />
      <CopyStoragePathButton path={video.storagePath} />
      <span className={WORKFLOW_LIST_DATE_CELL}>{formatWorkflowPlannedPublishDate(video.plannedPublishDate)}</span>
      <Button
        type="button"
        size="sm"
        className={cn(
          'h-7 text-[11px] px-2',
          pending
            ? 'bg-teal-600 hover:bg-teal-700 text-white'
            : 'bg-white border border-border text-[#0d1a2d] hover:bg-muted/40',
        )}
        onClick={onPublish}
      >
        {pending ? '發佈' : '編輯'}
      </Button>
    </div>
  );
}

export function VideoPublishModule() {
  const { videos, getVideoOutputById, updateVideo, completePublish } = useVideoWorkflow();
  const [publishTargetId, setPublishTargetId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<WorkflowBinaryStatusFilter>('pending');

  const scopeVideos = useMemo(() => getPublishScopeVideos(videos), [videos]);
  const {
    channels,
    vchannelFilter,
    setVchannelFilter,
    searchQuery,
    setSearchQuery,
    yearFilter,
    setYearFilter,
    yearOptions,
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

  const publishTargetVideo = publishTargetId ? getVideoOutputById(publishTargetId) ?? null : null;
  const publishTargetWorkflow = publishTargetId
    ? videos.find(v => v.id === publishTargetId)
    : undefined;

  const handleSavePublish = async (input: Partial<VideoOutputInput>) => {
    if (!publishTargetId) return new Error('未選擇影片');

    const err = await updateVideo(publishTargetId, {
      platformPublish: input.platformPublish,
      publishedDate: input.publishedDate,
    });
    if (err) return new Error(err);

    // 待發佈：保存平台資料後一併標記為已發佈
    if (publishTargetWorkflow && isWorkflowPendingPublish(publishTargetWorkflow)) {
      const pubErr = await completePublish(publishTargetId, {});
      if (pubErr) return new Error(pubErr);
    }

    return null;
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
        yearFilter={yearFilter}
        onYearFilterChange={setYearFilter}
        yearOptions={yearOptions}
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
              onPublish={() => setPublishTargetId(video.id)}
            />
          ))}
        </div>
      )}

      {publishTargetVideo && (
        <PlatformPublishModal
          video={publishTargetVideo}
          onClose={() => setPublishTargetId(null)}
          onSave={handleSavePublish}
        />
      )}
    </div>
  );
}
