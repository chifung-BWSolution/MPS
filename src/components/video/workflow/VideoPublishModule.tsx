import { useMemo, useState } from 'react';
import { Check, Copy, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import type { PlatformPublishKey } from '@/types/videoOutput';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  countPublishedPlatforms,
  formatLocation,
  isPublishComplete,
  VIDEO_WORKFLOW_STAGE_COLORS,
} from '@/lib/videoWorkflowUtils';
import {
  formatPlatformPublishCopyText,
  getPublishedPlatformKeys,
  getPublishedPlatformKeysWithUrl,
  getPlatformUrl,
  isPlatformPublished,
  MEDIA_PLATFORM_PUBLISH_KEYS,
  mergePlatformUrls,
  PLATFORM_PUBLISH_LABELS,
  urlsFromPlatformPublish,
} from '@/lib/videoOutputUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CrudModal } from '@/components/ui/crud-modal';

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
  const [plannedPublishDate, setPlannedPublishDate] = useState(video.plannedPublishDate ?? '');
  const [publishedDate, setPublishedDate] = useState(video.publishedDate ?? '');

  const previewPublish = useMemo(
    () => mergePlatformUrls(video.platformPublish ?? {}, urls),
    [video.platformPublish, urls],
  );

  const handleSubmit = () => {
    const platformPublish = mergePlatformUrls(video.platformPublish ?? {}, urls);
    const anyPublished = MEDIA_PLATFORM_PUBLISH_KEYS.some(k => isPlatformPublished(platformPublish, k));
    onSave({
      platformPublish,
      plannedPublishDate: plannedPublishDate || undefined,
      publishedDate: anyPublished && !publishedDate ? new Date().toISOString().slice(0, 10) : publishedDate || undefined,
    });
    onClose();
  };

  return (
    <CrudModal isOpen onClose={onClose} title={`平台發佈 — ${video.videoCode}`} size="lg">
      <div className="space-y-4">
        <p className="text-[12px] text-muted-foreground">{video.title}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-medium mb-1 block">預計發佈</label>
            <Input type="date" value={plannedPublishDate} onChange={e => setPlannedPublishDate(e.target.value)} className="h-9 text-[13px]" />
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

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSubmit}>保存發佈</Button>
        </div>
      </div>
    </CrudModal>
  );
}

function PublishCard({ video }: { video: VideoWorkflowMock }) {
  const { updateVideo, completePublish } = useVideoWorkflow();
  const [modalOpen, setModalOpen] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const platformPublish = video.platformPublish ?? {};
  const publishedCount = countPublishedPlatforms(platformPublish);
  const copyableKeys = getPublishedPlatformKeysWithUrl(platformPublish);

  const handleCopy = async () => {
    const text = formatPlatformPublishCopyText(platformPublish);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleSavePublish = (patch: Partial<VideoWorkflowMock>) => {
    const merged = { ...video, ...patch, platformPublish: patch.platformPublish ?? video.platformPublish };
    if (isPublishComplete(merged)) {
      completePublish(video.id, patch);
    } else {
      updateVideo(video.id, patch);
    }
  };

  return (
    <>
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">{video.videoCode} · {video.vchannelCode}</p>
            <h3 className="text-[16px] font-bold">{video.title}</h3>
            <p className="text-[11px] text-muted-foreground mt-1">{formatLocation(video.location)}</p>
          </div>
          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', VIDEO_WORKFLOW_STAGE_COLORS.publish)}>
            待發佈
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">已發佈平台：</span>
          <span className="font-medium text-teal-700">{publishedCount} / {MEDIA_PLATFORM_PUBLISH_KEYS.length}</span>
          {video.plannedPublishDate && (
            <span className="text-muted-foreground">· 預計 {video.plannedPublishDate}</span>
          )}
        </div>

        {getPublishedPlatformKeys(platformPublish).length > 0 && (
          <div className="space-y-1">
            {getPublishedPlatformKeys(platformPublish).map(key => (
              <div key={key} className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground w-16 shrink-0">{PLATFORM_PUBLISH_LABELS[key]}</span>
                <span className="truncate text-teal-700">{getPlatformUrl(platformPublish, key) || '已發佈'}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1" onClick={() => setModalOpen(true)}>
            <Plus size={12} /> 編輯發佈
          </Button>
          {copyableKeys.length > 0 && (
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={handleCopy}>
              <Copy size={12} /> {copyDone ? '已複製' : '複製文案'}
            </Button>
          )}
          {isPublishComplete(video) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-teal-300 text-teal-700"
              onClick={() => completePublish(video.id, {})}
            >
              標記為已發佈
            </Button>
          )}
        </div>
      </div>

      {modalOpen && (
        <WorkflowPublishModal
          video={video}
          onClose={() => setModalOpen(false)}
          onSave={handleSavePublish}
        />
      )}
    </>
  );
}

export function VideoPublishModule() {
  const { getByStage } = useVideoWorkflow();
  const publishVideos = getByStage('publish');

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">{publishVideos.length} 部待發佈</p>
      {publishVideos.length === 0 ? (
        <div className="text-center py-16 text-[13px] text-muted-foreground bg-white rounded-md border">
          目前沒有待發佈的影片（需先完成審核）
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {publishVideos.map(video => (
            <PublishCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}
