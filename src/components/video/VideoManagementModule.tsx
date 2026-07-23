import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Pencil, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoOutput } from '@/hooks/useVideoOutput';
import { useVchannels } from '@/hooks/useVchannels';
import type {
  PlatformPublishKey,
  VideoOutput,
  VideoOutputInput,
  VideoOutputStatus,
  VideoProjectCategory,
} from '@/types/videoOutput';
import {
  PLATFORM_PUBLISH_LABELS,
  VIDEO_OUTPUT_STATUS_COLORS,
  VIDEO_OUTPUT_STATUS_LABELS,
  buildProductionYearOptions,
  deriveVideoOutputStatus,
  filterVideoOutputs,
  formatPlatformPublishCopyText,
  formatShootLocation,
  getCurrentProductionYear,
  getPlatformUrl,
  getPublishedPlatformKeys,
  getPublishedPlatformKeysWithUrl,
  isHttpUrl,
  sortVideoOutputsByPublishDateDesc,
} from '@/lib/videoOutputUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlatformPublishModal } from '@/components/video/PlatformPublishModal';
import { CoordinationRecordModal } from '@/components/video/CoordinationRecordModal';
import { fetchWorkLogTotalsByVideoIds } from '@/services/videoOutputWorkLogService';
import { WorkflowStatusSummaryBar } from '@/components/video/workflow/WorkflowStatusSummaryBar';
import { CopyStoragePathButton } from '@/components/video/workflow/workflowListLayout';
import { VideoCoordinationStatusView } from '@/components/video/VideoCoordinationStatusView';

type CoordinationView = 'status' | 'list';

const TABLE_COL_COUNT = 14;
/** Columns before 拍攝時間: 選擇 / 狀態 / Vchannel / Video Code / 主題 */
const PLATFORM_ROW_LEAD_COLS = 5;

const PLATFORM_TAG_COLORS: Record<PlatformPublishKey, string> = {
  youtube: 'bg-red-50 text-red-700 border-red-200',
  instagram: 'bg-pink-50 text-pink-700 border-pink-200',
  facebook: 'bg-blue-50 text-blue-700 border-blue-200',
  threads: 'bg-slate-100 text-slate-700 border-slate-300',
  linkedin: 'bg-sky-50 text-sky-700 border-sky-200',
  xiaohongshu: 'bg-rose-50 text-rose-700 border-rose-200',
  douyin: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  wechat_channels: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  wechat_official: 'bg-green-50 text-green-700 border-green-200',
  zh_cn: 'bg-amber-50 text-amber-800 border-amber-200',
  zh_tw: 'bg-orange-50 text-orange-700 border-orange-200',
};

const STATUS_SUMMARY_KEYS: VideoOutputStatus[] = [
  'pending',
  'in_production',
  'pending_review',
  'pending_publish',
  'published',
];

const COORDINATION_STATUS_ITEMS = STATUS_SUMMARY_KEYS.map(status => ({
  id: status,
  label: VIDEO_OUTPUT_STATUS_LABELS[status],
  activeClassName: VIDEO_OUTPUT_STATUS_COLORS[status],
}));

function countVideosByStatus(videos: VideoOutput[]): Record<VideoOutputStatus, number> {
  const counts: Record<VideoOutputStatus, number> = {
    pending: 0,
    in_production: 0,
    pending_review: 0,
    pending_publish: 0,
    published: 0,
  };
  for (const video of videos) {
    counts[deriveVideoOutputStatus(video)]++;
  }
  return counts;
}

