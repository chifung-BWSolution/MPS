import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { useVideoWorkflowListFilter } from '@/hooks/useVideoWorkflowListFilter';
import type { PlatformPublishKey } from '@/types/videoOutput';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  countWorkflowBinaryStatus,
  filterWorkflowBinaryStatus,
  getPublishScopeVideos,
  isPublishComplete,
  isWorkflowPendingPublish,
  isWorkflowPublished,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
  type WorkflowBinaryStatusFilter,
} from '@/lib/videoWorkflowUtils';
import {
  formatPlatformPublishCopyText,
  getPublishedPlatformKeysWithUrl,
  isPlatformPublished,
  MEDIA_PLATFORM_PUBLISH_KEYS,
  mergePlatformUrls,
  PLATFORM_PUBLISH_LABELS,
  urlsFromPlatformPublish,
} from '@/lib/videoOutputUtils';
import { ProductionProgressMarks } from '@/components/video/workflow/ProductionProgressMarks';
import { PublishConfirmModal } from '@/components/video/workflow/PublishConfirmModal';
import { WorkflowListFilters } from '@/components/video/workflow/WorkflowListFilters';
import { WorkflowStatusSummaryBar } from '@/components/video/workflow/WorkflowStatusSummaryBar';
import {
  formatWorkflowPlannedPublishDate,
  formatWorkflowStoragePath,
  WORKFLOW_LIST_DATE_CELL,
  WORKFLOW_LIST_GRID_PUBLISH,
  WorkflowVideoListHeader,
} from '@/components/video/workflow/workflowListLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CrudModal } from '@/components/ui/crud-modal';

const PUBLISH_STATUS_ITEMS = [
  { id: 'pending', label: '待發佈', activeClassName: VIDEO_WORKFLOW_STAGE_COLORS.publish },
  { id: 'done', label: '已發佈', activeClassName: VIDEO_WORKFLOW_STAGE_COLORS.published },
] as const;

function emptyUrlMap(): Record<PlatformPublishKey, string> {
  return Object.fromEntries(MEDIA_PLATFORM_PUBLISH_KEYS.map(k => [k, ''])) as Record<PlatformPublishKey, string>;
}

