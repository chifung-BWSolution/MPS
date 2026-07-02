import { useState } from 'react';
import { Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { useVideoWorkflowListFilter } from '@/hooks/useVideoWorkflowListFilter';
import type { ProductionProgress, VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  canSubmitProductionForReview,
  getSubmitForReviewBlockers,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
} from '@/lib/videoWorkflowUtils';
import { ProductionEditModal } from '@/components/video/workflow/ProductionEditModal';
import { ProductionProgressMarks } from '@/components/video/workflow/ProductionProgressMarks';
import { WorkflowListFilters } from '@/components/video/workflow/WorkflowListFilters';
import {
  formatWorkflowPlannedPublishDate,
  formatWorkflowStoragePath,
  WORKFLOW_LIST_DATE_CELL,
  WORKFLOW_LIST_GRID_PRODUCTION,
  WorkflowVideoListHeader,
} from '@/components/video/workflow/workflowListLayout';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { resolveBubbleStaffId } from '@/services/reportLinkService';

function ProductionListRow({
  video,
  onEdit,
  onSubmit,
}: {
  video: VideoWorkflowMock;
  onEdit: () => void;
  onSubmit: () => void;
}) {
  const blockers = getSubmitForReviewBlockers(video);
  const canSubmit = canSubmitProductionForReview(video);

  return (
    <div className={cn(WORKFLOW_LIST_GRID_PRODUCTION, 'px-3 py-2.5 border-b border-border/50 hover:bg-muted/20 text-[12px]')}>
      <span className="text-muted-foreground font-medium">{video.vchannelCode}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted-foreground truncate">{video.videoCode}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded shrink-0', VIDEO_WORKFLOW_STAGE_COLORS.production)}>
            {VIDEO_WORKFLOW_STAGE_LABELS.production}
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="font-semibold truncate" title={video.title}>{video.title}</p>
        {video.reviewRejectReason && (
          <p className="text-[10px] text-rose-600 truncate" title={video.reviewRejectReason}>
            拒絕：{video.reviewRejectReason}
          </p>
        )}
      </div>
      <span className={WORKFLOW_LIST_DATE_CELL}>{video.shootAt ?? '—'}</span>
      <ProductionProgressMarks video={video} />
      <span className="text-muted-foreground truncate" title={video.storagePath}>
        {formatWorkflowStoragePath(video.storagePath)}
      </span>
      <span className={WORKFLOW_LIST_DATE_CELL}>{formatWorkflowPlannedPublishDate(video.plannedPublishDate)}</span>
      <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1 px-2" onClick={onEdit}>
        <Edit2 size={11} /> 編輯
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-7 text-[11px] px-2 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
        disabled={!canSubmit}
        title={canSubmit ? '提交審核' : blockers.join('；')}
        onClick={onSubmit}
      >
        提交審核
      </Button>
    </div>
  );
}

export function VideoProductionModule() {
  const { systemUser } = useAuth();
  const { getByStage, getById, saveProductionWithWorkLogs, submitForReview } = useVideoWorkflow();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitTargetId, setSubmitTargetId] = useState<string | null>(null);

  const productionVideos = getByStage('production');
  const {
    channels,
    vchannelFilter,
    setVchannelFilter,
    searchQuery,
    setSearchQuery,
    filteredVideos,
  } = useVideoWorkflowListFilter(productionVideos, 'createdAt');

  const editingVideo = editingId ? getById(editingId) ?? null : null;
  const submitTarget = submitTargetId ? getById(submitTargetId) : undefined;
  const submitBlockers = submitTarget ? getSubmitForReviewBlockers(submitTarget) : [];

  const handleSave = async (payload: {
    productionProgress: ProductionProgress;
    storagePath?: string;
    plannedPublishDate?: string;
  }): Promise<string | null> => {
    if (!editingId) return '找不到影片';
    const staffId = await resolveBubbleStaffId(systemUser);
    return saveProductionWithWorkLogs(
      editingId,
      {
        productionProgress: payload.productionProgress,
        storagePath: payload.storagePath,
        plannedPublishDate: payload.plannedPublishDate,
      },
      staffId ?? undefined,
    );
  };

  const confirmSubmit = async () => {
    if (!submitTargetId || !submitTarget) return;
    if (getSubmitForReviewBlockers(submitTarget).length > 0) return;
    const err = await submitForReview(submitTargetId);
    if (err) return;
    setSubmitTargetId(null);
  };

  return (
    <div className="space-y-4">
      <WorkflowListFilters
        channels={channels}
        vchannelFilter={vchannelFilter}
        onVchannelFilterChange={setVchannelFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      <p className="text-[12px] text-muted-foreground">{filteredVideos.length} 部製作中</p>

      {filteredVideos.length === 0 ? (
        <div className="text-center py-16 text-[13px] text-muted-foreground bg-white rounded-md border">
          {productionVideos.length === 0
            ? '目前沒有製作中的影片（請先在拍攝排期完成準備並進入製作）'
            : '沒有符合條件的影片'}
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-x-auto">
          <WorkflowVideoListHeader variant="production" />
          {filteredVideos.map(video => (
            <ProductionListRow
              key={video.id}
              video={video}
              onEdit={() => setEditingId(video.id)}
              onSubmit={() => setSubmitTargetId(video.id)}
            />
          ))}
        </div>
      )}

      <ProductionEditModal
        open={!!editingVideo}
        video={editingVideo}
        onClose={() => setEditingId(null)}
        onSave={handleSave}
      />

      <CrudModal
        isOpen={!!submitTargetId}
        onClose={() => setSubmitTargetId(null)}
        title="提交審核"
        size="sm"
      >
        <div className="space-y-4">
          {submitBlockers.length > 0 ? (
            <p className="text-[13px] text-rose-600">
              無法提交：{submitBlockers.join('；')}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              確認提交審核？
              {submitTarget && (
                <span className="block mt-1 font-medium text-foreground">
                  {submitTarget.videoCode} — {submitTarget.title}
                </span>
              )}
              {submitTarget?.plannedPublishDate && (
                <span className="block mt-1 text-[12px]">
                  計劃發佈日期：{submitTarget.plannedPublishDate}
                </span>
              )}
              提交後影片將進入審核階段。
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSubmitTargetId(null)}>取消</Button>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white"
              disabled={submitBlockers.length > 0}
              onClick={confirmSubmit}
            >
              確認提交
            </Button>
          </div>
        </div>
      </CrudModal>
    </div>
  );
}
