import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { useVideoWorkflowListFilter } from '@/hooks/useVideoWorkflowListFilter';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  canDoAdminReview,
  canDoManagementReview,
  countWorkflowBinaryStatus,
  filterWorkflowBinaryStatus,
  getReviewScopeVideos,
  isAdminReviewPassed,
  isWorkflowPendingReview,
  isWorkflowReviewed,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
  type WorkflowBinaryStatusFilter,
} from '@/lib/videoWorkflowUtils';
import { ProductionProgressMarks } from '@/components/video/workflow/ProductionProgressMarks';
import { ReviewActionModal, type ReviewActionMode } from '@/components/video/workflow/ReviewActionModal';
import { WorkflowListFilters } from '@/components/video/workflow/WorkflowListFilters';
import { WorkflowStatusSummaryBar } from '@/components/video/workflow/WorkflowStatusSummaryBar';
import {
  CopyStoragePathButton,
  formatWorkflowPlannedPublishDate,
  WORKFLOW_LIST_DATE_CELL,
  WORKFLOW_LIST_GRID_REVIEW,
  WorkflowListChannelCell,
  WorkflowListVideoCodeCell,
  WorkflowVideoListHeader,
} from '@/components/video/workflow/workflowListLayout';
import { Button } from '@/components/ui/button';

const REVIEW_STATUS_ITEMS = [
  { id: 'pending', label: '待審核', activeClassName: VIDEO_WORKFLOW_STAGE_COLORS.review },
  { id: 'done', label: '已審核', activeClassName: 'bg-slate-100 text-slate-600' },
] as const;

function ReviewListRow({
  video,
  onAdminReview,
  onManagementReview,
}: {
  video: VideoWorkflowMock;
  onAdminReview: () => void;
  onManagementReview: () => void;
}) {
  const pending = isWorkflowPendingReview(video);
  const adminReady = canDoAdminReview(video);
  const managementReady = canDoManagementReview(video);
  const adminDone = isAdminReviewPassed(video);

  return (
    <div className={cn(WORKFLOW_LIST_GRID_REVIEW, 'px-3 py-2.5 border-b border-border/50 hover:bg-muted/20 text-[12px]')}>
      <WorkflowListChannelCell code={video.vchannelCode} publicName={video.vchannelPublicName} />
      <WorkflowListVideoCodeCell
        videoCode={video.videoCode}
        statusBadge={
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap',
              pending ? VIDEO_WORKFLOW_STAGE_COLORS.review : 'bg-slate-100 text-slate-600',
            )}
          >
            {pending
              ? (adminDone ? '待管理批核' : '待行政審查')
              : '已審核'}
          </span>
        }
      />
      <p className="font-semibold truncate min-w-0" title={video.title}>{video.title}</p>
      <span className={WORKFLOW_LIST_DATE_CELL}>{video.shootAt ?? '—'}</span>
      <ProductionProgressMarks video={video} />
      <CopyStoragePathButton path={video.storagePath} />
      <span className={WORKFLOW_LIST_DATE_CELL}>{formatWorkflowPlannedPublishDate(video.plannedPublishDate)}</span>
      {pending ? (
        <>
          {adminReady ? (
            <Button
              type="button"
              size="sm"
              className="h-7 text-[11px] px-2 bg-teal-600 hover:bg-teal-700 text-white"
              onClick={onAdminReview}
            >
              行政審查
            </Button>
          ) : (
            <span className="text-[11px] text-teal-700 text-center font-medium">已通過</span>
          )}
          {managementReady ? (
            <Button
              type="button"
              size="sm"
              className="h-7 text-[11px] px-2 bg-teal-700 hover:bg-teal-800 text-white"
              onClick={onManagementReview}
            >
              管理批核
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px] px-2"
              disabled
              title="需先完成行政審查"
            >
              管理批核
            </Button>
          )}
        </>
      ) : (
        <>
          <span className="text-[11px] text-muted-foreground text-center">—</span>
          <span className="text-[11px] text-muted-foreground text-center">—</span>
        </>
      )}
    </div>
  );
}

export function VideoReviewModule() {
  const {
    videos,
    getById,
    approveAdminReview,
    rejectAdminReview,
    approveReview,
    rejectReview,
  } = useVideoWorkflow();
  const { user, userInfo, systemUser } = useAuth();
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewActionMode>('admin');
  const [statusFilter, setStatusFilter] = useState<WorkflowBinaryStatusFilter>('pending');

  const scopeVideos = useMemo(() => getReviewScopeVideos(videos), [videos]);
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

  const openReview = (id: string, mode: ReviewActionMode) => {
    setReviewMode(mode);
    setReviewTargetId(id);
  };

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
          <WorkflowVideoListHeader variant="review" />
          {filteredVideos.map(video => (
            <ReviewListRow
              key={video.id}
              video={video}
              onAdminReview={() => openReview(video.id, 'admin')}
              onManagementReview={() => openReview(video.id, 'management')}
            />
          ))}
        </div>
      )}

      <ReviewActionModal
        open={!!reviewTarget}
        video={reviewTarget}
        mode={reviewMode}
        onClose={() => setReviewTargetId(null)}
        onApprove={async id => {
          if (reviewMode === 'admin') return approveAdminReview(id, reviewerName);
          return approveReview(id, reviewerName);
        }}
        onReject={async (id, reason) => {
          if (reviewMode === 'admin') return rejectAdminReview(id, reason, reviewerName);
          return rejectReview(id, reason, reviewerName);
        }}
      />
    </div>
  );
}
