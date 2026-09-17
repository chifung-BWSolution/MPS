import { useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VideoOutput, VideoOutputInput } from '@/types/videoOutput';
import type { PlatformPublishKey } from '@/types/videoOutput';
import {
  MEDIA_PLATFORM_PUBLISH_KEYS,
  PLATFORM_PUBLISH_LABELS,
  isPlatformPublished,
  mergePlatformUrls,
  urlsFromPlatformPublish,
} from '@/lib/videoOutputUtils';
import { CrudModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { localDateString } from '@/services/reportLinkService';

type Props = {
  video: VideoOutput;
  onClose: () => void;
  onSave: (input: Partial<VideoOutputInput>) => Promise<Error | null>;
};

function emptyUrlMap(): Record<PlatformPublishKey, string> {
  return Object.fromEntries(MEDIA_PLATFORM_PUBLISH_KEYS.map(k => [k, ''])) as Record<PlatformPublishKey, string>;
}

export function PlatformPublishModal({ video, onClose, onSave }: Props) {
  const [selectedKey, setSelectedKey] = useState<PlatformPublishKey>(MEDIA_PLATFORM_PUBLISH_KEYS[0]);
  const [urls, setUrls] = useState<Record<PlatformPublishKey, string>>(() => {
    const initial = emptyUrlMap();
    const existing = urlsFromPlatformPublish(video.platformPublish);
    for (const key of MEDIA_PLATFORM_PUBLISH_KEYS) {
      initial[key] = existing[key] ?? '';
    }
    return initial;
  });
  const [publishedDate, setPublishedDate] = useState(
    () => video.publishedDate?.trim() || localDateString(),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const previewPublish = useMemo(
    () => mergePlatformUrls(video.platformPublish, urls),
    [video.platformPublish, urls],
  );

  const hasAnyUrl = MEDIA_PLATFORM_PUBLISH_KEYS.some(k => urls[k]?.trim());
  const hasPublished = MEDIA_PLATFORM_PUBLISH_KEYS.some(k => isPlatformPublished(previewPublish, k));
  const canSubmit = hasAnyUrl || hasPublished;

  const handleSubmit = async () => {
    setFormError(null);

    if (!publishedDate.trim()) {
      setFormError('請選擇實際發佈日期');
      return;
    }

    setSaving(true);
    try {
      const platformPublish = mergePlatformUrls(video.platformPublish, urls);
      const resolvedPublishedDate = publishedDate.trim();

      const err = await onSave({ platformPublish, publishedDate: resolvedPublishedDate });
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

  return (
    <CrudModal
      isOpen
      onClose={onClose}
      title={`平台發佈 — ${video.videoCode}`}
      size="lg"
      headerActions={
        <div className="flex items-center gap-2 mr-1">
          <label className="text-[12px] text-muted-foreground whitespace-nowrap">實際發佈日期</label>
          <Input
            type="date"
            value={publishedDate}
            onChange={e => setPublishedDate(e.target.value)}
            className="h-8 w-[150px] text-[12px]"
          />
        </div>
      }
    >
      <div className="space-y-4">
        {formError && (
          <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{formError}</p>
        )}

        <p className="text-[12px] text-muted-foreground">{video.title}</p>

        <div className="flex border border-border/60 rounded-md overflow-hidden min-h-[280px]">
          <div className="w-[140px] shrink-0 border-r border-border/60 bg-slate-50/80">
            {MEDIA_PLATFORM_PUBLISH_KEYS.map(key => {
              const hasUrl = !!urls[key]?.trim();
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
                  {wasPublished ? (
                    <Check size={12} className="shrink-0 text-teal-600" strokeWidth={3} />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span className="truncate">{PLATFORM_PUBLISH_LABELS[key]}</span>
                  {hasUrl && selectedKey !== key && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex-1 p-4 bg-white">
            <label className="text-[12px] font-medium mb-2 block">
              {PLATFORM_PUBLISH_LABELS[selectedKey]} 鏈接
            </label>
            <Input
              value={urls[selectedKey]}
              onChange={e => setUrls(prev => ({ ...prev, [selectedKey]: e.target.value }))}
              placeholder="https://..."
              className="h-9 text-[13px]"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground mt-2">
              填寫 URL 即視為該平台已發佈；留空則清除該平台記錄。
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>取消</Button>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleSubmit}
            disabled={saving || !canSubmit}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1" />
                保存中...
              </>
            ) : (
              '確認發佈'
            )}
          </Button>
        </div>
      </div>
    </CrudModal>
  );
}
