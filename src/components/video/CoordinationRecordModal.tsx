import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { VideoOutput, VideoOutputInput, VideoOutputStatus } from '@/types/videoOutput';
import type { VideoWorkflowStage } from '@/types/videoWorkflow';
import {
  VIDEO_OUTPUT_STATUS_COLORS,
  VIDEO_OUTPUT_STATUS_LABELS,
  deriveVideoOutputStatus,
  formatShootLocation,
  hasAnyMediaPlatformPublished,
} from '@/lib/videoOutputUtils';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { localDateString } from '@/services/reportLinkService';

const STATUS_OPTIONS: VideoOutputStatus[] = [
  'pending',
  'in_production',
  'pending_review',
  'pending_publish',
  'published',
];

function statusToWorkflowStage(status: VideoOutputStatus): VideoWorkflowStage {
  switch (status) {
    case 'pending':
      return 'prep';
    case 'in_production':
      return 'production';
    case 'pending_review':
      return 'review';
    case 'pending_publish':
      return 'publish';
    case 'published':
      return 'published';
  }
}

type Props = {
  video: VideoOutput;
  onClose: () => void;
  onSave: (input: Partial<VideoOutputInput>) => Promise<Error | null>;
};

export function CoordinationRecordModal({ video, onClose, onSave }: Props) {
  const currentStatus = deriveVideoOutputStatus(video);
  const [status, setStatus] = useState<VideoOutputStatus>(currentStatus);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(deriveVideoOutputStatus(video));
    setFormError(null);
  }, [video]);

  const handleSave = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const patch: Partial<VideoOutputInput> = {
        workflowStage: statusToWorkflowStage(status),
      };

      if (status === 'published') {
        if (!video.publishedDate?.trim()) {
          patch.publishedDate = localDateString();
        }
      } else {
        // 離開已發佈時清除會讓 derive 固定為 published 的欄位
        patch.publishedDate = '';
        if (hasAnyMediaPlatformPublished(video.platformPublish)) {
          patch.platformPublish = {};
        }
      }

      const err = await onSave(patch);
      if (err) {
        setFormError(err.message || '儲存失敗');
        return;
      }
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const leavingPublished =
    currentStatus === 'published' && status !== 'published';

  return (
    <CrudModal isOpen onClose={onClose} title={`編輯記錄 — ${video.videoCode}`} size="md">
      <div className="space-y-4">
        {formError && (
          <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            {formError}
          </p>
        )}

        <div className="space-y-1">
          <p className="text-[15px] font-bold">{video.title}</p>
          <p className="text-[12px] text-muted-foreground">
            {video.channelCode}
            {video.channelPublicName ? ` · ${video.channelPublicName}` : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <DetailRow label="Video Code" value={video.videoCode} mono />
          <DetailRow
            label="項目類型"
            value={video.projectCategory === 'internal' ? '內部項目' : '客戶項目'}
          />
          <DetailRow label="拍攝日期" value={video.shootAt?.trim() || '—'} />
          <DetailRow label="拍攝地址" value={formatShootLocation(video.shootHk, video.shootSz)} />
          <DetailRow label="計劃發佈" value={video.plannedPublishDate?.trim() || '—'} />
          <DetailRow label="實際發佈" value={video.publishedDate?.trim() || '—'} />
          <DetailRow label="影片存放" value={video.storagePath?.trim() || '—'} className="col-span-2" />
          <DetailRow label="備註" value={video.notes?.trim() || '—'} className="col-span-2" />
        </div>

        <div className="border-t border-border pt-4 space-y-2">
          <label className="text-[12px] font-medium block">狀態</label>
          <Select value={status} onValueChange={v => setStatus(v as VideoOutputStatus)}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>
                  <span className="inline-flex items-center gap-2">
                    <span className={cn('text-[11px] px-1.5 py-0.5 rounded', VIDEO_OUTPUT_STATUS_COLORS[s])}>
                      {VIDEO_OUTPUT_STATUS_LABELS[s]}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {leavingPublished && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              改為非「已發佈」時，將清除實際發佈日期
              {hasAnyMediaPlatformPublished(video.platformPublish) ? '與平台發佈鏈接' : ''}
              ，以便狀態生效。
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleSave}
            disabled={saving || status === currentStatus}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" />
                保存中...
              </>
            ) : (
              '保存'
            )}
          </Button>
        </div>
      </div>
    </CrudModal>
  );
}

function DetailRow({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className={cn('text-[13px] break-all', mono && 'font-mono')} title={value}>
        {value}
      </p>
    </div>
  );
}
