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
import { fetchWorkLogsByVideoId, saveWorkLogsForVideo } from '@/services/videoOutputWorkLogService';
import { resolveBubbleStaffId, localDateString } from '@/services/reportLinkService';
import { syncVideoPendingReport } from '@/services/videoReportLinkService';
import { useAuth } from '@/context/AuthContext';
import type { VideoWorkLogDraft } from '@/types/videoOutputWorkLog';

type Props = {
  video: VideoOutput;
  onClose: () => void;
  onSave: (input: Partial<VideoOutputInput>) => Promise<Error | null>;
};

function emptyUrlMap(): Record<PlatformPublishKey, string> {
  return Object.fromEntries(MEDIA_PLATFORM_PUBLISH_KEYS.map(k => [k, ''])) as Record<PlatformPublishKey, string>;
}

export function PlatformPublishModal({ video, onClose, onSave }: Props) {
  const { systemUser } = useAuth();
  const [selectedKey, setSelectedKey] = useState<PlatformPublishKey>(MEDIA_PLATFORM_PUBLISH_KEYS[0]);
  const [urls, setUrls] = useState<Record<PlatformPublishKey, string>>(() => {
    const initial = emptyUrlMap();
    const existing = urlsFromPlatformPublish(video.platformPublish);
    for (const key of MEDIA_PLATFORM_PUBLISH_KEYS) {
      initial[key] = existing[key] ?? '';
    }
    return initial;
  });
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const previewPublish = useMemo(
    () => mergePlatformUrls(video.platformPublish, urls),
    [video.platformPublish, urls],
  );

  const hasAnyUrl = MEDIA_PLATFORM_PUBLISH_KEYS.some(k => urls[k]?.trim());
  const hasPublished = MEDIA_PLATFORM_PUBLISH_KEYS.some(k => isPlatformPublished(previewPublish, k));
  const canSubmit = hasAnyUrl || hasPublished;

  const handleSubmit = async () => {
    setFormError(null);
    setSaveNotice(null);

    const hoursNum = parseFloat(hours);
    if (hours.trim() && (Number.isNaN(hoursNum) || hoursNum <= 0)) {
      setFormError('工時必須大於 0');
      return;
    }

    setSaving(true);
    try {
      const platformPublish = mergePlatformUrls(video.platformPublish, urls);
      const anyPublished = MEDIA_PLATFORM_PUBLISH_KEYS.some(k => isPlatformPublished(platformPublish, k));
      const publishedDate =
        anyPublished && !video.publishedDate ? localDateString() : video.publishedDate;

      const err = await onSave({ platformPublish, publishedDate });
      if (err) {
        setFormError(err.message || '儲存失敗');
        return;
      }

      const staffId = await resolveBubbleStaffId(systemUser);
      if (hoursNum > 0 && staffId) {
        const existingLogs = await fetchWorkLogsByVideoId(video.id);
        const publishLog: VideoWorkLogDraft = {
          staffId,
          workDate: localDateString(),
          hours: hoursNum,
          workType: 'other',
          notes: '平台發佈',
        };
        await saveWorkLogsForVideo(video.id, [...existingLogs.map(l => ({
          id: l.id,
          staffId: l.staffId,
          staffName: l.staffName,
          workDate: l.workDate,
          hours: l.hours,
          workType: l.workType,
          notes: l.notes,
        })), publishLog], staffId);

        const updatedVideo: VideoOutput = {
          ...video,
          platformPublish,
          publishedDate,
        };
        const allLogs = [...existingLogs.map(l => ({
          staffId: l.staffId,
          staffName: l.staffName,
          workDate: l.workDate,
          hours: l.hours,
          workType: l.workType,
          notes: l.notes,
        })), publishLog];

        const syncResult = await syncVideoPendingReport(updatedVideo, allLogs, staffId);
        if (syncResult.action === 'created' || syncResult.action === 'updated') {
          setSaveNotice(`已加入待匯報（${hoursNum.toFixed(1)}h）`);
          setTimeout(() => onClose(), 800);
          return;
        }
        if (syncResult.reason === 'consumed') {
          setSaveNotice('發佈已保存；匯報項已提交，工時不會自動更新已提交記錄');
          setTimeout(() => onClose(), 1200);
          return;
        }
      }

      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrudModal isOpen onClose={onClose} title={`平台發佈 — ${video.videoCode}`} size="lg">
      <div className="space-y-4">
        {formError && (
          <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{formError}</p>
        )}
        {saveNotice && (
          <p className="text-[12px] text-teal-700 bg-teal-50 border border-teal-200 rounded px-3 py-2">{saveNotice}</p>
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

        <div className="border-t border-border pt-4">
          <label className="text-[12px] font-medium mb-1 block">工時（小時）</label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={hours}
            onChange={e => setHours(e.target.value)}
            placeholder="選填；保存後自動帶入工作匯報"
            className="h-9 text-[13px] max-w-[200px]"
          />
          <p className="text-[11px] text-muted-foreground mt-1.5">
            填寫工時後，保存時將自動同步至「工作匯報」待匯報項。
          </p>
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
