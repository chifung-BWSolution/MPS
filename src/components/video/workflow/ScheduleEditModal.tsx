import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Vchannel } from '@/types/vchannel';
import type { ModelAssignment, StaffAssignment, VideoWorkflowDeviceSuffix, VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  defaultDeviceSuffixFromVchannel,
  formatVideoCode,
  generateNextVideoCode,
  parseDeviceSuffixFromVideoCode,
  parseSeqFromVideoCode,
} from '@/services/videoCodeService';
import {
  getPrepMissingItems,
  isPrepComplete,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
} from '@/lib/videoWorkflowUtils';
import { StaffAssignmentField } from '@/components/video/workflow/StaffAssignmentField';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type TalentOption = { id: string; displayName: string };

type Draft = {
  vchannelId: string;
  vchannelCode: string;
  productionYear: number;
  baseSeq: number;
  deviceType: VideoWorkflowDeviceSuffix;
  title: string;
  shootAt: string;
  location: VideoWorkflowMock['location'];
  copywriting?: StaffAssignment;
  script?: StaffAssignment;
  model?: ModelAssignment;
  photographer?: StaffAssignment;
  onSiteCrew: StaffAssignment[];
};

function emptyDraft(): Draft {
  return {
    vchannelId: '',
    vchannelCode: '',
    productionYear: new Date().getFullYear(),
    baseSeq: 0,
    deviceType: null,
    title: '',
    shootAt: '',
    location: { sz: false, hk: false, notes: '' },
    onSiteCrew: [],
  };
}

function draftFromVideo(video: VideoWorkflowMock): Draft {
  const year = video.productionYear ?? new Date().getFullYear();
  const seq = parseSeqFromVideoCode(video.videoCode, video.vchannelCode, year) ?? 0;
  return {
    vchannelId: video.vchannelId ?? '',
    vchannelCode: video.vchannelCode,
    productionYear: year,
    baseSeq: seq,
    deviceType: video.deviceType ?? parseDeviceSuffixFromVideoCode(video.videoCode),
    title: video.title,
    shootAt: video.shootAt ?? '',
    location: { ...video.location },
    copywriting: video.copywriting,
    script: video.script,
    model: video.model,
    photographer: video.photographer,
    onSiteCrew: video.onSiteCrew ? [...video.onSiteCrew] : [],
  };
}

