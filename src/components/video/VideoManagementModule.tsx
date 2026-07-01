import { Fragment, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Edit, Loader2, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoOutput } from '@/hooks/useVideoOutput';
import { useVchannels } from '@/hooks/useVchannels';
import type { VideoOutput, VideoOutputInput, VideoOutputStatus, VideoProjectCategory } from '@/types/videoOutput';
import {
  PLATFORM_PUBLISH_LABELS,
  VIDEO_OUTPUT_STATUS_COLORS,
  VIDEO_OUTPUT_STATUS_LABELS,
  countPublishedPlatforms,
  deriveVideoOutputStatus,
  filterVideoOutputs,
  formatPlatformPublishCopyText,
  formatPublishDate,
  formatShootLocation,
  formatStorageOrLink,
  getPlatformUrl,
  getPublishedPlatformKeys,
  getPublishedPlatformKeysWithUrl,
  isHttpUrl,
} from '@/lib/videoOutputUtils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VideoEditModal } from '@/components/video/VideoEditModal';
import { PlatformPublishModal } from '@/components/video/PlatformPublishModal';
import { saveWorkLogsForVideo } from '@/services/videoOutputWorkLogService';
import { resolveBubbleStaffId } from '@/services/reportLinkService';
import { useAuth } from '@/context/AuthContext';
import type { VideoWorkLogDraft } from '@/types/videoOutputWorkLog';

const STATUS_FILTERS: { id: 'all' | VideoOutputStatus; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待製作' },
  { id: 'in_production', label: '製作中' },
  { id: 'demo_done', label: 'Demo 完成' },
  { id: 'published', label: '已發佈' },
];

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
    <span className="text-[11px] text-teal-700 font-medium whitespace-nowrap">
      {labels.join('|')}
    </span>
  );
}

