import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { fetchStaffDirectoryOptions } from '@/services/videoOutputWorkLogService';
import { supabase } from '@/lib/supabase';
import type { ModelAssignment, StaffAssignment, VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  formatAssignmentWhen,
  formatLocation,
  getPrepMissingItems,
  isPrepComplete,
  VIDEO_WORKFLOW_STAGE_COLORS,
} from '@/lib/videoWorkflowUtils';
import { StaffAssignmentField } from '@/components/video/workflow/StaffAssignmentField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ViewMode = 'calendar' | 'list';
type TalentOption = { id: string; displayName: string };

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

function PrepDetailPanel({
  video,
  staffOptions,
  talentOptions,
  onUpdate,
  onEnterProduction,
}: {
  video: VideoWorkflowMock;
  staffOptions: { staffId: string; displayName: string }[];
  talentOptions: TalentOption[];
  onUpdate: (patch: Partial<VideoWorkflowMock>) => void;
  onEnterProduction: () => void;
}) {
  const [enterError, setEnterError] = useState<string | null>(null);
  const prepReady = isPrepComplete(video);
  const missing = getPrepMissingItems(video);

  const handleEnter = () => {
    setEnterError(null);
    if (!prepReady) {
      setEnterError(`尚有未完成的準備項：${missing.join('、')}`);
      return;
    }
    onEnterProduction();
  };

  const updateCrew = (index: number, next?: StaffAssignment) => {
    const crew = [...(video.onSiteCrew ?? [])];
    if (next) crew[index] = next;
    else crew.splice(index, 1);
    onUpdate({ onSiteCrew: crew });
  };

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">{video.videoCode} · {video.vchannelCode}</p>
          <h3 className="text-[16px] font-bold mt-0.5">{video.title}</h3>
        </div>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded shrink-0', VIDEO_WORKFLOW_STAGE_COLORS.prep)}>
          準備中
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">拍攝日期</label>
          <Input
            type="date"
            value={video.shootAt ?? ''}
            onChange={e => onUpdate({ shootAt: e.target.value })}
            className="h-8 text-[12px]"
          />
        </div>
        <div className="border border-border/60 rounded-md p-3 bg-slate-50/50">
          <p className="text-[12px] font-semibold text-slate-700 mb-2">場地</p>
          <div className="flex items-center gap-4 mb-2">
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={!!video.location?.sz}
                onChange={e => onUpdate({ location: { ...video.location, sz: e.target.checked } })}
              />
              深圳
            </label>
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={!!video.location?.hk}
                onChange={e => onUpdate({ location: { ...video.location, hk: e.target.checked } })}
              />
              香港
            </label>
          </div>
          <Input
            value={video.location?.notes ?? ''}
            onChange={e => onUpdate({ location: { ...video.location, notes: e.target.value } })}
            placeholder="備註"
            className="h-8 text-[12px]"
          />
        </div>
      </div>

      <StaffAssignmentField
        label="文案"
        value={video.copywriting}
        staffOptions={staffOptions}
        onChange={copywriting => onUpdate({ copywriting })}
      />
      <StaffAssignmentField
        label="腳本"
        value={video.script}
        staffOptions={staffOptions}
        onChange={script => onUpdate({ script })}
      />
      <ModelAssignmentField
        value={video.model}
        talentOptions={talentOptions}
        onChange={model => onUpdate({ model })}
      />
      <StaffAssignmentField
        label="攝影師"
        value={video.photographer}
        staffOptions={staffOptions}
        onChange={photographer => onUpdate({ photographer })}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold text-slate-700">到場人員</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={() =>
              onUpdate({
                onSiteCrew: [...(video.onSiteCrew ?? []), { userId: '', displayName: '', scheduledAt: '' }],
              })
            }
          >
            <Plus size={11} /> 新增
          </Button>
        </div>
        {(video.onSiteCrew ?? []).length === 0 ? (
          <p className="text-[12px] text-muted-foreground bg-muted/30 rounded px-3 py-2">尚未添加到場人員</p>
        ) : (
          (video.onSiteCrew ?? []).map((member, index) => (
            <div key={index} className="relative">
              <StaffAssignmentField
                label={`到場人員 #${index + 1}`}
                value={member.userId ? member : undefined}
                staffOptions={staffOptions}
                onChange={next => updateCrew(index, next)}
              />
              <button
                type="button"
                onClick={() => updateCrew(index)}
                className="absolute top-2 right-2 text-rose-500 hover:text-rose-700 p-1"
                title="移除"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {enterError && (
        <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{enterError}</p>
      )}
      {!prepReady && !enterError && (
        <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          待完成：{missing.join('、')}
        </p>
      )}

      <Button
        type="button"
        className="w-full bg-teal-600 hover:bg-teal-700 text-white"
        disabled={!prepReady}
        onClick={handleEnter}
      >
        進入製作
      </Button>
    </div>
  );
}

export function VideoScheduleModule() {
  const { getByStage, getById, updateVideo, advanceToProduction } = useVideoWorkflow();
  const prepVideos = getByStage('prep');
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(() => prepVideos[0]?.id ?? null);
  const [staffOptions, setStaffOptions] = useState<{ staffId: string; displayName: string }[]>([]);
  const [talentOptions, setTalentOptions] = useState<TalentOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedId && prepVideos[0]) setSelectedId(prepVideos[0].id);
    if (selectedId && !prepVideos.find(v => v.id === selectedId)) {
      setSelectedId(prepVideos[0]?.id ?? null);
    }
  }, [prepVideos, selectedId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [staffList, talentRes] = await Promise.all([
          fetchStaffDirectoryOptions(),
          supabase
            .from('confirmed_artist')
            .select('id, name_zh, name_en')
            .order('name_zh'),
        ]);
        if (cancelled) return;
        setStaffOptions(staffList);
        setTalentOptions(
          (talentRes.data ?? []).map(row => ({
            id: row.id as string,
            displayName: (row.name_zh as string) || (row.name_en as string) || row.id,
          })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedVideo = selectedId ? getById(selectedId) : undefined;

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { date: string | null; items: VideoWorkflowMock[] }[] = [];
    for (let i = 0; i < startPad; i++) cells.push({ date: null, items: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        date,
        items: prepVideos.filter(v => v.shootAt === date),
      });
    }
    return cells;
  }, [currentMonth, prepVideos]);

  const monthLabel = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 size={18} className="animate-spin" /> 載入中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
              viewMode === 'calendar' ? 'bg-white shadow-sm text-teal-800' : 'text-muted-foreground',
            )}
          >
            <Calendar size={12} /> 日曆
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
              viewMode === 'list' ? 'bg-white shadow-sm text-teal-800' : 'text-muted-foreground',
            )}
          >
            <List size={12} /> 準備清單
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground">{prepVideos.length} 部待準備</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-3">
          {viewMode === 'calendar' ? (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-1 rounded hover:bg-muted">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[14px] font-bold">{monthLabel}</span>
                <button type="button" onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-1 rounded hover:bg-muted">
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground mb-1">
                {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((cell, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'min-h-[72px] border border-border/40 rounded p-1 text-left',
                      cell.date ? 'bg-white' : 'bg-muted/20',
                    )}
                  >
                    {cell.date && (
                      <>
                        <span className="text-[10px] text-muted-foreground">{Number(cell.date.slice(8))}</span>
                        <div className="space-y-0.5 mt-0.5">
                          {cell.items.map(item => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSelectedId(item.id)}
                              className={cn(
                                'w-full text-left text-[9px] px-1 py-0.5 rounded truncate',
                                selectedId === item.id ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100',
                              )}
                            >
                              {item.title}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {prepVideos.length === 0 ? (
                <div className="text-center py-12 text-[13px] text-muted-foreground bg-white rounded-md border">目前沒有待準備的影片</div>
              ) : (
                prepVideos.map(video => (
                  <button
                    key={video.id}
                    type="button"
                    onClick={() => setSelectedId(video.id)}
                    className={cn(
                      'w-full text-left bg-white rounded-md border p-3 transition-all',
                      selectedId === video.id ? 'border-teal-500 shadow-card' : 'border-[rgba(13,26,45,0.08)] hover:shadow-card',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] text-muted-foreground">{video.videoCode}</p>
                        <p className="text-[14px] font-bold">{video.title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                          {video.shootAt && (
                            <span className="flex items-center gap-1"><Calendar size={10} />{video.shootAt}</span>
                          )}
                          <span className="flex items-center gap-1"><MapPin size={10} />{formatLocation(video.location)}</span>
                        </div>
                      </div>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded shrink-0', isPrepComplete(video) ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700')}>
                        {isPrepComplete(video) ? '可進製作' : `${getPrepMissingItems(video).length} 項待完成`}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div>
          {selectedVideo ? (
            <PrepDetailPanel
              video={selectedVideo}
              staffOptions={staffOptions}
              talentOptions={talentOptions}
              onUpdate={patch => updateVideo(selectedVideo.id, patch)}
              onEnterProduction={() => {
                const err = advanceToProduction(selectedVideo.id);
                if (err) alert(err);
              }}
            />
          ) : (
            <div className="text-center py-16 text-[13px] text-muted-foreground bg-white rounded-md border">
              選擇左側影片以編輯準備工作
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
