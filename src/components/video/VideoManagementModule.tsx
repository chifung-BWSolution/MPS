import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Pencil, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoOutput } from '@/hooks/useVideoOutput';
import { useVideoWorkflow } from '@/hooks/useVideoWorkflow';
import { useVchannels } from '@/hooks/useVchannels';
import { supabase } from '@/lib/supabase';
import { fetchStaffDirectoryOptions } from '@/services/staffDirectoryService';
import { mapVideoOutputToWorkflow } from '@/lib/videoOutputWorkflowMapper';
import { normalizeVideoWorkflow, sumProductionProgressHours } from '@/lib/videoWorkflowUtils';
import type {
  VideoOutput,
  VideoOutputInput,
  VideoOutputStatus,
  VideoProjectCategory,
} from '@/types/videoOutput';
import {
  VIDEO_OUTPUT_STATUS_COLORS,
  VIDEO_OUTPUT_STATUS_LABELS,
  buildProductionYearOptions,
  deriveVideoOutputStatus,
  filterVideoOutputs,
  formatPlatformPublishCopyText,
  formatShootLocation,
  getCurrentProductionYear,
  getPublishedPlatformKeys,
  getPublishedPlatformKeysWithUrl,
  isHttpUrl,
  sortVideoOutputsByPublishDateDesc,
} from '@/lib/videoOutputUtils';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatformPublishModal } from '@/components/video/PlatformPublishModal';
import { PlatformPublishLinkTag } from '@/components/video/PlatformPublishLinkTag';
import { ScheduleEditModal } from '@/components/video/workflow/ScheduleEditModal';
import { WorkflowStatusSummaryBar } from '@/components/video/workflow/WorkflowStatusSummaryBar';
import { CopyStoragePathButton } from '@/components/video/workflow/workflowListLayout';
import { VideoCoordinationStatusView } from '@/components/video/VideoCoordinationStatusView';

type CoordinationView = 'status' | 'list';

const TABLE_COL_COUNT = 13;
/** Columns before 拍攝時間: 狀態 / Vchannel / Video Code / 主題 */
const PLATFORM_ROW_LEAD_COLS = 4;

type TalentOption = { id: string; displayName: string };

function workflowPayloadToOutputInput(payload: Partial<VideoWorkflowMock>): Partial<VideoOutputInput> {
  const input: Partial<VideoOutputInput> = {
    vchannelId: payload.vchannelId,
    productionYear: payload.productionYear,
    videoCode: payload.videoCode,
    title: payload.title,
    ...(payload.asanaUrl !== undefined ? { asanaUrl: payload.asanaUrl.trim() } : {}),
    shootAt: payload.shootAt ?? '',
    shootSz: !!payload.location?.sz,
    shootHk: !!payload.location?.hk,
    locationNotes: payload.location?.notes ?? '',
    prepAssignments: {
      script: payload.script,
      model: payload.model,
      photographer: payload.photographer,
      onSiteCrew: payload.onSiteCrew,
    },
  };
  if (payload.stage) {
    input.workflowStage = payload.stage;
    if (payload.stage === 'publish' || payload.stage === 'published') {
      input.reviewed = true;
    }
  }
  if (payload.publishedDate !== undefined) input.publishedDate = payload.publishedDate;
  if (payload.platformPublish !== undefined) input.platformPublish = payload.platformPublish;
  return input;
}

const STATUS_SUMMARY_KEYS: VideoOutputStatus[] = [
  'pending',
  'in_production',
  'pending_review',
  'pending_publish',
  'published',
  'delisted',
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
    delisted: 0,
  };
  for (const video of videos) {
    counts[deriveVideoOutputStatus(video)]++;
  }
  return counts;
}

function AsanaMark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <circle cx="12" cy="5" r="2.6" fill="currentColor" />
      <circle cx="6" cy="16.2" r="2.6" fill="currentColor" />
      <circle cx="18" cy="16.2" r="2.6" fill="currentColor" />
    </svg>
  );
}

