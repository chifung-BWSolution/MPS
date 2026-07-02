import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import { formatLocation, VIDEO_WORKFLOW_STAGE_COLORS, VIDEO_WORKFLOW_STAGE_LABELS } from '@/lib/videoWorkflowUtils';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  video: VideoWorkflowMock | null;
  onClose: () => void;
  onConfirm: (videoId: string) => void;
};

export function PublishConfirmModal({ open, video, onClose, onConfirm }: Props) {
  if (!video) return null;

  return (
    <CrudModal isOpen={open} onClose={onClose} title={`確認發佈 — ${video.videoCode}`} size="sm">
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', VIDEO_WORKFLOW_STAGE_COLORS.publish)}>
              {VIDEO_WORKFLOW_STAGE_LABELS.publish}
            </span>
            <span className="text-[12px] text-muted-foreground">{video.vchannelCode}</span>
          </div>
          <p className="text-[15px] font-bold">{video.title}</p>
          <p className="text-[12px] text-muted-foreground">
            拍攝 {video.shootAt ?? '—'} · {formatLocation(video.location)}
          </p>
        </div>

        <p className="text-[13px] text-muted-foreground">
          確定要將此影片標記為已發佈嗎？發佈後將移出待發佈列表。
        </p>

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => {
              onConfirm(video.id);
              onClose();
            }}
          >
            確認發佈
          </Button>
        </div>
      </div>
    </CrudModal>
  );
}
