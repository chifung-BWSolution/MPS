import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { useAuth } from '@/context/AuthContext';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  formatAssignmentWhen,
  formatLocation,
  VIDEO_WORKFLOW_STAGE_COLORS,
} from '@/lib/videoWorkflowUtils';
import { Button } from '@/components/ui/button';
import { CrudModal } from '@/components/ui/crud-modal';

function ReviewCard({ video }: { video: VideoWorkflowMock }) {
  const { approveReview, rejectReview } = useVideoWorkflow();
  const { user } = useAuth();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  const reviewerName = user.name || 'User';

  const handleReject = () => {
    if (!rejectReason.trim()) {
      setRejectError('請填寫拒絕理由');
      return;
    }
    rejectReview(video.id, rejectReason.trim(), reviewerName);
    setRejectOpen(false);
    setRejectReason('');
    setRejectError(null);
  };

  return (
    <>
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">{video.videoCode} · {video.vchannelCode}</p>
            <h3 className="text-[16px] font-bold">{video.title}</h3>
          </div>
          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', VIDEO_WORKFLOW_STAGE_COLORS.review)}>
            待審核
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[12px] bg-slate-50/80 rounded-md p-3">
          <div><span className="text-muted-foreground">Demo：</span>{video.storagePath || '—'}</div>
          <div><span className="text-muted-foreground">場地：</span>{formatLocation(video.location)}</div>
          <div><span className="text-muted-foreground">文案：</span>{video.copywriting?.displayName ?? '—'} · {formatAssignmentWhen(video.copywriting)}</div>
          <div><span className="text-muted-foreground">腳本：</span>{video.script?.displayName ?? '—'} · {formatAssignmentWhen(video.script)}</div>
          <div><span className="text-muted-foreground">Model：</span>{video.model?.displayName ?? '—'}</div>
          <div><span className="text-muted-foreground">攝影師：</span>{video.photographer?.displayName ?? '—'}</div>
          <div><span className="text-muted-foreground">原片：</span>{video.rawFootageDone ? '✓' : '—'}</div>
          <div><span className="text-muted-foreground">Demo 完成：</span>{video.demoDone ? '✓' : '—'}</div>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => approveReview(video.id, reviewerName)}
          >
            <Check size={14} className="mr-1" /> 審核通過
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 text-rose-600 border-rose-200 hover:bg-rose-50"
            onClick={() => setRejectOpen(true)}
          >
            <X size={14} className="mr-1" /> 拒絕
          </Button>
        </div>
      </div>

      <CrudModal isOpen={rejectOpen} onClose={() => setRejectOpen(false)} title="審核拒絕" size="sm">
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">請簡要說明拒絕理由，影片將退回製作階段（保留 Demo 狀態）。</p>
          <textarea
            value={rejectReason}
            onChange={e => { setRejectReason(e.target.value); setRejectError(null); }}
            rows={4}
            className="w-full border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
            placeholder="拒絕理由…"
          />
          {rejectError && <p className="text-[12px] text-rose-600">{rejectError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRejectOpen(false)}>取消</Button>
            <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" onClick={handleReject}>確認拒絕</Button>
          </div>
        </div>
      </CrudModal>
    </>
  );
}

export function VideoReviewModule() {
  const { getByStage } = useVideoWorkflow();
  const reviewVideos = getByStage('review');

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">{reviewVideos.length} 部待審核</p>
      {reviewVideos.length === 0 ? (
        <div className="text-center py-16 text-[13px] text-muted-foreground bg-white rounded-md border">
          目前沒有待審核的影片
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {reviewVideos.map(video => (
            <ReviewCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}
