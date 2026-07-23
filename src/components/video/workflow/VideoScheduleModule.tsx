import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Loader2,
  MapPin,
  Plus,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { useVchannels } from '@/hooks/useVchannels';
import { fetchStaffDirectoryOptions } from '@/services/videoOutputWorkLogService';
import { supabase } from '@/lib/supabase';
import {
  buildProductionYearOptions,
  getCurrentProductionYear,
} from '@/lib/videoOutputUtils';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  formatLocation,
  getPrepMissingItems,
  isPrepComplete,
  validateNewVideoScheduleRequired,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
} from '@/lib/videoWorkflowUtils';
import { ScheduleEditModal } from '@/components/video/workflow/ScheduleEditModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type TalentOption = { id: string; displayName: string };

export function VideoScheduleModule() {
  const { loading: workflowLoading, getPreReviewVideos, getById, addVideo, updateVideo, deleteVideo, advanceToProduction } = useVideoWorkflow();
  const { channels } = useVchannels();

  const [vchannelFilter, setVchannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState(getCurrentProductionYear);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<{ staffId: string; displayName: string }[]>([]);
  const [talentOptions, setTalentOptions] = useState<TalentOption[]>([]);
  const [loading, setLoading] = useState(true);

  const preReviewVideos = getPreReviewVideos();

  const yearOptions = useMemo(
    () => buildProductionYearOptions(preReviewVideos.map(v => v.productionYear)),
    [preReviewVideos],
  );

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filterChannel = vchannelFilter !== 'all' ? channels.find(c => c.id === vchannelFilter) : null;
    return preReviewVideos
      .filter(v => {
        if (v.productionYear !== yearFilter) return false;
        if (filterChannel) {
          const matchId = v.vchannelId === filterChannel.id;
          const matchCode = v.vchannelCode === filterChannel.channelCode;
          if (!matchId && !matchCode) return false;
        }
        if (!q) return true;
        return v.title.toLowerCase().includes(q) || v.videoCode.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.createdAt ?? b.videoCode).localeCompare(a.createdAt ?? a.videoCode));
  }, [preReviewVideos, vchannelFilter, searchQuery, channels, yearFilter]);

  const calendarVideos = useMemo(
    () => preReviewVideos.filter(v => v.shootAt && v.productionYear === yearFilter),
    [preReviewVideos, yearFilter],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [staffList, talentRes] = await Promise.all([
          fetchStaffDirectoryOptions(),
          supabase.from('confirmed_artist').select('id, name_zh, name_en').order('name_zh'),
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
      cells.push({ date, items: calendarVideos.filter(v => v.shootAt === date) });
    }
    return cells;
  }, [currentMonth, calendarVideos]);

  const monthLabel = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;
  const editingVideo = editingId ? getById(editingId) ?? null : null;

  const openNew = () => {
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    setModalOpen(true);
  };

  const handleSave = async (
    payload: Partial<VideoWorkflowMock>,
    isNew: boolean,
  ): Promise<{ error: string | null; id?: string }> => {
    if (isNew) {
      if (!payload.vchannelCode || !payload.videoCode || !payload.title?.trim()) {
        return { error: '請填寫完整基本資訊' };
      }
      const scheduleErr = validateNewVideoScheduleRequired(payload);
      if (scheduleErr) {
        return { error: scheduleErr };
      }
      try {
        const id = await addVideo({
          vchannelId: payload.vchannelId,
          vchannelCode: payload.vchannelCode,
          videoCode: payload.videoCode,
          title: payload.title.trim(),
          deviceType: payload.deviceType ?? null,
          productionYear: payload.productionYear,
          shootAt: payload.shootAt,
          location: payload.location ?? { sz: false, hk: false },
          copywriting: payload.copywriting,
          script: payload.script,
          model: payload.model,
          photographer: payload.photographer,
          onSiteCrew: payload.onSiteCrew,
        });
        setEditingId(id);
        return { error: null, id };
      } catch (e) {
        return { error: e instanceof Error ? e.message : '建立影片失敗' };
      }
    }
    if (!editingId) return { error: '找不到影片' };
    const err = await updateVideo(editingId, payload);
    if (err) return { error: err };
    return { error: null, id: editingId };
  };

  const handleEnterProduction = async (videoId: string): Promise<string | null> => {
    return advanceToProduction(videoId);
  };

  const handleDelete = async (videoId: string): Promise<string | null> => {
    return deleteVideo(videoId);
  };

  const weekRowCount = Math.max(1, Math.ceil(calendarDays.length / 7));

  if (loading || workflowLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 size={18} className="animate-spin" /> 載入中…
      </div>
    );
  }

  return (
    // 頂欄 48px + AppLayout p-6（上下各 24px）
    <div className="flex flex-col h-[calc(100vh-48px-3rem)] overflow-hidden gap-3">
      <div className="shrink-0 space-y-3">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">拍攝排期</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            日曆與準備工作清單：文案、腳本、Model、場地、攝影師與到場人員。
          </p>
        </div>

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
          <div className="relative flex-1 min-w-[160px] max-w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋主題或 Video Code…"
              className="h-9 pl-9 text-[12px]"
            />
          </div>
          <Select value={String(yearFilter)} onValueChange={value => setYearFilter(Number(value))}>
            <SelectTrigger className="h-9 w-[100px] text-[12px] shrink-0">
              <SelectValue placeholder="年份" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(year => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" className="h-9 bg-teal-600 hover:bg-teal-700 text-white text-[12px] gap-1.5 shrink-0" onClick={openNew}>
            <Plus size={14} /> 新建影片
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-3">
        {/* 左側窄列表：唯一可滾動區域 */}
        <div className="w-full xl:w-[320px] xl:shrink-0 flex flex-col min-h-0 max-h-[40vh] xl:max-h-none">
          <p className="text-[12px] text-muted-foreground shrink-0 mb-2">
            未審核前 {filteredVideos.length} 部（準備中 + 製作中）
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
            {filteredVideos.length === 0 ? (
              <div className="text-center py-10 text-[13px] text-muted-foreground bg-white rounded-md border">
                沒有符合條件的影片
              </div>
            ) : (
              filteredVideos.map(video => (
                <div
                  key={video.id}
                  className={cn(
                    'bg-white rounded-md border px-2.5 py-2 transition-all',
                    highlightId === video.id ? 'border-teal-500 shadow-card' : 'border-[rgba(13,26,45,0.08)] hover:shadow-card',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                        <p className="text-[10px] font-mono text-muted-foreground">{video.videoCode}</p>
                        <span className={cn('text-[9px] px-1 py-0.5 rounded', VIDEO_WORKFLOW_STAGE_COLORS[video.stage])}>
                          {VIDEO_WORKFLOW_STAGE_LABELS[video.stage]}
                        </span>
                      </div>
                      <p className="text-[13px] font-bold leading-snug line-clamp-2">{video.title}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                        <span>{video.vchannelCode}</span>
                        {video.shootAt ? (
                          <span className="inline-flex items-center gap-0.5"><Calendar size={9} />{video.shootAt}</span>
                        ) : (
                          <span className="text-amber-600">待排期</span>
                        )}
                        <span className="inline-flex items-center gap-0.5"><MapPin size={9} />{formatLocation(video.location)}</span>
                      </div>
                      {video.stage === 'prep' && (
                        <p className="text-[10px] mt-1 text-muted-foreground line-clamp-2">
                          {isPrepComplete(video)
                            ? '可進製作'
                            : `進入製作前需填寫：${getPrepMissingItems(video).join('、')}`}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[10px] gap-1 shrink-0"
                      onClick={() => openEdit(video.id)}
                    >
                      <Edit2 size={11} /> 編輯
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右側日曆：固定、撐滿剩餘寬高 */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <button type="button" onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-1 rounded hover:bg-muted">
              <ChevronLeft size={16} />
            </button>
            <span className="text-[14px] font-bold">{monthLabel}</span>
            <button type="button" onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-1 rounded hover:bg-muted">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground mb-1 shrink-0">
            {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div
            className="flex-1 min-h-0 grid grid-cols-7 gap-1"
            style={{ gridTemplateRows: `repeat(${weekRowCount}, minmax(0, 1fr))` }}
          >
            {calendarDays.map((cell, idx) => (
              <div
                key={idx}
                className={cn(
                  'min-h-0 h-full border border-border/40 rounded p-1 text-left overflow-hidden flex flex-col',
                  cell.date ? 'bg-white' : 'bg-muted/20',
                )}
              >
                {cell.date && (
                  <>
                    <span className="text-[10px] text-muted-foreground shrink-0">{Number(cell.date.slice(8))}</span>
                    <div className="space-y-0.5 mt-0.5 min-h-0 overflow-y-auto">
                      {cell.items.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setHighlightId(item.id)}
                          className={cn(
                            'w-full text-left text-[9px] px-1 py-0.5 rounded truncate',
                            highlightId === item.id ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100',
                          )}
                          title={item.title}
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
      </div>

      <ScheduleEditModal
        open={modalOpen}
        video={editingVideo}
        channels={channels}
        staffOptions={staffOptions}
        talentOptions={talentOptions}
        onClose={() => { setModalOpen(false); setEditingId(null); }}
        onSave={handleSave}
        onEnterProduction={editingVideo?.stage === 'prep' || !editingVideo ? handleEnterProduction : undefined}
        onDelete={editingVideo ? handleDelete : undefined}
      />
    </div>
  );
}