function StorageLinkCell({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isHttpUrl(value)) {
      window.open(value, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group flex items-center gap-1 max-w-[200px] text-left text-[11px] text-teal-700 hover:underline"
      title={value}
    >
      <span className="truncate">{value}</span>
      <Copy size={10} className="shrink-0 opacity-0 group-hover:opacity-100" />
    </button>
  );
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

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
    <div className="px-4 py-3 bg-slate-50/80 border-t border-border/60">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold text-muted-foreground">平台發佈</p>
        <div className="flex items-center gap-1.5">
          {canCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 border border-border/60 bg-white text-muted-foreground rounded text-[11px] font-medium hover:bg-muted/50 transition-colors"
            >
              <Copy size={11} /> {copyDone ? '已複製' : '複製'}
            </button>
          )}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onPublish();
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-teal-600 text-white rounded text-[11px] font-medium hover:bg-teal-700 transition-colors"
          >
            <Plus size={11} /> 發佈
          </button>
        </div>
      </div>
      {publishedKeys.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-1">尚未發佈任何平台</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {publishedKeys.map(key => {
            const url = getPlatformUrl(platformPublish, key);
            return (
              <div key={key} className="flex items-center gap-2 text-[11px] bg-white border border-border/60 rounded px-2 py-1.5 min-w-0">
                <CheckCell value />
                <span className="text-muted-foreground shrink-0">{PLATFORM_PUBLISH_LABELS[key]}</span>
                {url && (
                  isHttpUrl(url) ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="truncate text-teal-700 hover:underline ml-auto min-w-0"
                      title={url}
                    >
                      鏈接
                    </a>
                  ) : (
                    <span className="truncate text-teal-700 ml-auto min-w-0" title={url}>{url}</span>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function VideoManagementModule() {
  const { systemUser } = useAuth();
  const { videos, loading, error, updateVideo } = useVideoOutput();
  const { channels } = useVchannels();

  const [vchannelFilter, setVchannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | VideoProjectCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | VideoOutputStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingVideo, setEditingVideo] = useState<VideoOutput | null>(null);
  const [publishingVideo, setPublishingVideo] = useState<VideoOutput | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const filteredVideos = useMemo(
    () =>
      filterVideoOutputs(videos, {
        vchannelId: vchannelFilter,
        searchQuery,
        category: categoryFilter,
        status: statusFilter,
      }),
    [videos, vchannelFilter, searchQuery, categoryFilter, statusFilter],
  );

  const stats = useMemo(() => {
    const demoDone = videos.filter(v => deriveVideoOutputStatus(v) === 'demo_done').length;
    const published = videos.filter(v => deriveVideoOutputStatus(v) === 'published').length;
    return { total: videos.length, demoDone, published };
  }, [videos]);

  const handleSavePublish = async (input: Partial<VideoOutputInput>) => {
    if (!publishingVideo) return new Error('未選擇影片');
    const err = await updateVideo(publishingVideo.id, input);
    if (err) return err instanceof Error ? err : new Error('更新發佈失敗');
    return null;
  };

  const handleSaveEdit = async (input: Partial<VideoOutputInput>, workLogs: VideoWorkLogDraft[]) => {
    if (!editingVideo) return new Error('未選擇影片');
    const err = await updateVideo(editingVideo.id, input);
    if (err) return err instanceof Error ? err : new Error('更新影片失敗');
    try {
      const staffId = await resolveBubbleStaffId(systemUser);
      await saveWorkLogsForVideo(editingVideo.id, workLogs, staffId ?? undefined);
    } catch (e) {
      return e instanceof Error ? e : new Error('保存工時失敗');
    }
    return null;
  };

  const handleReview = async (video: VideoOutput) => {
    if (video.reviewed || reviewingId === video.id) return;
    setReviewingId(video.id);
    await updateVideo(video.id, { reviewed: true });
    setReviewingId(null);
  };

  const channelOptions = useMemo(
    () => channels.map(ch => ({ id: ch.id, channelCode: ch.channelCode, publicName: ch.publicName })),
    [channels],
  );

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
    <div className="space-y-5">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">影片總數</span>
          <p className="text-[18px] font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">Demo 完成</span>
          <p className="text-[18px] font-bold text-blue-600">{stats.demoDone}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">已發佈</span>
          <p className="text-[18px] font-bold text-teal-600">{stats.published}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
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

        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatusFilter(s.id)}
              className={cn(
                'px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
                statusFilter === s.id ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">
        顯示 {filteredVideos.length} / {videos.length} 部
      </p>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-x-auto">
        <table className="w-full text-[13px] min-w-[1320px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="w-8 px-2 py-2.5" />
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Vchannel</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Video Code</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground min-w-[180px]">主題</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">拍攝地址</th>
              <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">原片拍攝</th>
              <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">是否剪輯</th>
              <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Demo完成</th>
              <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">文案</th>
              <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">字幕</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">拍攝時間</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">狀態</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">發佈日期</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground min-w-[160px]">視頻鏈接/保存地址</th>
              <th className="text-center px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap">審核</th>
              <th className="w-16 px-2 py-2.5 font-medium text-muted-foreground text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredVideos.map(video => {
              const status = deriveVideoOutputStatus(video);
              const publish = formatPublishDate(video);
              const storage = formatStorageOrLink(video);
              const platformCount = countPublishedPlatforms(video.platformPublish);
              const isExpanded = expandedId === video.id;

              return (
                <Fragment key={video.id}>
                  <tr className="border-t border-border/50 hover:bg-muted/10">
                    <td className="px-2 py-2.5 align-middle">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : video.id)}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                        title="平台發佈"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <span className="font-mono text-[12px] font-bold" title={video.channelPublicName}>
                        {video.channelCode}
                      </span>
                      {!isExpanded && platformCount.done > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {platformCount.done}/{platformCount.total} 已發佈
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle font-mono text-[11px] whitespace-nowrap">{video.videoCode}</td>
                    <td className="px-3 py-2.5 align-middle max-w-[240px]">
                      <span className="line-clamp-2" title={video.title}>{video.title}</span>
                    </td>
                    <td className="px-3 py-2.5 align-middle whitespace-nowrap text-[12px]">
                      {formatShootLocation(video.shootHk, video.shootSz)}
                    </td>
                    <td className="px-2 py-2.5 align-middle text-center"><CheckCell value={video.rawFootageDone} /></td>
                    <td className="px-2 py-2.5 align-middle text-center"><CheckCell value={video.needsEditing} /></td>
                    <td className="px-2 py-2.5 align-middle text-center"><CheckCell value={video.demoDone} /></td>
                    <td className="px-2 py-2.5 align-middle text-center">
                      <CopywritingCell sc={video.copySc} tc={video.copyTc} en={video.copyEn} />
                    </td>
                    <td className="px-2 py-2.5 align-middle text-center"><CheckCell value={video.subtitleDone} /></td>
                    <td className="px-3 py-2.5 align-middle text-[12px] whitespace-nowrap">{video.shootAt ?? '—'}</td>
                    <td className="px-3 py-2.5 align-middle">
                      {video.reviewed ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded whitespace-nowrap bg-slate-100 text-slate-600">
                          已審核
                        </span>
                      ) : (
                        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded whitespace-nowrap', VIDEO_OUTPUT_STATUS_COLORS[status])}>
                          {VIDEO_OUTPUT_STATUS_LABELS[status]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle text-[12px] whitespace-nowrap">
                      <span className={cn(publish.planned && 'text-muted-foreground')} title={publish.planned ? '預計發佈' : undefined}>
                        {publish.text}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-middle"><StorageLinkCell value={storage} /></td>
                    <td className="px-2 py-2.5 align-middle text-center">
                      <button
                        type="button"
                        disabled={video.reviewed || reviewingId === video.id}
                        onClick={() => handleReview(video)}
                        className={cn(
                          'px-2.5 py-1 rounded text-[11px] font-medium transition-colors duration-200 whitespace-nowrap',
                          video.reviewed
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-teal-600 text-white hover:bg-teal-700',
                          reviewingId === video.id && !video.reviewed && 'opacity-70 cursor-wait',
                        )}
                      >
                        {reviewingId === video.id ? '處理中…' : video.reviewed ? '已審核' : '審核'}
                      </button>
                    </td>
                    <td className="px-2 py-2.5 align-middle text-center">
                      <button
                        type="button"
                        onClick={() => setEditingVideo(video)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-teal-50 text-teal-700"
                        title="編輯"
                      >
                        <Edit size={13} />
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-border/30">
                      <td colSpan={16} className="p-0">
                        <PlatformPublishRow
                          platformPublish={video.platformPublish}
                          onPublish={() => setPublishingVideo(video)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredVideos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">沒有符合條件的影片</div>
      )}

      {editingVideo && (
        <VideoEditModal
          video={editingVideo}
          channels={channelOptions}
          onClose={() => setEditingVideo(null)}
          onSave={handleSaveEdit}
        />
      )}

      {publishingVideo && (
        <PlatformPublishModal
          video={publishingVideo}
          onClose={() => setPublishingVideo(null)}
          onSave={handleSavePublish}
        />
      )}
    </div>
  );
}