function ModelAssignmentField({
  value,
  talentOptions,
  onChange,
}: {
  value?: ModelAssignment;
  talentOptions: TalentOption[];
  onChange: (next?: ModelAssignment) => void;
}) {
  return (
    <div className="border border-border/60 rounded-md p-3 bg-slate-50/50 space-y-2">
      <p className="text-[12px] font-semibold text-slate-700">Model</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">藝人</label>
          <Select
            value={value?.talentId ?? ''}
            onValueChange={id => {
              const t = talentOptions.find(x => x.id === id);
              onChange({ talentId: id, displayName: t?.displayName ?? id, scheduledAt: value?.scheduledAt ?? '' });
            }}
          >
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue placeholder="從藝人列表選擇" />
            </SelectTrigger>
            <SelectContent>
              {talentOptions.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">到場時間</label>
          <Input
            type="datetime-local"
            value={value?.scheduledAt ?? ''}
            onChange={e => {
              if (!value?.talentId) return;
              onChange({ ...value, scheduledAt: e.target.value });
            }}
            className="h-8 text-[12px]"
          />
        </div>
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  video: VideoWorkflowMock | null;
  channels: Vchannel[];
  staffOptions: { staffId: string; displayName: string }[];
  talentOptions: TalentOption[];
  onClose: () => void;
  onSave: (payload: Partial<VideoWorkflowMock>, isNew: boolean) => Promise<{ error: string | null; id?: string }>;
  onEnterProduction?: (videoId: string) => Promise<string | null>;
};

export function ScheduleEditModal({
  open,
  video,
  channels,
  staffOptions,
  talentOptions,
  onClose,
  onSave,
  onEnterProduction,
}: Props) {
  const isNew = !video;
  const isPrep = isNew || video?.stage === 'prep';

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [codeLoading, setCodeLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [enterError, setEnterError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setEnterError(null);
    if (video) {
      setDraft(draftFromVideo(video));
    } else {
      setDraft(emptyDraft());
    }
  }, [open, video]);

  const videoCode = useMemo(() => {
    if (!draft.vchannelCode || !draft.baseSeq) return '';
    return formatVideoCode(draft.vchannelCode, draft.productionYear, draft.baseSeq, draft.deviceType);
  }, [draft.vchannelCode, draft.productionYear, draft.baseSeq, draft.deviceType]);

  const prepVideo = useMemo((): VideoWorkflowMock => ({
    id: video?.id ?? 'draft',
    vchannelId: draft.vchannelId,
    vchannelCode: draft.vchannelCode,
    videoCode,
    title: draft.title,
    deviceType: draft.deviceType,
    productionYear: draft.productionYear,
    stage: video?.stage ?? 'prep',
    shootAt: draft.shootAt || undefined,
    location: draft.location,
    copywriting: draft.copywriting,
    script: draft.script,
    model: draft.model,
    photographer: draft.photographer,
    onSiteCrew: draft.onSiteCrew,
  }), [draft, video, videoCode]);

  const prepReady = isPrepComplete(prepVideo);
  const missing = getPrepMissingItems(prepVideo);

  const handleVchannelChange = async (vchannelId: string) => {
    const ch = channels.find(c => c.id === vchannelId);
    if (!ch) return;
    const defaultSuffix = defaultDeviceSuffixFromVchannel(ch.deviceType);
    setCodeLoading(true);
    setFormError(null);
    try {
      const { seq, year } = await generateNextVideoCode(ch.channelCode, defaultSuffix);
      setDraft(d => ({
        ...d,
        vchannelId: ch.id,
        vchannelCode: ch.channelCode,
        productionYear: year,
        baseSeq: seq,
        deviceType: defaultSuffix,
      }));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '無法生成 Video Code');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleDeviceTypeChange = (value: string) => {
    const deviceType: VideoWorkflowDeviceSuffix =
      value === 'D' ? 'D' : value === 'M' ? 'M' : null;
    setDraft(d => ({ ...d, deviceType }));
  };

  const buildPayload = (): Partial<VideoWorkflowMock> => ({
    vchannelId: draft.vchannelId,
    vchannelCode: draft.vchannelCode,
    videoCode,
    title: draft.title.trim(),
    deviceType: draft.deviceType,
    productionYear: draft.productionYear,
    shootAt: draft.shootAt || undefined,
    location: draft.location,
    copywriting: draft.copywriting,
    script: draft.script,
    model: draft.model,
    photographer: draft.photographer,
    onSiteCrew: draft.onSiteCrew.filter(m => m.userId),
  });

  const handleSave = async () => {
    setFormError(null);
    if (!draft.vchannelId) {
      setFormError('請選擇 Vchannel');
      return;
    }
    if (!draft.title.trim()) {
      setFormError('請填寫主題');
      return;
    }
    if (!videoCode) {
      setFormError('Video Code 生成失敗，請重選 Vchannel');
      return;
    }
    setSaving(true);
    const result = await onSave(buildPayload(), isNew);
    setSaving(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    onClose();
  };

  const handleEnter = async () => {
    setEnterError(null);
    if (!prepReady) {
      setEnterError(`尚有未完成的準備項：${missing.join('、')}`);
      return;
    }
    setSaving(true);
    const result = await onSave(buildPayload(), isNew);
    if (result.error) {
      setSaving(false);
      setEnterError(result.error);
      return;
    }
    const videoId = result.id ?? video?.id;
    if (!videoId) {
      setSaving(false);
      setEnterError('無法取得影片 ID');
      return;
    }
    const err = await onEnterProduction?.(videoId);
    setSaving(false);
    if (err) {
      setEnterError(err);
      return;
    }
    onClose();
  };

  const updateCrew = (index: number, next?: StaffAssignment) => {
    const crew = [...draft.onSiteCrew];
    if (next) crew[index] = next;
    else crew.splice(index, 1);
    setDraft(d => ({ ...d, onSiteCrew: crew }));
  };

  return (
    <CrudModal
      isOpen={open}
      onClose={onClose}
      title={isNew ? '新建影片' : `編輯 — ${video?.videoCode ?? ''}`}
      size="lg"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {formError && (
          <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{formError}</p>
        )}

        {!isNew && video && (
          <div className="flex items-center gap-2">
            <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', VIDEO_WORKFLOW_STAGE_COLORS[video.stage])}>
              {VIDEO_WORKFLOW_STAGE_LABELS[video.stage]}
            </span>
          </div>
        )}

        <div className="border border-border/60 rounded-md p-3 space-y-3">
          <p className="text-[12px] font-bold text-teal-800">基本資訊</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Vchannel *</label>
              <Select
                value={draft.vchannelId || ''}
                onValueChange={handleVchannelChange}
                disabled={!isNew || codeLoading}
              >
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue placeholder="選擇頻道" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map(ch => (
                    <SelectItem key={ch.id} value={ch.id}>
                      {ch.channelCode} — {ch.publicName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">Video Code</label>
              <div className="relative">
                <Input
                  value={codeLoading ? '生成中…' : videoCode}
                  readOnly
                  className="h-9 text-[13px] font-mono bg-muted/40"
                />
                {codeLoading && (
                  <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1.5">Device Type（可選，用於 Code 後綴）</label>
            <div className="flex flex-wrap gap-4">
              {([
                { value: 'none', label: '不指定' },
                { value: 'D', label: 'D（Desktop）' },
                { value: 'M', label: 'M（Mobile）' },
              ] as const).map(opt => (
                <label key={opt.value} className={cn('flex items-center gap-1.5 text-[12px]', !isNew && 'opacity-60')}>
                  <input
                    type="radio"
                    name="deviceType"
                    checked={(opt.value === 'none' ? draft.deviceType === null : draft.deviceType === opt.value)}
                    onChange={() => handleDeviceTypeChange(opt.value)}
                    disabled={!isNew}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">主題 *</label>
            <Input
              value={draft.title}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              placeholder="影片標題"
              className="h-9 text-[13px]"
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[12px] font-bold text-teal-800">準備工作</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">拍攝日期</label>
              <Input type="date" value={draft.shootAt}
                onChange={e => setDraft(d => ({ ...d, shootAt: e.target.value }))}
                className="h-8 text-[12px]" />
            </div>
            <div className="border border-border/60 rounded-md p-3 bg-slate-50/50">
              <p className="text-[12px] font-semibold text-slate-700 mb-2">場地</p>
              <div className="flex items-center gap-4 mb-2">
                <label className="flex items-center gap-1.5 text-[12px]">
                  <input type="checkbox" checked={!!draft.location.sz}
                    onChange={e => setDraft(d => ({ ...d, location: { ...d.location, sz: e.target.checked } }))} />
                  深圳
                </label>
                <label className="flex items-center gap-1.5 text-[12px]">
                  <input type="checkbox" checked={!!draft.location.hk}
                    onChange={e => setDraft(d => ({ ...d, location: { ...d.location, hk: e.target.checked } }))} />
                  香港
                </label>
              </div>
              <Input value={draft.location.notes ?? ''}
                onChange={e => setDraft(d => ({ ...d, location: { ...d.location, notes: e.target.value } }))}
                placeholder="備註" className="h-8 text-[12px]" />
            </div>
          </div>

          <StaffAssignmentField label="文案" value={draft.copywriting} staffOptions={staffOptions}
            onChange={copywriting => setDraft(d => ({ ...d, copywriting }))} />
          <StaffAssignmentField label="腳本" value={draft.script} staffOptions={staffOptions}
            onChange={script => setDraft(d => ({ ...d, script }))} />
          <ModelAssignmentField value={draft.model} talentOptions={talentOptions}
            onChange={model => setDraft(d => ({ ...d, model }))} />
          <StaffAssignmentField label="攝影師" value={draft.photographer} staffOptions={staffOptions}
            onChange={photographer => setDraft(d => ({ ...d, photographer }))} />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-slate-700">到場人員</p>
              <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                onClick={() => setDraft(d => ({ ...d, onSiteCrew: [...d.onSiteCrew, { userId: '', displayName: '', scheduledAt: '' }] }))}>
                <Plus size={11} /> 新增
              </Button>
            </div>
            {draft.onSiteCrew.length === 0 ? (
              <p className="text-[12px] text-muted-foreground bg-muted/30 rounded px-3 py-2">尚未添加到場人員</p>
            ) : (
              draft.onSiteCrew.map((member, index) => (
                <div key={index} className="relative">
                  <StaffAssignmentField label={`到場人員 #${index + 1}`}
                    value={member.userId ? member : undefined} staffOptions={staffOptions}
                    onChange={next => updateCrew(index, next)} />
                  <button type="button" onClick={() => updateCrew(index)}
                    className="absolute top-2 right-2 text-rose-500 hover:text-rose-700 p-1" title="移除">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {enterError && (
          <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{enterError}</p>
        )}
        {isPrep && !prepReady && !enterError && (
          <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            待完成：{missing.join('、')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-border mt-4">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>取消</Button>
        <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving || codeLoading}>
          {saving ? <><Loader2 size={14} className="animate-spin mr-1" />保存中…</> : '保存'}
        </Button>
        {isPrep && onEnterProduction && (
          <Button size="sm" className="bg-teal-700 hover:bg-teal-800 text-white" disabled={!prepReady || saving || codeLoading}
            onClick={handleEnter}>
            進入製作
          </Button>
        )}
      </div>
    </CrudModal>
  );
}
