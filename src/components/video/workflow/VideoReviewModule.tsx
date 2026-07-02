import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { useVideoWorkflowListFilter } from '@/hooks/useVideoWorkflowListFilter';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  countWorkflowBinaryStatus,
  filterWorkflowBinaryStatus,
  getReviewScopeVideos,
  isWorkflowPendingReview,
  isWorkflowReviewed,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
  type WorkflowBinaryStatusFilter,
} from '@/lib/videoWorkflowUtils';
import { ProductionProgressMarks } from '@/components/video/workflow/ProductionProgressMarks';
import { ReviewActionModal } from '@/components/video/workflow/ReviewActionModal';
import { WorkflowListFilters } from '@/components/video/workflow/WorkflowListFilters';
import { WorkflowStatusSummaryBar } from '@/components/video/workflow/WorkflowStatusSummaryBar';
import {
  formatWorkflowPlannedPublishDate,
  formatWorkflowStoragePath,
  WORKFLOW_LIST_DATE_CELL,
  WORKFLOW_LIST_GRID_REVIEW,
  WorkflowVideoListHeader,
} from '@/components/video/workflow/workflowListLayout';
import { Button } from '@/components/ui/button';

const REVIEW_STATUS_ITEMS = [
  { id: 'pending', label: '待審核', activeClassName: VIDEO_WORKFLOW_STAGE_COLORS.review },
  { id: 'done', label: '已審核', activeClassName: 'bg-slate-100 text-slate-600' },
] as const;

function ReviewListRow({ video, onReview }: { video: VideoWorkflowMock; onReview: () => void }) {
  const pending = isWorkflowPendingReview(video);

  return (
    <div className={cn(WORKFLOW_LIST_GRID_REVIEW, 'px-3 py-2.5 border-b border-border/50 hover:bg-muted/20 text-[12px]')}>
      <span className="text-muted-foreground font-medium">{video.vchannelCode}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted-foreground truncate">{video.videoCode}</span>
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded shrink-0',
              pending ? VIDEO_WORKFLOW_STAGE_COLORS.review : 'bg-slate-100 text-slate-600',
            )}
          >
            {pending ? VIDEO_WORKFLOW_STAGE_LABELS.review : '已審核'}
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
      {pending ? (
        <Button type="button" size="sm" className="h-7 text-[11px] px-2 bg-teal-600 hover:bg-teal-700 text-white" onClick={onReview}>
          審核
        </Button>
      ) : (
        <span className="text-[11px] text-muted-foreground text-center">—</span>
      )}
    </div>
  );
}

export function VideoReviewModule() {
  const { videos, getById, approveReview, rejectReview } = useVideoWorkflow();
  const { user, userInfo, systemUser } = useAuth();
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<WorkflowBinaryStatusFilter>('all');

  const scopeVideos = useMemo(() => getReviewScopeVideos(videos), [videos]);
  const {
    channels,
    vchannelFilter,
    setVchannelFilter,
    searchQuery,
    setSearchQuery,
    filteredVideos: contextVideos,
  } = useVideoWorkflowListFilter(scopeVideos, 'submittedForReviewAt');

  const statusCounts = useMemo(
    () => countWorkflowBinaryStatus(contextVideos, isWorkflowPendingReview, isWorkflowReviewed),
    [contextVideos],
  );

  const filteredVideos = useMemo(
    () => filterWorkflowBinaryStatus(contextVideos, statusFilter, isWorkflowPendingReview, isWorkflowReviewed),
    [contextVideos, statusFilter],
  );

  const handleStatusClick = (id: string) => {
    setStatusFilter(prev => (prev === id ? 'all' : (id as WorkflowBinaryStatusFilter)));
  };

  const reviewTarget = reviewTargetId ? getById(reviewTargetId) ?? null : null;

  const reviewerName = useMemo(
    () => userInfo?.display_name || systemUser?.display_name || user?.email || 'User',
    [userInfo, systemUser, user],
  );

  const emptyMessage =
    scopeVideos.length === 0
      ? '目前沒有審核相關的影片'
      : statusFilter === 'pending'
        ? '沒有符合條件的待審核影片'
        : statusFilter === 'done'
          ? '沒有符合條件的已審核影片'
          : '沒有符合條件的影片';

  return (
    <div className="space-y-4">
      <WorkflowStatusSummaryBar
        filteredCount={filteredVideos.length}
        contextCount={contextVideos.length}
        activeFilter={statusFilter}
        items={[...REVIEW_STATUS_ITEMS]}
        counts={{ pending: statusCounts.pending, done: statusCounts.done }}
        onSelectAll={() => setStatusFilter('all')}
        onSelectItem={handleStatusClick}
        ariaLabel="審核狀態篩選"
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
          <WorkflowVideoListHeader variant="review" />
          {filteredVideos.map(video => (
            <ReviewListRow
              key={video.id}
              video={video}
              onReview={() => setReviewTargetId(video.id)}
            />
          ))}
        </div>
      )}

      <ReviewActionModal
        open={!!reviewTarget}
        video={reviewTarget}
        onClose={() => setReviewTargetId(null)}
        onApprove={id => approveReview(id, reviewerName)}
        onReject={(id, reason) => rejectReview(id, reason, reviewerName)}
      />
    </div>
  );
}
