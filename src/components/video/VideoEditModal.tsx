import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { VideoOutput, VideoOutputInput, VideoProjectCategory } from '@/types/videoOutput';
import type { VideoWorkLogDraft } from '@/types/videoOutputWorkLog';
import { CrudModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VideoWorkLogEditor } from '@/components/video/VideoWorkLogEditor';
import {
  fetchStaffDirectoryOptions,
  fetchWorkLogsByVideoId,
  validateWorkLogDrafts,
} from '@/services/videoOutputWorkLogService';
import { resolveBubbleStaffId } from '@/services/reportLinkService';
import { syncVideoPendingReport } from '@/services/videoReportLinkService';
import { useAuth } from '@/context/AuthContext';

type VchannelOption = { id: string; channelCode: string; publicName: string };

type Props = {
  video: VideoOutput;
  channels: VchannelOption[];
  onClose: () => void;
  onSave: (input: Partial<VideoOutputInput>, workLogs: VideoWorkLogDraft[]) => Promise<Error | null>;
};

function toDraftFromLog(log: Awaited<ReturnType<typeof fetchWorkLogsByVideoId>>[number]): VideoWorkLogDraft {
  return {
    id: log.id,
    staffId: log.staffId,
    staffName: log.staffName,
    workDate: log.workDate,
    hours: log.hours,
    workType: log.workType,
    notes: log.notes,
  };
}

