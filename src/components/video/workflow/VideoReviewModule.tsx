import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { useVideoWorkflowListFilter } from '@/hooks/useVideoWorkflowListFilter';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  PRODUCTION_TASK_KEYS,
  PRODUCTION_TASK_LABELS,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
} from '@/lib/videoWorkflowUtils';
import {
  ProductionProgressMarks,
} from '@/components/video/workflow/ProductionProgressMarks';
import { ReviewActionModal } from '@/components/video/workflow/ReviewActionModal';
import { WorkflowListFilters } from '@/components/video/workflow/WorkflowListFilters';
import { Button } from '@/components/ui/button';

const LIST_GRID =
  'grid grid-cols-[minmax(130px,1.1fr)_minmax(110px,1.3fr)_48px_68px_minmax(88px,1fr)_repeat(5,36px)_56px] gap-2 items-center min-w-[960px]';

function ReviewListRow({ video, onReview }: { video: VideoWorkflowMock; onReview: () => void }) {
  return (
    <div className={cn(LIST_GRID, 'px-3 py-2.5 border-b border-border/50 hover:bg-muted/20 text-[12px]')}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted-foreground truncate">{video.videoCode}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded shrink-0', VIDEO_WORKFLOW_STAGE_COLORS.review)}>
            {VIDEO_WORKFLOW_STAGE_LABELS.review}
          </span>
        </div>
      </div>
      <p className="font-semibold truncate min-w-0" title={video.title}>{video.title}</p>
      <span className="text-muted-foreground">{video.vchannelCode}</span>
      <span className="text-muted-foreground">{video.shootAt ?? '—'}</span>
      <span className="text-muted-foreground truncate" title={video.storagePath}>
        {video.storagePath || '—'}
      </span>
      <ProductionProgressMarks video={video} />
      <Button type="button" size="sm" className="h-7 text-[11px] px-2 bg-teal-600 hover:bg-teal-700 text-white" onClick={onReview}>
        審核
      </Button>
    </div>
  );
}

export function VideoReviewModule() {
  const { getByStage, getById, approveReview, rejectReview } = useVideoWorkflow();
  const { user, userInfo, systemUser } = useAuth();
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);

  const reviewVideos = getByStage('review');
  const {
    channels,
    vchannelFilter,
    setVchannelFilter,
    searchQuery,
    setSearchQuery,
    filteredVideos,
  } = useVideoWorkflowListFilter(reviewVideos, 'submittedForReviewAt');

  const reviewTarget = reviewTargetId ? getById(reviewTargetId) ?? null : null;

  const reviewerName = useMemo(
    () => userInfo?.display_name || systemUser?.display_name || user?.email || 'User',
    [userInfo, systemUser, user],
  );

  return (
    <div className="space-y-4">
      <WorkflowListFilters
        channels={channels}
        vchannelFilter={vchannelFilter}
        onVchannelFilterChange={setVchannelFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      <p className="text-[12px] text-muted-foreground">{filteredVideos.length} 部待審核</p>

      {filteredVideos.length === 0 ? (
        <div className="text-center py-16 text-[13px] text-muted-foreground bg-white rounded-md border">
          {reviewVideos.length === 0 ? '目前沒有待審核的影片' : '沒有符合條件的影片'}
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-x-auto">
          <div className={cn(LIST_GRID, 'px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground border-b border-border/60')}>
            <span>Video Code</span>
            <span>主題</span>
            <span>頻道</span>
            <span>拍攝日</span>
            <span>Demo</span>
            {PRODUCTION_TASK_KEYS.map(key => (
              <span key={key} className="text-center">{PRODUCTION_TASK_LABELS[key]}</span>
            ))}
            <span />
          </div>
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
