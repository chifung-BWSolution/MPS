import { useMemo, useState } from 'react';
import { Check, Edit2, Minus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { useVchannels } from '@/hooks/useVchannels';
import type { ProductionProgress, ProductionTaskKey, VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  canSubmitProductionForReview,
  getProductionTaskDisplayStatus,
  normalizeProductionProgress,
  PRODUCTION_TASK_LABELS,
  type ProductionTaskDisplayStatus,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
} from '@/lib/videoWorkflowUtils';
import { ProductionEditModal } from '@/components/video/workflow/ProductionEditModal';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TASK_KEYS: ProductionTaskKey[] = ['copywriting', 'script', 'rawFootage', 'editing', 'demo'];

const LIST_GRID =
  'grid grid-cols-[minmax(140px,1.2fr)_minmax(120px,1.5fr)_56px_72px_repeat(5,40px)_64px_88px] gap-2 items-center min-w-[920px]';

function ProgressMark({ status }: { status: ProductionTaskDisplayStatus }) {
  if (status === 'done') {
    return (
      <span className="inline-flex justify-center text-teal-600" title="完成">
        <Check size={14} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === 'na') {
    return (
      <span className="inline-flex justify-center text-muted-foreground" title="不適用">
        <Minus size={14} />
      </span>
    );
  }
  return <span className="inline-flex justify-center text-[13px] text-muted-foreground" title="未完成">○</span>;
}

function ProductionListRow({
  video,
  onEdit,
  onSubmit,
}: {
  video: VideoWorkflowMock;
  onEdit: () => void;
  onSubmit: () => void;
}) {
  const progress = normalizeProductionProgress(video);
  const canSubmit = canSubmitProductionForReview(video);

  return (
    <div className={cn(LIST_GRID, 'px-3 py-2.5 border-b border-border/50 hover:bg-muted/20 text-[12px]')}>
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
      <span className="text-muted-foreground">{video.vchannelCode}</span>
      <span className="text-muted-foreground">{video.shootAt ?? '—'}</span>
      {TASK_KEYS.map(key => (
        <ProgressMark key={key} status={getProductionTaskDisplayStatus(progress, key)} />
      ))}
      <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1 px-2" onClick={onEdit}>
        <Edit2 size={11} /> 編輯
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-7 text-[11px] px-2 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
        disabled={!canSubmit}
        title={canSubmit ? '提交審核' : '請先完成 Demo'}
        onClick={onSubmit}
      >
        提交審核
      </Button>
    </div>
  );
}

export function VideoProductionModule() {
  const { getByStage, getById, updateVideo, submitForReview } = useVideoWorkflow();
  const { channels } = useVchannels();

  const [vchannelFilter, setVchannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitTargetId, setSubmitTargetId] = useState<string | null>(null);

  const productionVideos = getByStage('production');

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filterChannel = vchannelFilter !== 'all' ? channels.find(c => c.id === vchannelFilter) : null;
    return productionVideos
      .filter(v => {
        if (filterChannel) {
          const matchId = v.vchannelId === filterChannel.id;
          const matchCode = v.vchannelCode === filterChannel.channelCode;
          if (!matchId && !matchCode) return false;
        }
        if (!q) return true;
        return v.title.toLowerCase().includes(q) || v.videoCode.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.createdAt ?? b.videoCode).localeCompare(a.createdAt ?? a.videoCode));
  }, [productionVideos, vchannelFilter, searchQuery, channels]);

  const editingVideo = editingId ? getById(editingId) ?? null : null;
  const submitTarget = submitTargetId ? getById(submitTargetId) : undefined;

  const handleSave = async (payload: {
    productionProgress: ProductionProgress;
    storagePath?: string;
  }): Promise<string | null> => {
    if (!editingId) return '找不到影片';
    updateVideo(editingId, payload);
    return null;
  };

  const confirmSubmit = () => {
    if (!submitTargetId) return;
    submitForReview(submitTargetId);
    setSubmitTargetId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={vchannelFilter} onValueChange={setVchannelFilter}>
          <SelectTrigger className="h-9 w-[180px] text-[12px]">
            <SelectValue placeholder="Vchannel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部 Vchannel</SelectItem>
            {channels.map(ch => (
              <SelectItem key={ch.id} value={ch.id}>{ch.channelCode} — {ch.publicName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜尋主題或 Video Code…"
            className="h-9 pl-9 text-[12px]"
          />
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">{filteredVideos.length} 部製作中</p>

      {filteredVideos.length === 0 ? (
        <div className="text-center py-16 text-[13px] text-muted-foreground bg-white rounded-md border">
          {productionVideos.length === 0
            ? '目前沒有製作中的影片（請先在拍攝排期完成準備並進入製作）'
            : '沒有符合條件的影片'}
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-x-auto">
          <div className={cn(LIST_GRID, 'px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground border-b border-border/60')}>
            <span>Video Code</span>
            <span>主題</span>
            <span>頻道</span>
            <span>拍攝日</span>
            {TASK_KEYS.map(key => (
              <span key={key} className="text-center">{PRODUCTION_TASK_LABELS[key]}</span>
            ))}
            <span />
            <span />
          </div>
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
          <p className="text-[13px] text-muted-foreground">
            確認提交審核？
            {submitTarget && (
              <span className="block mt-1 font-medium text-foreground">
                {submitTarget.videoCode} — {submitTarget.title}
              </span>
            )}
            提交後影片將進入審核階段。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSubmitTargetId(null)}>取消</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={confirmSubmit}>
              確認提交
            </Button>
          </div>
        </div>
      </CrudModal>
    </div>
  );
}
