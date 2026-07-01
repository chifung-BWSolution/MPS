import { useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import { formatLocation, VIDEO_WORKFLOW_STAGE_COLORS } from '@/lib/videoWorkflowUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function ProductionCard({ video }: { video: VideoWorkflowMock }) {
  const { updateVideo, submitForReview } = useVideoWorkflow();
  const [storagePath, setStoragePath] = useState(video.storagePath ?? '');

  const canSubmitReview = !!video.demoDone;
  const wasRejected = !!video.reviewRejectReason;

  const saveStorage = () => updateVideo(video.id, { storagePath: storagePath.trim() || undefined });

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">{video.videoCode} · {video.vchannelCode}</p>
          <h3 className="text-[16px] font-bold">{video.title}</h3>
          <p className="text-[11px] text-muted-foreground mt-1">拍攝：{video.shootAt ?? '—'} · {formatLocation(video.location)}</p>
        </div>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', VIDEO_WORKFLOW_STAGE_COLORS.production)}>
          製作中
        </span>
      </div>

      {wasRejected && (
        <div className="flex gap-2 text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">審核已拒絕</p>
            <p className="mt-0.5">{video.reviewRejectReason}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex items-center gap-2 border border-border/60 rounded-md px-3 py-2.5 text-[13px] cursor-pointer hover:bg-muted/20">
          <input
            type="checkbox"
            checked={!!video.rawFootageDone}
            onChange={e => updateVideo(video.id, { rawFootageDone: e.target.checked })}
          />
          原片拍攝完成
        </label>
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">是否剪輯</label>
          <Select
            value={video.needsEditing === null || video.needsEditing === undefined ? 'unset' : video.needsEditing ? 'yes' : 'no'}
            onValueChange={v => updateVideo(video.id, { needsEditing: v === 'unset' ? null : v === 'yes' })}
          >
            <SelectTrigger className="h-9 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">未設定</SelectItem>
              <SelectItem value="yes">需要</SelectItem>
              <SelectItem value="no">不需要</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 border border-border/60 rounded-md px-3 py-2.5 text-[13px] cursor-pointer hover:bg-muted/20">
          <input
            type="checkbox"
            checked={!!video.demoDone}
            onChange={e => updateVideo(video.id, { demoDone: e.target.checked })}
          />
          Demo 完成
        </label>
      </div>

      <div>
        <label className="text-[12px] font-medium block mb-1">視頻鏈接 / 保存地址</label>
        <div className="flex gap-2">
          <Input
            value={storagePath}
            onChange={e => setStoragePath(e.target.value)}
            onBlur={saveStorage}
            placeholder="V:\\... 或 https://..."
            className="h-9 text-[13px]"
          />
          <Button type="button" variant="outline" size="sm" onClick={saveStorage}>保存</Button>
        </div>
      </div>

      {wasRejected ? (
        <Button
          type="button"
          className="w-full bg-teal-600 hover:bg-teal-700 text-white"
          disabled={!canSubmitReview}
          onClick={() => submitForReview(video.id)}
        >
          <Check size={14} className="mr-1" /> 重新提交審核
        </Button>
      ) : (
        <Button
          type="button"
          className="w-full bg-teal-600 hover:bg-teal-700 text-white"
          disabled={!canSubmitReview}
          onClick={() => submitForReview(video.id)}
        >
          Demo 完成 · 提交審核
        </Button>
      )}
    </div>
  );
}

export function VideoProductionModule() {
  const { getByStage } = useVideoWorkflow();
  const productionVideos = getByStage('production');

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">{productionVideos.length} 部製作中</p>
      {productionVideos.length === 0 ? (
        <div className="text-center py-16 text-[13px] text-muted-foreground bg-white rounded-md border">
          目前沒有製作中的影片（請先在拍攝排期完成準備並進入製作）
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {productionVideos.map(video => (
            <ProductionCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}
