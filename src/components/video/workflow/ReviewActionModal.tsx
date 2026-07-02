import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import { formatLocation, VIDEO_WORKFLOW_STAGE_COLORS, VIDEO_WORKFLOW_STAGE_LABELS } from '@/lib/videoWorkflowUtils';
import { ProductionProgressMarks } from '@/components/video/workflow/ProductionProgressMarks';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  video: VideoWorkflowMock | null;
  onClose: () => void;
  onApprove: (videoId: string) => void;
  onReject: (videoId: string, reason: string) => void;
};

type Step = 'actions' | 'reject';

export function ReviewActionModal({ open, video, onClose, onApprove, onReject }: Props) {
  const [step, setStep] = useState<Step>('actions');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('actions');
    setRejectReason('');
    setRejectError(null);
  }, [open, video?.id]);

  if (!video) return null;

  const handleClose = () => {
    setStep('actions');
    setRejectReason('');
    setRejectError(null);
    onClose();
  };

  const handleRejectConfirm = () => {
    if (!rejectReason.trim()) {
      setRejectError('請填寫拒絕理由');
      return;
    }
    onReject(video.id, rejectReason.trim());
    handleClose();
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={handleClose}
      title={`審核 — ${video.videoCode}`}
      size="md"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', VIDEO_WORKFLOW_STAGE_COLORS.review)}>
              {VIDEO_WORKFLOW_STAGE_LABELS.review}
            </span>
            <span className="text-[12px] text-muted-foreground">{video.vchannelCode}</span>
          </div>
          <p className="text-[15px] font-bold">{video.title}</p>
          <p className="text-[12px] text-muted-foreground">
            拍攝 {video.shootAt ?? '—'} · {formatLocation(video.location)}
          </p>
          <p className="text-[12px] text-muted-foreground truncate" title={video.storagePath}>
            影片存放位置：{video.storagePath || '—'}
          </p>
          <p className="text-[12px] text-muted-foreground">
            計劃發佈日期：{video.plannedPublishDate?.trim() || '—'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground border border-border/50 rounded-md px-3 py-2">
          <span className="font-semibold text-slate-600">製作進度</span>
          <ProductionProgressMarks video={video} />
        </div>

        {step === 'actions' ? (
          <>
            <p className="text-[13px] text-muted-foreground">請選擇審核結果。</p>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={handleClose}>取消</Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => {
                  onApprove(video.id);
                  handleClose();
                }}
              >
                通過
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => setStep('reject')}
              >
                拒絕
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-slate-700">
                拒絕理由 <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={e => {
                  setRejectReason(e.target.value);
                  setRejectError(null);
                }}
                rows={4}
                className="w-full border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                placeholder="請簡單描述，方便記錄。"
              />
              {rejectError && <p className="text-[12px] text-rose-600">{rejectError}</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => { setStep('actions'); setRejectReason(''); setRejectError(null); }}>
                返回
              </Button>
              <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" onClick={handleRejectConfirm}>
                確認拒絕
              </Button>
            </div>
          </>
        )}
      </div>
    </CrudModal>
  );
}