function WorkflowPublishModal({
  video,
  onClose,
  onSave,
}: {
  video: VideoWorkflowMock;
  onClose: () => void;
  onSave: (patch: Partial<VideoWorkflowMock>) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<PlatformPublishKey>(MEDIA_PLATFORM_PUBLISH_KEYS[0]);
  const [urls, setUrls] = useState<Record<PlatformPublishKey, string>>(() => {
    const initial = emptyUrlMap();
    const existing = urlsFromPlatformPublish(video.platformPublish ?? {});
    for (const key of MEDIA_PLATFORM_PUBLISH_KEYS) initial[key] = existing[key] ?? '';
    return initial;
  });
  const [publishedDate, setPublishedDate] = useState(video.publishedDate ?? '');
  const [hours, setHours] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  const previewPublish = useMemo(
    () => mergePlatformUrls(video.platformPublish ?? {}, urls),
    [video.platformPublish, urls],
  );

  const handleCopyAll = async () => {
    const text = formatPlatformPublishCopyText(previewPublish);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleSubmit = () => {
    setFormError(null);

    const hoursNum = parseFloat(hours);
    if (hours.trim() && (Number.isNaN(hoursNum) || hoursNum <= 0)) {
      setFormError('工時必須大於 0');
      return;
    }

    const platformPublish = mergePlatformUrls(video.platformPublish ?? {}, urls);
    const anyPublished = MEDIA_PLATFORM_PUBLISH_KEYS.some(k => isPlatformPublished(platformPublish, k));
    onSave({
      platformPublish,
      publishedDate: anyPublished && !publishedDate ? new Date().toISOString().slice(0, 10) : publishedDate || undefined,
      publishHours: hoursNum > 0 ? hoursNum : undefined,
    });
    onClose();
  };

  const hasCopyableUrls = getPublishedPlatformKeysWithUrl(previewPublish).length > 0;

  return (
    <CrudModal
      isOpen
      onClose={onClose}
      title={`平台發佈 — ${video.videoCode}`}
      size="lg"
      headerActions={
        hasCopyableUrls ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={handleCopyAll}
          >
            <Copy size={12} />
            {copyDone ? '已複製' : '一鍵複製'}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {formError && (
          <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{formError}</p>
        )}

        <p className="text-[12px] text-muted-foreground">{video.title}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block">預計發佈</label>
            <div className="h-9 px-3 flex items-center text-[13px] text-muted-foreground bg-muted/30 border border-border/60 rounded-md">
              {formatWorkflowPlannedPublishDate(video.plannedPublishDate)}
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium mb-1 block">最終發佈日期</label>
            <Input type="date" value={publishedDate} onChange={e => setPublishedDate(e.target.value)} className="h-9 text-[13px]" />
          </div>
        </div>

        <div className="flex border border-border/60 rounded-md overflow-hidden min-h-[260px]">
          <div className="w-[140px] shrink-0 border-r border-border/60 bg-slate-50/80">
            {MEDIA_PLATFORM_PUBLISH_KEYS.map(key => {
              const wasPublished = isPlatformPublished(previewPublish, key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2.5 text-left text-[12px] border-b border-border/40 last:border-b-0 transition-colors',
                    selectedKey === key ? 'bg-white font-medium text-teal-800' : 'hover:bg-white/60 text-muted-foreground',
                  )}
                >
                  {wasPublished ? <Check size={12} className="shrink-0 text-teal-600" strokeWidth={3} /> : <span className="w-3 shrink-0" />}
                  <span className="truncate">{PLATFORM_PUBLISH_LABELS[key]}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 p-4 bg-white">
            <label className="text-[12px] font-medium mb-2 block">{PLATFORM_PUBLISH_LABELS[selectedKey]} 鏈接</label>
            <Input
              value={urls[selectedKey]}
              onChange={e => setUrls(prev => ({ ...prev, [selectedKey]: e.target.value }))}
              placeholder="https://..."
              className="h-9 text-[13px]"
            />
            <p className="text-[11px] text-muted-foreground mt-2">填寫 URL 即視為該平台已發佈。</p>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <label className="text-[12px] font-medium mb-1 block">工時（小時）</label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={hours}
            onChange={e => setHours(e.target.value)}
            placeholder="選填"
            className="h-9 text-[13px] max-w-[200px]"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSubmit}>保存發佈</Button>
        </div>
      </div>
    </CrudModal>
  );
}

function PublishListRow({
  video,
  onOpenPublishRecord,
  onPublish,
}: {
  video: VideoWorkflowMock;
  onOpenPublishRecord: () => void;
  onPublish: () => void;
}) {
  const pending = isWorkflowPendingPublish(video);
  const canPublish = pending && isPublishComplete(video);

  return (
    <div className={cn(WORKFLOW_LIST_GRID_PUBLISH, 'px-3 py-2.5 border-b border-border/50 hover:bg-muted/20 text-[12px]')}>
      <span className="text-muted-foreground font-medium">{video.vchannelCode}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted-foreground truncate">{video.videoCode}</span>
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded shrink-0',
              pending ? VIDEO_WORKFLOW_STAGE_COLORS.publish : VIDEO_WORKFLOW_STAGE_COLORS.published,
            )}
          >
            {pending ? VIDEO_WORKFLOW_STAGE_LABELS.publish : VIDEO_WORKFLOW_STAGE_LABELS.published}
          </span>
        </div>
      </div>
      <p className="font-semibold truncate min-w-0" title={video.title}>{video.title}</p>
      <span className={WORKFLOW_LIST_DATE_CELL}>{video.shootAt ?? '—'}</span>
      <ProductionProgressMarks video={video} />
      <span className="text-muted-foreground truncate" title={video.storagePath}>
        {formatWorkflowStoragePath(video.storagePath)}
      </span>
      <span className={WORKFLOW_LIST_DATE_CELL}>{formatWorkflowPlannedPublishDate(video.plannedPublishDate)}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-[11px] px-2"
        onClick={onOpenPublishRecord}
      >
        平台發佈記錄
      </Button>
      {pending ? (
        <Button
          type="button"
          size="sm"
          className="h-7 text-[11px] px-2 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
          onClick={onPublish}
          disabled={!canPublish}
          title={canPublish ? undefined : '請先填寫至少一個平台發佈鏈接'}
        >
          發佈
        </Button>
      ) : (
        <span className="text-[11px] text-muted-foreground text-center">—</span>
      )}
    </div>
  );
}

export function VideoPublishModule() {
  const { videos, getById, updateVideo, completePublish } = useVideoWorkflow();
  const [publishRecordTargetId, setPublishRecordTargetId] = useState<string | null>(null);
  const [publishConfirmTargetId, setPublishConfirmTargetId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<WorkflowBinaryStatusFilter>('all');

  const scopeVideos = useMemo(() => getPublishScopeVideos(videos), [videos]);
  const {
    channels,
    vchannelFilter,
    setVchannelFilter,
    searchQuery,
    setSearchQuery,
    filteredVideos: contextVideos,
  } = useVideoWorkflowListFilter(scopeVideos, 'submittedForReviewAt');

  const statusCounts = useMemo(
    () => countWorkflowBinaryStatus(contextVideos, isWorkflowPendingPublish, isWorkflowPublished),
    [contextVideos],
  );

  const filteredVideos = useMemo(
    () => filterWorkflowBinaryStatus(contextVideos, statusFilter, isWorkflowPendingPublish, isWorkflowPublished),
    [contextVideos, statusFilter],
  );

  const handleStatusClick = (id: string) => {
    setStatusFilter(prev => (prev === id ? 'all' : (id as WorkflowBinaryStatusFilter)));
  };

  const publishRecordTarget = publishRecordTargetId ? getById(publishRecordTargetId) ?? null : null;
  const publishConfirmTarget = publishConfirmTargetId ? getById(publishConfirmTargetId) ?? null : null;

  const handleSavePublishRecord = (patch: Partial<VideoWorkflowMock>) => {
    if (!publishRecordTargetId) return;
    updateVideo(publishRecordTargetId, patch);
  };

  const handleConfirmPublish = (videoId: string) => {
    completePublish(videoId, {});
  };

  const emptyMessage =
    scopeVideos.length === 0
      ? '目前沒有發佈相關的影片（需先完成審核）'
      : statusFilter === 'pending'
        ? '沒有符合條件的待發佈影片'
        : statusFilter === 'done'
          ? '沒有符合條件的已發佈影片'
          : '沒有符合條件的影片';

  return (
    <div className="space-y-4">
      <WorkflowStatusSummaryBar
        filteredCount={filteredVideos.length}
        contextCount={contextVideos.length}
        activeFilter={statusFilter}
        items={[...PUBLISH_STATUS_ITEMS]}
        counts={{ pending: statusCounts.pending, done: statusCounts.done }}
        onSelectAll={() => setStatusFilter('all')}
        onSelectItem={handleStatusClick}
        ariaLabel="發佈狀態篩選"
      />

      <WorkflowListFilters
        channels={channels}
        vchannelFilter={vchannelFilter}
        onVchannelFilterChange={setVchannelFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      {filteredVideos.length === 0 ? (
        <div className="text-center py-16 text-[13px] text-muted-foreground bg-white rounded-md border">
          {emptyMessage}
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-x-auto">
          <WorkflowVideoListHeader variant="publish" />
          {filteredVideos.map(video => (
            <PublishListRow
              key={video.id}
              video={video}
              onOpenPublishRecord={() => setPublishRecordTargetId(video.id)}
              onPublish={() => setPublishConfirmTargetId(video.id)}
            />
          ))}
        </div>
      )}

      {publishRecordTarget && (
        <WorkflowPublishModal
          video={publishRecordTarget}
          onClose={() => setPublishRecordTargetId(null)}
          onSave={handleSavePublishRecord}
        />
      )}

      <PublishConfirmModal
        open={!!publishConfirmTarget}
        video={publishConfirmTarget}
        onClose={() => setPublishConfirmTargetId(null)}
        onConfirm={handleConfirmPublish}
      />
    </div>
  );
}