function CheckCell({ value }: { value?: boolean | null }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-teal-100 text-teal-700">
        <Check size={12} strokeWidth={3} />
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

const COPYWRITING_LABELS = [
  { key: 'sc', label: '簡體', done: (v: { copySc?: boolean }) => v.copySc },
  { key: 'tc', label: '繁體', done: (v: { copyTc?: boolean }) => v.copyTc },
  { key: 'en', label: '英文', done: (v: { copyEn?: boolean }) => v.copyEn },
] as const;

function CopywritingCell({ sc, tc, en }: { sc?: boolean; tc?: boolean; en?: boolean }) {
  const video = { copySc: sc, copyTc: tc, copyEn: en };
  const labels = COPYWRITING_LABELS.filter(item => item.done(video)).map(item => item.label);

  if (labels.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="text-[12px] text-teal-700 font-medium whitespace-nowrap">
      {labels.join('|')}
    </span>
  );
}

function StatusCell({ status }: { status: VideoOutputStatus }) {
  return (
    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap', VIDEO_OUTPUT_STATUS_COLORS[status])}>
      {VIDEO_OUTPUT_STATUS_LABELS[status]}
    </span>
  );
}

function WorkHoursCell({ hours }: { hours?: number }) {
  if (hours == null || hours <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="font-medium text-teal-700 whitespace-nowrap">{hours.toFixed(1)}h</span>;
}

function PlatformPublishRow({
  platformPublish,
  onPublish,
}: {
  platformPublish: VideoOutput['platformPublish'];
  onPublish: () => void;
}) {
  const [copyDone, setCopyDone] = useState(false);
  const publishedKeys = getPublishedPlatformKeys(platformPublish);
  const copyableKeys = getPublishedPlatformKeysWithUrl(platformPublish);
  const canCopy = copyableKeys.length > 0;

  const handleCopy = async () => {
    const text = formatPlatformPublishCopyText(platformPublish);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
        {publishedKeys.length === 0 ? (
          <span className="text-[12px] text-muted-foreground">尚未發佈任何平台</span>
        ) : (
          publishedKeys.map(key => {
            const url = getPlatformUrl(platformPublish, key);
            const label = PLATFORM_PUBLISH_LABELS[key];
            const openable = !!url && isHttpUrl(url);
            const tagClass = cn(
              'inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium transition-colors',
              PLATFORM_TAG_COLORS[key],
              openable && 'hover:opacity-80 cursor-pointer',
            );

            if (openable) {
              return (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={tagClass}
                  title={`打開 ${label}`}
                >
                  {label}
                </a>
              );
            }

            return (
              <span key={key} className={tagClass} title={url || '尚未填寫連結'}>
                {label}
              </span>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!canCopy}
          className="flex items-center gap-1 px-2 py-0.5 border border-border/60 text-muted-foreground rounded text-[12px] font-medium hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Copy size={12} /> {copyDone ? '已複製' : '複製'}
        </button>
        <button
          type="button"
          onClick={onPublish}
          className="flex items-center gap-1 px-2 py-0.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors"
        >
          <Plus size={12} /> 發佈
        </button>
      </div>
    </div>
  );
}

export function VideoManagementModule() {
  const { videos, loading, error, updateVideo } = useVideoOutput();
  const { channels } = useVchannels();

  const [view, setView] = useState<CoordinationView>('status');
  const [vchannelFilter, setVchannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState(getCurrentProductionYear);
  const [categoryFilter, setCategoryFilter] = useState<'all' | VideoProjectCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | VideoOutputStatus>('all');
  const [publishingVideo, setPublishingVideo] = useState<VideoOutput | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [workLogTotals, setWorkLogTotals] = useState<Map<string, number>>(new Map());

  const refreshWorkLogTotals = useCallback(async (videoIds: string[]) => {
    if (videoIds.length === 0) {
      setWorkLogTotals(new Map());
      return;
    }
    try {
      const totals = await fetchWorkLogTotalsByVideoIds(videoIds);
      setWorkLogTotals(totals);
    } catch {
      // keep existing totals on refresh failure
    }
  }, []);

  useEffect(() => {
    if (videos.length === 0) {
      setWorkLogTotals(new Map());
      return;
    }
    void refreshWorkLogTotals(videos.map(v => v.id));
  }, [videos, refreshWorkLogTotals]);

  const yearOptions = useMemo(
    () => buildProductionYearOptions(videos.map(v => v.productionYear)),
    [videos],
  );

  const contextVideos = useMemo(
    () =>
      filterVideoOutputs(videos, {
        vchannelId: vchannelFilter,
        searchQuery,
        category: categoryFilter,
        status: 'all',
        productionYear: yearFilter,
      }),
    [videos, vchannelFilter, searchQuery, categoryFilter, yearFilter],
  );

  const filteredVideos = useMemo(() => {
    const rows =
      statusFilter === 'all'
        ? contextVideos
        : contextVideos.filter(v => deriveVideoOutputStatus(v) === statusFilter);
    return sortVideoOutputsByPublishDateDesc(rows);
  }, [contextVideos, statusFilter]);

  const statusCounts = useMemo(() => countVideosByStatus(contextVideos), [contextVideos]);

  const handleStatusSummaryClick = (status: VideoOutputStatus) => {
    setStatusFilter(prev => (prev === status ? 'all' : status));
  };

  const handleSelect = useCallback((videoId: string) => {
    setSelectedId(prev => (prev === videoId ? null : videoId));
    setEditOpen(false);
  }, []);

  const selectedVideo = useMemo(
    () => (selectedId ? videos.find(v => v.id === selectedId) ?? null : null),
    [videos, selectedId],
  );

  // 篩選變更後若所選影片不在可見列表中，清除選擇
  useEffect(() => {
    if (!selectedId) return;
    const visible = view === 'status' ? contextVideos : filteredVideos;
    if (!visible.some(v => v.id === selectedId)) {
      setSelectedId(null);
      setEditOpen(false);
    }
  }, [selectedId, view, contextVideos, filteredVideos]);

  const handleSavePublish = async (input: Partial<VideoOutputInput>) => {
    if (!publishingVideo) return new Error('未選擇影片');
    const err = await updateVideo(publishingVideo.id, input);
    if (err) return err instanceof Error ? err : new Error('更新發佈失敗');
    return null;
  };

  const handleClosePublishModal = () => {
    setPublishingVideo(null);
    void refreshWorkLogTotals(videos.map(v => v.id));
  };

  const handleSaveRecord = async (input: Partial<VideoOutputInput>) => {
    if (!selectedVideo) return new Error('未選擇影片');
    const err = await updateVideo(selectedVideo.id, input);
    if (err) return err instanceof Error ? err : new Error('更新失敗');
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-[13px]">載入影片資料...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
        載入失敗：{error}
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-4 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <h1 className="text-[32px] font-bold tracking-tight">影片統籌</h1>
            <div
              className="flex items-center gap-2 text-[14px]"
              role="tablist"
              aria-label="視圖切換"
            >
              {(
                [
                  { id: 'status' as const, label: '狀態視圖' },
                  { id: 'list' as const, label: '列表視圖' },
                ] as const
              ).map((tab, index) => (
                <span key={tab.id} className="contents">
                  {index > 0 && <span className="text-muted-foreground/50 select-none">|</span>}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === tab.id}
                    onClick={() => setView(tab.id)}
                    className={cn(
                      'pb-0.5 font-medium transition-colors',
                      view === tab.id
                        ? 'text-teal-700 border-b-2 border-teal-600'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <p className="text-[14px] text-muted-foreground mt-1">
            全局影片產出時間軸，查看所有狀態的影片記錄。
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Select value={String(yearFilter)} onValueChange={value => setYearFilter(Number(value))}>
            <SelectTrigger className="w-[100px] h-9 text-[12px]">
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

          <Select value={vchannelFilter} onValueChange={setVchannelFilter}>
            <SelectTrigger className="w-[220px] h-9 text-[12px]">
              <SelectValue placeholder="Vchannel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部 Vchannel</SelectItem>
              {channels.map(ch => (
                <SelectItem key={ch.id} value={ch.id}>
                  {ch.channelCode} — {ch.publicName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px] max-w-[280px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋主題或 Video Code..."
              className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {(['all', 'internal', 'client'] as const).map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
                  categoryFilter === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {cat === 'all' ? '全部' : cat === 'internal' ? '內部項目' : '客戶項目'}
              </button>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            className="ml-auto h-9 px-3 bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
            disabled={!selectedVideo}
            onClick={() => setEditOpen(true)}
          >
            <Pencil size={14} className="mr-1.5" />
            編輯
          </Button>
        </div>
      </div>

      {view === 'list' && (
        <div className="mb-4">
          <WorkflowStatusSummaryBar
            filteredCount={filteredVideos.length}
            contextCount={contextVideos.length}
            activeFilter={statusFilter}
            items={COORDINATION_STATUS_ITEMS}
            counts={statusCounts}
            onSelectAll={() => setStatusFilter('all')}
            onSelectItem={id => handleStatusSummaryClick(id as VideoOutputStatus)}
            ariaLabel="狀態篩選"
            tintInactive
          />
        </div>
      )}

      {view === 'status' ? (
        contextVideos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-[13px]">沒有符合條件的影片</div>
        ) : (
          <VideoCoordinationStatusView
            videos={contextVideos}
            workLogTotals={workLogTotals}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        )
      ) : (
        <>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-x-auto">
            <table className="w-full text-[14px] min-w-[1180px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-center px-2 py-2.5 font-medium text-muted-foreground w-10" />
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">狀態</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Vchannel</th>
                  <th className="text-left px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap w-[1%]">Video Code</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground min-w-[180px]">主題</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">拍攝時間</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">計劃發佈時間</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">實際發佈時間</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">拍攝地址</th>
                  <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">文案</th>
                  <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">原片拍攝</th>
                  <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">是否剪輯</th>
                  <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Demo完成</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap min-w-[76px]">總工時</th>
                </tr>
              </thead>
              {filteredVideos.map(video => {
                const status = deriveVideoOutputStatus(video);
                const isPublished = status === 'published';
                const isSelected = selectedId === video.id;
                const totalHours = workLogTotals.get(video.id);
                const cellPad = isPublished ? 'pt-2.5 pb-1' : 'py-2.5';

                return (
                  <tbody
                    key={video.id}
                    className={cn(
                      'border-t border-border/50 group cursor-pointer',
                      isSelected && 'bg-teal-50/50',
                    )}
                    onClick={() => handleSelect(video.id)}
                  >
                    <tr className={cn('transition-colors', !isSelected && 'group-hover:bg-muted/10')}>
                      <td className={cn('px-2 align-middle text-center', cellPad)}>
                        <span
                          className={cn(
                            'inline-flex items-center justify-center w-4 h-4 rounded border',
                            isSelected
                              ? 'bg-teal-600 border-teal-600 text-white'
                              : 'bg-white border-border',
                          )}
                        >
                          {isSelected && <Check size={10} strokeWidth={3} />}
                        </span>
                      </td>
                      <td className={cn('px-3 align-middle', cellPad)}>
                        <StatusCell status={status} />
                      </td>
                      <td className={cn('px-3 align-middle', cellPad)}>
                        <span className="font-mono text-[13px] font-bold" title={video.channelPublicName}>
                          {video.channelCode}
                        </span>
                      </td>
                      <td className={cn('px-2 align-middle font-mono text-[11px] w-[1%] max-w-[96px]', cellPad)}>
                        <span className="block truncate" title={video.videoCode}>{video.videoCode}</span>
                      </td>
                      <td className={cn('px-3 align-middle max-w-[240px]', cellPad)}>
                        <span className="line-clamp-2 font-bold" title={video.title}>{video.title}</span>
                      </td>
                      <td className={cn('px-3 align-middle text-[13px] whitespace-nowrap', cellPad)}>
                        {video.shootAt ?? '—'}
                      </td>
                      <td className={cn('px-3 align-middle text-[13px] whitespace-nowrap text-muted-foreground', cellPad)}>
                        {video.plannedPublishDate?.trim() || '—'}
                      </td>
                      <td className={cn('px-3 align-middle text-[13px] whitespace-nowrap', cellPad)}>
                        {video.publishedDate?.trim() || '—'}
                      </td>
                      <td className={cn('px-3 align-middle whitespace-nowrap text-[13px]', cellPad)}>
                        {formatShootLocation(video.shootHk, video.shootSz)}
                      </td>
                      <td className={cn('px-2 align-middle text-center', cellPad)}>
                        <CopywritingCell sc={video.copySc} tc={video.copyTc} en={video.copyEn} />
                      </td>
                      <td className={cn('px-2 align-middle text-center', cellPad)}>
                        <CheckCell value={video.rawFootageDone} />
                      </td>
                      <td className={cn('px-2 align-middle text-center', cellPad)}>
                        <CheckCell value={video.needsEditing} />
                      </td>
                      <td className={cn('px-2 align-middle text-center', cellPad)}>
                        {video.storagePath?.trim() ? (
                          <CopyStoragePathButton path={video.storagePath} />
                        ) : (
                          <CheckCell value={video.demoDone} />
                        )}
                      </td>
                      <td className={cn('px-4 align-middle text-right min-w-[76px]', cellPad)}>
                        <WorkHoursCell hours={totalHours} />
                      </td>
                    </tr>
                    {isPublished && (
                      <tr className={cn('transition-colors', !isSelected && 'group-hover:bg-muted/10')}>
                        {Array.from({ length: PLATFORM_ROW_LEAD_COLS }).map((_, i) => (
                          <td key={i} className="px-3 pt-0 pb-2.5" />
                        ))}
                        <td
                          colSpan={TABLE_COL_COUNT - PLATFORM_ROW_LEAD_COLS}
                          className="px-3 pt-0 pb-2.5"
                          onClick={e => e.stopPropagation()}
                        >
                          <PlatformPublishRow
                            platformPublish={video.platformPublish}
                            onPublish={() => setPublishingVideo(video)}
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>

          {filteredVideos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-[13px]">沒有符合條件的影片</div>
          )}
        </>
      )}

      {publishingVideo && (
        <PlatformPublishModal
          video={publishingVideo}
          onClose={handleClosePublishModal}
          onSave={handleSavePublish}
        />
      )}

      {editOpen && selectedVideo && (
        <CoordinationRecordModal
          video={selectedVideo}
          onClose={() => setEditOpen(false)}
          onSave={handleSaveRecord}
        />
      )}
    </div>
  );
}