function AsanaLinkButton({ url }: { url?: string }) {
  const href = url?.trim() ?? '';
  const openable = isHttpUrl(href);
  const className = 'inline-flex items-center justify-center h-7 w-7 rounded border border-border/80 text-[#f06a6a] hover:bg-rose-50 transition-colors disabled:opacity-30 disabled:pointer-events-none';

  if (!openable) {
    return (
      <button type="button" disabled className={className} title="尚未填寫 Asana 連結" aria-label="尚未填寫 Asana 連結">
        <AsanaMark />
      </button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title="開啟 Asana"
      aria-label="開啟 Asana"
    >
      <AsanaMark />
    </a>
  );
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
          publishedKeys.map(key => (
            <PlatformPublishLinkTag
              key={key}
              platformKey={key}
              platformPublish={platformPublish}
            />
          ))
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
  const { videos, loading, error, updateVideo, fetchVideos } = useVideoOutput();
  const { addVideo, updateVideo: updateWorkflowVideo, advanceToProduction, refreshVideos } = useVideoWorkflow();
  const { channels } = useVchannels();

  const [view, setView] = useState<CoordinationView>('list');
  const [vchannelFilter, setVchannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState(getCurrentProductionYear);
  const [categoryFilter, setCategoryFilter] = useState<'all' | VideoProjectCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | VideoOutputStatus>('all');
  const [publishingVideo, setPublishingVideo] = useState<VideoOutput | null>(null);
  const [editingVideo, setEditingVideo] = useState<VideoWorkflowMock | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [staffOptions, setStaffOptions] = useState<{ staffId: string; displayName: string }[]>([]);
  const [talentOptions, setTalentOptions] = useState<TalentOption[]>([]);
  const workLogTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const video of videos) {
      totals.set(video.id, sumProductionProgressHours(video.productionProgress));
    }
    return totals;
  }, [videos]);

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
            displayName: (row.name_zh as string) || (row.name_en as string) || (row.id as string),
          })),
        );
      } catch {
        if (!cancelled) {
          setStaffOptions([]);
          setTalentOptions([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openCreate = () => {
    setEditingVideo(null);
    setEditOpen(true);
  };

  const openEdit = (video: VideoOutput) => {
    setEditingVideo(normalizeVideoWorkflow(mapVideoOutputToWorkflow(video)));
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditingVideo(null);
  };

  const handleSavePublish = async (input: Partial<VideoOutputInput>) => {
    if (!publishingVideo) return new Error('未選擇影片');
    const err = await updateVideo(publishingVideo.id, input);
    if (err) return err instanceof Error ? err : new Error('更新發佈失敗');
    return null;
  };

  const handleClosePublishModal = () => {
    setPublishingVideo(null);
  };

  const handleSaveVideo = async (
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
          asanaUrl: payload.asanaUrl,
          deviceType: payload.deviceType ?? null,
          productionYear: payload.productionYear,
          shootAt: payload.shootAt,
          location: payload.location ?? { sz: false, hk: false },
          script: payload.script,
          model: payload.model,
          photographer: payload.photographer,
          onSiteCrew: payload.onSiteCrew,
        });
        await fetchVideos({ silent: true });
        return { error: null, id };
      } catch (e) {
        return { error: e instanceof Error ? e.message : '建立影片失敗' };
      }
    }
    if (!editingVideo) return { error: '找不到影片' };
    const workflowErr = await updateWorkflowVideo(editingVideo.id, payload);
    if (workflowErr && workflowErr !== '找不到影片') return { error: workflowErr };
    if (workflowErr === '找不到影片') {
      const outputErr = await updateVideo(editingVideo.id, workflowPayloadToOutputInput(payload));
      if (outputErr) return { error: outputErr instanceof Error ? outputErr.message : '更新失敗' };
      await refreshVideos();
    }
    await fetchVideos({ silent: true });
    return { error: null, id: editingVideo.id };
  };

  const handleEnterProduction = async (videoId: string): Promise<string | null> => {
    let err = await advanceToProduction(videoId);
    if (err === '找不到影片') {
      const { error: updateError } = await supabase
        .from('video_output')
        .update({
          workflow_stage: 'production',
          review_reject_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);
      if (updateError) return updateError.message;
      await refreshVideos();
      err = null;
    }
    if (err) return err;
    await fetchVideos({ silent: true });
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
      <div className="sticky top-[calc(48px+var(--app-banner-h))] z-30 -mx-6 px-6 pt-1 pb-3 mb-4 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
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
                  { id: 'list' as const, label: '列表視圖' },
                  { id: 'status' as const, label: '狀態視圖' },
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
              className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
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
            className="ml-auto h-9 px-3 bg-teal-600 hover:bg-teal-700 text-white"
            onClick={openCreate}
          >
            <Plus size={14} className="mr-1.5" />
            新建影片
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
            onEdit={openEdit}
          />
        )
      ) : (
        <>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-x-auto">
            <table className="w-full text-[14px] min-w-[1300px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">狀態</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Vchannel</th>
                  <th className="text-left px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap w-[1%]">Video Code</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground min-w-[180px]">主題</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">拍攝時間</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">計劃發佈時間</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">實際發佈時間</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">拍攝地址</th>
                  <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">原片拍攝</th>
                  <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">是否剪輯</th>
                  <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Demo完成</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap min-w-[76px]">總工時</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap w-[128px]">操作</th>
                </tr>
              </thead>
              {filteredVideos.map(video => {
                const status = deriveVideoOutputStatus(video);
                const isPublished = status === 'published';
                const totalHours = workLogTotals.get(video.id);
                const cellPad = isPublished ? 'pt-2.5 pb-1' : 'py-2.5';

                return (
                  <tbody key={video.id} className="border-t border-border/50">
                    <tr className="transition-colors hover:bg-muted/10">
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
                      <td rowSpan={isPublished ? 2 : 1} className="px-3 align-middle text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <AsanaLinkButton url={video.asanaUrl} />
                          <button
                            type="button"
                            onClick={() => openEdit(video)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border/80 text-[12px] font-medium text-teal-700 hover:bg-teal-50 transition-colors"
                          >
                            <Pencil size={12} />
                            編輯
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isPublished && (
                      <tr className="transition-colors hover:bg-muted/10">
                        {Array.from({ length: PLATFORM_ROW_LEAD_COLS }).map((_, i) => (
                          <td key={i} className="px-3 pt-0 pb-2.5" />
                        ))}
                        <td
                          colSpan={TABLE_COL_COUNT - PLATFORM_ROW_LEAD_COLS - 1}
                          className="px-3 pt-0 pb-2.5"
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

      <ScheduleEditModal
        open={editOpen}
        video={editingVideo}
        channels={channels}
        staffOptions={staffOptions}
        talentOptions={talentOptions}
        onClose={closeEdit}
        onSave={handleSaveVideo}
        onEnterProduction={!editingVideo || editingVideo.stage === 'prep' ? handleEnterProduction : undefined}
      />
    </div>
  );
}