export function VideoEditModal({ video, channels, onClose, onSave }: Props) {
  const { systemUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<{ staffId: string; displayName: string }[]>([]);
  const [defaultStaffId, setDefaultStaffId] = useState<string>();
  const [defaultStaffName, setDefaultStaffName] = useState<string>();
  const [workLogs, setWorkLogs] = useState<VideoWorkLogDraft[]>([]);

  const [form, setForm] = useState({
    vchannelId: video.vchannelId,
    productionYear: video.productionYear ?? new Date().getFullYear(),
    videoCode: video.videoCode,
    title: video.title,
    shootLocationHk: video.shootHk,
    shootLocationSz: video.shootSz,
    rawFootageDone: video.rawFootageDone,
    needsEditing: video.needsEditing === true,
    demoDone: video.demoDone,
    copySc: video.copySc,
    copyTc: video.copyTc,
    copyEn: video.copyEn,
    subtitleDone: video.subtitleDone,
    shootAt: video.shootAt ?? '',
    plannedPublishDate: video.plannedPublishDate ?? '',
    publishedDate: video.publishedDate ?? '',
    storagePath: video.storagePath ?? '',
    asanaUrl: video.asanaUrl ?? '',
    notes: video.notes ?? '',
    projectCategory: video.projectCategory as VideoProjectCategory,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [staffList, logs, staffId] = await Promise.all([
          fetchStaffDirectoryOptions(),
          fetchWorkLogsByVideoId(video.id),
          resolveBubbleStaffId(systemUser),
        ]);
        if (cancelled) return;
        setStaffOptions(staffList);
        setWorkLogs(logs.map(toDraftFromLog));
        if (staffId) {
          setDefaultStaffId(staffId);
          const me = staffList.find(s => s.staffId === staffId);
          setDefaultStaffName(me?.displayName);
        }
      } catch (err) {
        if (!cancelled) {
          setFormError(err instanceof Error ? err.message : '載入失敗');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [video.id, systemUser]);

  const handleSubmit = async () => {
    setFormError(null);
    setSaveNotice(null);
    if (!form.title.trim()) {
      setFormError('請輸入主題');
      return;
    }
    const logError = validateWorkLogDrafts(workLogs);
    if (logError) {
      setFormError(logError);
      return;
    }

    setSaving(true);
    try {
      const input: Partial<VideoOutputInput> = {
        vchannelId: form.vchannelId,
        productionYear: form.productionYear,
        videoCode: form.videoCode.trim(),
        title: form.title.trim(),
        shootSz: form.shootLocationSz,
        shootHk: form.shootLocationHk,
        rawFootageDone: form.rawFootageDone,
        needsEditing: form.needsEditing,
        demoDone: form.demoDone,
        copySc: form.copySc,
        copyTc: form.copyTc,
        copyEn: form.copyEn,
        subtitleDone: form.subtitleDone,
        shootAt: form.shootAt || undefined,
        plannedPublishDate: form.plannedPublishDate || undefined,
        publishedDate: form.publishedDate || undefined,
        storagePath: form.storagePath.trim() || undefined,
        asanaUrl: form.asanaUrl.trim() || undefined,
        notes: form.notes.trim() || undefined,
        projectCategory: form.projectCategory,
      };

      const err = await onSave(input, workLogs);
      if (err) {
        setFormError(err.message || '儲存失敗');
        return;
      }

      const staffId = await resolveBubbleStaffId(systemUser);
      if (staffId) {
        const ch = channels.find(c => c.id === (input.vchannelId ?? video.vchannelId));
        const updatedVideo: VideoOutput = {
          ...video,
          ...input,
          vchannelId: input.vchannelId ?? video.vchannelId,
          channelCode: ch?.channelCode ?? video.channelCode,
          channelPublicName: ch?.publicName ?? video.channelPublicName,
          videoCode: input.videoCode ?? video.videoCode,
          title: input.title ?? video.title,
          shootSz: input.shootSz ?? video.shootSz,
          shootHk: input.shootHk ?? video.shootHk,
          rawFootageDone: input.rawFootageDone ?? video.rawFootageDone,
          needsEditing: input.needsEditing !== undefined ? input.needsEditing : video.needsEditing,
          demoDone: input.demoDone ?? video.demoDone,
          shootAt: input.shootAt,
          plannedPublishDate: input.plannedPublishDate,
          publishedDate: input.publishedDate,
          storagePath: input.storagePath,
          asanaUrl: input.asanaUrl,
          notes: input.notes,
          projectCategory: input.projectCategory ?? video.projectCategory,
        };
        const syncResult = await syncVideoPendingReport(updatedVideo, workLogs, staffId);
        if (syncResult.action === 'created' || syncResult.action === 'updated') {
          const hours = workLogs.filter(l => l.staffId === staffId).reduce((s, l) => s + l.hours, 0);
          setSaveNotice(`已${syncResult.action === 'created' ? '加入' : '更新'}待匯報（${hours.toFixed(1)}h）`);
          setTimeout(() => onClose(), 800);
          return;
        }
        if (syncResult.reason === 'consumed') {
          setSaveNotice('影片已保存；匯報項已提交，工時變更不會自動更新已提交記錄');
          setTimeout(() => onClose(), 1200);
          return;
        }
      }

      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrudModal isOpen onClose={onClose} title={`編輯影片 — ${video.videoCode}`} size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[13px]">載入中...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {formError && (
            <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{formError}</p>
          )}
          {saveNotice && (
            <p className="text-[12px] text-teal-700 bg-teal-50 border border-teal-200 rounded px-3 py-2">{saveNotice}</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium mb-1 block">Vchannel</label>
              <Select value={form.vchannelId} onValueChange={v => setForm(f => ({ ...f, vchannelId: v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {channels.map(ch => (
                    <SelectItem key={ch.id} value={ch.id}>{ch.channelCode} — {ch.publicName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block">年份</label>
              <Input
                type="number"
                value={form.productionYear}
                onChange={e => setForm(f => ({ ...f, productionYear: parseInt(e.target.value, 10) || undefined }))}
                className="h-9 text-[13px]"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1 block">Video Code</label>
            <Input value={form.videoCode} readOnly className="h-9 text-[13px] font-mono bg-muted/40" />
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1 block">主題 *</label>
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="h-9 text-[13px]"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[12px] font-medium mb-1 block">拍攝時間</label>
              <Input type="date" value={form.shootAt} onChange={e => setForm(f => ({ ...f, shootAt: e.target.value }))} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block">預計發佈</label>
              <Input type="date" value={form.plannedPublishDate} onChange={e => setForm(f => ({ ...f, plannedPublishDate: e.target.value }))} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1 block">發佈日期</label>
              <Input type="date" value={form.publishedDate} onChange={e => setForm(f => ({ ...f, publishedDate: e.target.value }))} className="h-9 text-[13px]" />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1 block">視頻保存地址 / 鏈接</label>
            <Input value={form.storagePath} onChange={e => setForm(f => ({ ...f, storagePath: e.target.value }))} className="h-9 text-[13px]" />
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1 block">Asana 連結</label>
            <Input value={form.asanaUrl} onChange={e => setForm(f => ({ ...f, asanaUrl: e.target.value }))} className="h-9 text-[13px]" />
          </div>

          <div>
            <label className="text-[12px] font-medium mb-2 block">拍攝地址</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={form.shootLocationHk} onChange={e => setForm(f => ({ ...f, shootLocationHk: e.target.checked }))} />
                香港
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={form.shootLocationSz} onChange={e => setForm(f => ({ ...f, shootLocationSz: e.target.checked }))} />
                深圳
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={form.rawFootageDone} onChange={e => setForm(f => ({ ...f, rawFootageDone: e.target.checked }))} />
              原片拍攝
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={form.needsEditing} onChange={e => setForm(f => ({ ...f, needsEditing: e.target.checked }))} />
              是否剪輯
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={form.demoDone} onChange={e => setForm(f => ({ ...f, demoDone: e.target.checked }))} />
              Demo 完成
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={form.subtitleDone} onChange={e => setForm(f => ({ ...f, subtitleDone: e.target.checked }))} />
              字幕
            </label>
          </div>

          <div>
            <label className="text-[12px] font-medium mb-2 block">文案</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={form.copySc} onChange={e => setForm(f => ({ ...f, copySc: e.target.checked }))} />
                簡體
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={form.copyTc} onChange={e => setForm(f => ({ ...f, copyTc: e.target.checked }))} />
                繁體
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={form.copyEn} onChange={e => setForm(f => ({ ...f, copyEn: e.target.checked }))} />
                英文
              </label>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1 block">備註</label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="h-9 text-[13px]" />
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1 block">項目類型</label>
            <Select value={form.projectCategory} onValueChange={v => setForm(f => ({ ...f, projectCategory: v as VideoProjectCategory }))}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">內部項目</SelectItem>
                <SelectItem value="client">客戶項目</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-border pt-4">
            <VideoWorkLogEditor
              logs={workLogs}
              onChange={setWorkLogs}
              staffOptions={staffOptions}
              defaultStaffId={defaultStaffId}
              defaultStaffName={defaultStaffName}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>取消</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSubmit} disabled={saving}>
              {saving ? '儲存中...' : '保存'}
            </Button>
          </div>
        </div>
      )}
    </CrudModal>
  );
}
