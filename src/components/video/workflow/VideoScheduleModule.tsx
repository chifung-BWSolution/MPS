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
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import {
  formatLocation,
  getPrepMissingItems,
  isPrepComplete,
  VIDEO_WORKFLOW_STAGE_COLORS,
  VIDEO_WORKFLOW_STAGE_LABELS,
} from '@/lib/videoWorkflowUtils';
import { ScheduleEditModal } from '@/components/video/workflow/ScheduleEditModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type TalentOption = { id: string; displayName: string };

export function VideoScheduleModule() {
  const { loading: workflowLoading, getPreReviewVideos, getById, addVideo, updateVideo, advanceToProduction } = useVideoWorkflow();
  const { channels } = useVchannels();

  const [vchannelFilter, setVchannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<{ staffId: string; displayName: string }[]>([]);
  const [talentOptions, setTalentOptions] = useState<TalentOption[]>([]);
  const [loading, setLoading] = useState(true);

  const preReviewVideos = getPreReviewVideos();

  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filterChannel = vchannelFilter !== 'all' ? channels.find(c => c.id === vchannelFilter) : null;
    return preReviewVideos
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
  }, [preReviewVideos, vchannelFilter, searchQuery, channels]);

  const calendarVideos = useMemo(
    () => preReviewVideos.filter(v => v.shootAt),
    [preReviewVideos],
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

  if (loading || workflowLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 size={18} className="animate-spin" /> 載入中…
      </div>
    );
  }

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
        <Button type="button" className="h-9 bg-teal-600 hover:bg-teal-700 text-white text-[12px] gap-1.5 shrink-0" onClick={openNew}>
          <Plus size={14} /> 新建影片
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-2 min-h-[320px]">
          <p className="text-[12px] text-muted-foreground">
            未審核前 {filteredVideos.length} 部（準備中 + 製作中）
          </p>
          {filteredVideos.length === 0 ? (
            <div className="text-center py-12 text-[13px] text-muted-foreground bg-white rounded-md border">
              沒有符合條件的影片
            </div>
          ) : (
            filteredVideos.map(video => (
              <div
                key={video.id}
                className={cn(
                  'bg-white rounded-md border p-3 transition-all',
                  highlightId === video.id ? 'border-teal-500 shadow-card' : 'border-[rgba(13,26,45,0.08)] hover:shadow-card',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <p className="text-[11px] font-mono text-muted-foreground">{video.videoCode}</p>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded', VIDEO_WORKFLOW_STAGE_COLORS[video.stage])}>
                        {VIDEO_WORKFLOW_STAGE_LABELS[video.stage]}
                      </span>
                    </div>
                    <p className="text-[14px] font-bold truncate">{video.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                      <span>{video.vchannelCode}</span>
                      {video.shootAt ? (
                        <span className="flex items-center gap-1"><Calendar size={10} />{video.shootAt}</span>
                      ) : (
                        <span className="text-amber-600">待排期</span>
                      )}
                      <span className="flex items-center gap-1"><MapPin size={10} />{formatLocation(video.location)}</span>
                    </div>
                    {video.stage === 'prep' && (
                      <p className="text-[11px] mt-1 text-muted-foreground">
                        {isPrepComplete(video) ? '準備已完成，可進製作' : `待完成 ${getPrepMissingItems(video).length} 項`}
                      </p>
                    )}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-[11px] gap-1 shrink-0"
                    onClick={() => openEdit(video.id)}>
                    <Edit2 size={12} /> 編輯
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 h-fit xl:sticky xl:top-20">
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
                  'min-h-[64px] border border-border/40 rounded p-1 text-left',
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
                          onClick={() => setHighlightId(item.id)}
                          className={cn(
                            'w-full text-left text-[9px] px-1 py-0.5 rounded truncate',
                            highlightId === item.id ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100',
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
      />
    </div>
  );
}
