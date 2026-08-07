import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import { formatLocation, VIDEO_WORKFLOW_STAGE_COLORS, VIDEO_WORKFLOW_STAGE_LABELS } from '@/lib/videoWorkflowUtils';
import { ProductionProgressMarks } from '@/components/video/workflow/ProductionProgressMarks';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';

export type ReviewActionMode = 'admin' | 'management';

type Props = {
  open: boolean;
  video: VideoWorkflowMock | null;
  mode: ReviewActionMode;
  onClose: () => void;
  onApprove: (videoId: string) => Promise<string | null | void>;
  onReject: (videoId: string, reason: string) => Promise<string | null | void>;
};

type Step = 'actions' | 'reject';

const MODE_LABELS: Record<ReviewActionMode, string> = {
  admin: '行政審查',
  management: '管理批核',
};

export function ReviewActionModal({ open, video, mode, onClose, onApprove, onReject }: Props) {
  const [step, setStep] = useState<Step>('actions');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep('actions');
    setRejectReason('');
    setRejectError(null);
    setActionError(null);
    setSaving(false);
  }, [open, video?.id, mode]);

  if (!video) return null;

  const modeLabel = MODE_LABELS[mode];

  const handleClose = () => {
    if (saving) return;
    setStep('actions');
    setRejectReason('');
    setRejectError(null);
    setActionError(null);
    onClose();
  };

  const handleApprove = async () => {
    setActionError(null);
    setSaving(true);
    const err = await onApprove(video.id);
    setSaving(false);
    if (err) {
      setActionError(err);
      return;
    }
    handleClose();
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) {
      setRejectError('請填寫拒絕理由');
      return;
    }
    setActionError(null);
    setSaving(true);
    const err = await onReject(video.id, rejectReason.trim());
    setSaving(false);
    if (err) {
      setActionError(err);
      return;
    }
    handleClose();
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={handleClose}
      title={`${modeLabel} — ${video.videoCode}`}
      size="md"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', VIDEO_WORKFLOW_STAGE_COLORS.review)}>
              {VIDEO_WORKFLOW_STAGE_LABELS.review}
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {modeLabel}
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
          {mode === 'management' && video.adminReviewedBy && (
            <p className="text-[12px] text-teal-700">
              行政審查已通過（{video.adminReviewedBy}
              {video.adminReviewedAt ? ` · ${video.adminReviewedAt.slice(0, 10)}` : ''}）
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground border border-border/50 rounded-md px-3 py-2">
          <span className="font-semibold text-slate-600">製作進度</span>
          <ProductionProgressMarks video={video} />
        </div>

        {actionError && (
          <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{actionError}</p>
        )}

        {step === 'actions' ? (
          <>
            <p className="text-[13px] text-muted-foreground">請選擇{modeLabel}結果。</p>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>取消</Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={saving}
                onClick={handleApprove}
              >
                {saving ? '處理中…' : '通過'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
                disabled={saving}
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
                className="w-full border border-border rounded-md px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                placeholder="請填寫拒絕理由，方便製作端修正。"
              />
              {rejectError && <p className="text-[12px] text-rose-600">{rejectError}</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => { setStep('actions'); setRejectReason(''); setRejectError(null); }}
              >
                返回
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                disabled={saving}
                onClick={handleRejectConfirm}
              >
                {saving ? '處理中…' : '確認拒絕'}
              </Button>
            </div>
          </>
        )}
      </div>
    </CrudModal>
  );
}
