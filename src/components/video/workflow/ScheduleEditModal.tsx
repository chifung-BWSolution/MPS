import { useEffect, useMemo, useState } from 'react';
import { Building2, ExternalLink, Loader2, Plus, Trash2, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VideoOutputStatus, VideoProjectCategory } from '@/types/videoOutput';
import type { Vchannel } from '@/types/vchannel';
import type {
  ModelAssignment,
  StaffAssignment,
  VideoWorkflowDeviceSuffix,
  VideoWorkflowMock,
  VideoWorkflowStage,
} from '@/types/videoWorkflow';
import {
  formatVideoCode,
  generateNextVideoCode,
  parseDeviceSuffixFromVideoCode,
  parseSeqFromVideoCode,
} from '@/services/videoCodeService';
import { localDateString } from '@/services/reportLinkService';
import {
  deriveVideoOutputStatus,
  hasAnyMediaPlatformPublished,
  inferProjectCategory,
  VIDEO_OUTPUT_STATUS_COLORS,
  VIDEO_OUTPUT_STATUS_LABELS,
} from '@/lib/videoOutputUtils';
import {
  getPrepMissingItems,
  isPrepComplete,
  validateNewVideoScheduleRequired,
} from '@/lib/videoWorkflowUtils';
import { StaffAssignmentField } from '@/components/video/workflow/StaffAssignmentField';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type TalentOption = { id: string; displayName: string };

const STATUS_OPTIONS: VideoOutputStatus[] = [
  'pending',
  'in_production',
  'pending_publish',
  'published',
  'delisted',
];

function statusToWorkflowStage(status: VideoOutputStatus): VideoWorkflowStage {
  switch (status) {
    case 'pending':
      return 'prep';
    case 'in_production':
      return 'production';
    case 'pending_publish':
      return 'review';
    case 'published':
      return 'published';
    case 'delisted':
      return 'delisted';
  }
}

function deriveScheduleStatus(video: VideoWorkflowMock): VideoOutputStatus {
  return deriveVideoOutputStatus({
    workflowStage: video.stage,
    shootSz: !!video.location?.sz,
    shootHk: !!video.location?.hk,
    rawFootageDone: video.rawFootageDone,
    needsEditing: video.needsEditing,
    demoDone: video.demoDone,
    publishedDate: video.publishedDate,
    platformPublish: video.platformPublish ?? {},
  });
}

function statusChangePatch(video: VideoWorkflowMock, status: VideoOutputStatus): Partial<VideoWorkflowMock> {
  const patch: Partial<VideoWorkflowMock> = {
    stage: statusToWorkflowStage(status),
  };
  if (status === 'published') {
    if (!video.publishedDate?.trim()) {
      patch.publishedDate = localDateString();
    }
  } else if (status !== 'delisted') {
    patch.publishedDate = '';
    if (hasAnyMediaPlatformPublished(video.platformPublish)) {
      patch.platformPublish = {};
    }
  }
  return patch;
}

type Draft = {
  vchannelId: string;
  vchannelCode: string;
  productionYear: number;
  baseSeq: number;
  deviceType: VideoWorkflowDeviceSuffix;
  projectCategory: VideoProjectCategory;
  videoCode: string;
  title: string;
  asanaUrl: string;
  shootAt: string;
  location: VideoWorkflowMock['location'];
  script?: StaffAssignment;
  model?: ModelAssignment;
  photographer?: StaffAssignment;
  onSiteCrew: StaffAssignment[];
  status: VideoOutputStatus;
};

function emptyDraft(): Draft {
  return {
    vchannelId: '',
    vchannelCode: '',
    productionYear: new Date().getFullYear(),
    baseSeq: 0,
    deviceType: null,
    projectCategory: 'client',
    videoCode: '',
    title: '',
    asanaUrl: '',
    shootAt: '',
    location: { sz: false, hk: false, notes: '' },
    onSiteCrew: [],
    status: 'pending',
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
    projectCategory: video.projectCategory ?? inferProjectCategory(video.vchannelCode),
    videoCode: video.videoCode,
    title: video.title,
    asanaUrl: video.asanaUrl ?? '',
    shootAt: video.shootAt ?? '',
    location: { ...video.location },
    script: video.script,
    model: video.model,
    photographer: video.photographer,
    onSiteCrew: video.onSiteCrew ? [...video.onSiteCrew] : [],
    status: deriveScheduleStatus(video),
  };
}

function OptionPills<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: readonly { value: T; label: string; icon?: LucideIcon; activeClassName: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map(opt => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px] font-medium transition-all',
              selected ? opt.activeClassName : 'border-border text-muted-foreground hover:bg-muted/50',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {Icon ? <Icon size={13} /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const LOCATION_PILL_OPTIONS = [
  { key: 'sz' as const, label: '深圳', activeClassName: 'border-teal-600 bg-teal-50 text-teal-700' },
  { key: 'hk' as const, label: '香港', activeClassName: 'border-sky-600 bg-sky-50 text-sky-700' },
];

function LocationPills({
  sz,
  hk,
  onToggle,
}: {
  sz: boolean;
  hk: boolean;
  onToggle: (key: 'sz' | 'hk') => void;
}) {
  const selected = { sz, hk };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {LOCATION_PILL_OPTIONS.map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onToggle(opt.key)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[12px] font-medium transition-all',
            selected[opt.key] ? opt.activeClassName : 'border-border text-muted-foreground hover:bg-muted/50',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
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
  staffOptions: { staffId: string; displayName: string; bubbleStaffId?: string }[];
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

  const prepVideo = useMemo((): VideoWorkflowMock => ({
    id: video?.id ?? 'draft',
    vchannelId: draft.vchannelId,
    vchannelCode: draft.vchannelCode,
    videoCode: draft.videoCode.trim(),
    title: draft.title,
    deviceType: draft.deviceType,
    productionYear: draft.productionYear,
    stage: video?.stage ?? 'prep',
    shootAt: draft.shootAt || undefined,
    location: draft.location,
    script: draft.script,
    model: draft.model,
    photographer: draft.photographer,
    onSiteCrew: draft.onSiteCrew,
  }), [draft, video]);

  const prepReady = isPrepComplete(prepVideo);
  const missing = getPrepMissingItems(prepVideo);

  const handleVchannelChange = async (vchannelId: string) => {
    const ch = channels.find(c => c.id === vchannelId);
    if (!ch) return;
    setCodeLoading(true);
    setFormError(null);
    try {
      const { seq, year, videoCode } = await generateNextVideoCode(ch.channelCode, null);
      setDraft(d => ({
        ...d,
        vchannelId: ch.id,
        vchannelCode: ch.channelCode,
        productionYear: year,
        baseSeq: seq,
        deviceType: null,
        projectCategory: inferProjectCategory(ch.channelCode),
        videoCode,
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
    setDraft(d => {
      if (d.vchannelCode && d.baseSeq) {
        return {
          ...d,
          deviceType,
          videoCode: formatVideoCode(d.vchannelCode, d.productionYear, d.baseSeq, deviceType),
        };
      }
      const code = d.videoCode.trim();
      const currentSuffix = code ? parseDeviceSuffixFromVideoCode(code) : null;
      const canRewrite = !!currentSuffix || /-\d{3}$/.test(code);
      if (!canRewrite) return { ...d, deviceType };
      const base = currentSuffix ? code.slice(0, -1) : code;
      const videoCode = deviceType === 'D' || deviceType === 'M' ? `${base}${deviceType}` : base;
      return { ...d, deviceType, videoCode };
    });
  };

  const handleVideoCodeChange = (value: string) => {
    setDraft(d => {
      const next: Draft = { ...d, videoCode: value };
      if (!d.vchannelCode) return next;
      const seq = parseSeqFromVideoCode(value.trim(), d.vchannelCode, d.productionYear);
      if (seq != null) next.baseSeq = seq;
      next.deviceType = parseDeviceSuffixFromVideoCode(value.trim());
      return next;
    });
  };

  const buildPayload = (): Partial<VideoWorkflowMock> => {
    const payload: Partial<VideoWorkflowMock> = {
      vchannelId: draft.vchannelId,
      vchannelCode: draft.vchannelCode,
      videoCode: draft.videoCode.trim(),
      title: draft.title.trim(),
      asanaUrl: draft.asanaUrl.trim(),
      deviceType: draft.deviceType,
      projectCategory: draft.projectCategory,
      productionYear: draft.productionYear,
      shootAt: draft.shootAt || undefined,
      location: draft.location,
      script: draft.script,
      model: draft.model,
      photographer: draft.photographer,
      onSiteCrew: draft.onSiteCrew.filter(m => m.userId),
    };
    if (!isNew && video) {
      Object.assign(payload, statusChangePatch(video, draft.status));
    }
    return payload;
  };

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
    if (!draft.videoCode.trim()) {
      setFormError(isNew ? '請填寫或生成 Video Code' : 'Video Code 不可為空');
      return;
    }
    if (isNew) {
      const scheduleErr = validateNewVideoScheduleRequired(prepVideo);
      if (scheduleErr) {
        setFormError(scheduleErr);
        return;
      }
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
      setEnterError(`進入製作前需填寫：${missing.join('、')}`);
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
      <div className="space-y-4">
        {formError && (
          <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{formError}</p>
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
              <label className="text-[11px] text-muted-foreground block mb-1">Video Code *</label>
              <div className="relative">
                <Input
                  value={codeLoading ? '生成中…' : draft.videoCode}
                  readOnly={codeLoading}
                  onChange={e => handleVideoCodeChange(e.target.value)}
                  placeholder={isNew ? '選擇頻道後自動生成，可再編輯' : '可編輯 Video Code'}
                  className={cn(
                    'h-9 text-[13px] font-mono',
                    codeLoading && 'bg-muted/40',
                  )}
                />
                {codeLoading && (
                  <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
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

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1.5">項目類型</label>
            <OptionPills
              value={draft.projectCategory}
              onChange={projectCategory => setDraft(d => ({ ...d, projectCategory }))}
              options={[
                { value: 'internal', label: '內部項目', icon: Building2, activeClassName: 'border-teal-600 bg-teal-50 text-teal-700' },
                { value: 'client', label: '客戶項目', icon: Users, activeClassName: 'border-orange-500 bg-orange-50 text-orange-700' },
              ]}
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1.5">Device Type（可選，用於 Code 後綴）</label>
            <OptionPills
              value={draft.deviceType ?? 'none'}
              onChange={handleDeviceTypeChange}
              options={[
                { value: 'none', label: '不指定', activeClassName: 'border-slate-500 bg-slate-50 text-slate-700' },
                { value: 'D', label: 'D（Desktop）', activeClassName: 'border-teal-600 bg-teal-50 text-teal-700' },
                { value: 'M', label: 'M（Mobile）', activeClassName: 'border-sky-600 bg-sky-50 text-sky-700' },
              ]}
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1.5">場地</label>
            <LocationPills
              sz={!!draft.location.sz}
              hk={!!draft.location.hk}
              onToggle={key => setDraft(d => ({
                ...d,
                location: { ...d.location, [key]: !d.location[key] },
              }))}
            />
            <label className="text-[11px] text-muted-foreground block mt-2 mb-1">備註</label>
            <Textarea
              value={draft.location.notes ?? ''}
              onChange={e => setDraft(d => ({ ...d, location: { ...d.location, notes: e.target.value } }))}
              placeholder="場地備註"
              rows={3}
              className="text-[13px] min-h-[72px]"
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Asana 連結</label>
            <div className="flex items-center gap-2">
              <Input
                type="url"
                value={draft.asanaUrl}
                onChange={e => setDraft(d => ({ ...d, asanaUrl: e.target.value }))}
                placeholder="https://app.asana.com/..."
                className="h-9 text-[13px]"
              />
              {/^https?:\/\//i.test(draft.asanaUrl.trim()) && (
                <a
                  href={draft.asanaUrl.trim()}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-md border border-border text-teal-700 hover:bg-teal-50"
                  title="開啟 Asana"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>

          {!isNew && video && (
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground block mb-1">狀態</label>
              <Select value={draft.status} onValueChange={value => setDraft(d => ({ ...d, status: value as VideoOutputStatus }))}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(status => (
                    <SelectItem key={status} value={status}>
                      <span className={cn('text-[11px] px-1.5 py-0.5 rounded', VIDEO_OUTPUT_STATUS_COLORS[status])}>
                        {VIDEO_OUTPUT_STATUS_LABELS[status]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {draft.status !== 'published'
                && draft.status !== 'delisted'
                && (
                  deriveScheduleStatus(video) === 'published'
                  || deriveScheduleStatus(video) === 'delisted'
                  || hasAnyMediaPlatformPublished(video.platformPublish)
                  || !!video.publishedDate?.trim()
                ) && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  改為流程中狀態時，將清除實際發佈日期
                  {hasAnyMediaPlatformPublished(video.platformPublish) ? '與平台發佈鏈接' : ''}
                  ，以便狀態生效。選「已下架」則保留發佈資料。
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-[12px] font-bold text-teal-800">準備工作</p>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">
              拍攝日期{isNew ? ' *' : ''}
            </label>
            <Input type="date" value={draft.shootAt}
              onChange={e => setDraft(d => ({ ...d, shootAt: e.target.value }))}
              className="h-8 text-[12px] sm:max-w-[240px]" />
          </div>

          <StaffAssignmentField label="腳本" value={draft.script} staffOptions={staffOptions}
            onChange={script => setDraft(d => ({ ...d, script }))} />
          <ModelAssignmentField value={draft.model} talentOptions={talentOptions}
            onChange={model => setDraft(d => ({ ...d, model }))} />
          <StaffAssignmentField label={isNew ? '攝影師 *' : '攝影師'} value={draft.photographer} staffOptions={staffOptions}
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
            進入製作前需填寫：{missing.join('、')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-border mt-4">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>取消</Button>
        <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving || codeLoading}>
          {saving ? <><Loader2 size={14} className="animate-spin mr-1" />保存中…</> : '保存'}
        </Button>
        {isPrep && onEnterProduction && (isNew || draft.status === 'pending') && (
          <Button size="sm" className="bg-teal-700 hover:bg-teal-800 text-white" disabled={!prepReady || saving || codeLoading}
            onClick={handleEnter}>
            進入製作
          </Button>
        )}
      </div>
    </CrudModal>
  );
}
