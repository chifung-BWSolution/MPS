import { Fragment, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Edit, Loader2, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoOutput } from '@/hooks/useVideoOutput';
import { useVchannels } from '@/hooks/useVchannels';
import type { VideoOutput, VideoOutputInput, VideoOutputStatus, VideoProjectCategory } from '@/types/videoOutput';
import {
  PLATFORM_PUBLISH_KEYS,
  PLATFORM_PUBLISH_LABELS,
  VIDEO_OUTPUT_STATUS_COLORS,
  VIDEO_OUTPUT_STATUS_LABELS,
  countPublishedPlatforms,
  deriveVideoOutputStatus,
  filterVideoOutputs,
  formatPublishDate,
  formatShootLocation,
  formatStorageOrLink,
  inferProjectCategory,
  isHttpUrl,
  resolveChannelPrefixFromCode,
} from '@/lib/videoOutputUtils';
import { CrudModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VideoEditModal } from '@/components/video/VideoEditModal';
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

function PlatformPublishRow({ platformPublish }: { platformPublish: VideoOutput['platformPublish'] }) {
  return (
    <div className="px-4 py-3 bg-slate-50/80 border-t border-border/60">
      <p className="text-[11px] font-bold text-muted-foreground mb-2">平台發佈</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
        {PLATFORM_PUBLISH_KEYS.map(key => (
          <div key={key} className="flex items-center gap-2 text-[11px] bg-white border border-border/60 rounded px-2 py-1.5">
            <CheckCell value={platformPublish[key]} />
            <span className="text-muted-foreground">{PLATFORM_PUBLISH_LABELS[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const emptyForm = (): VideoOutputInput & { shootLocationHk: boolean; shootLocationSz: boolean } => ({
  vchannelId: '',
  videoCode: '',
  title: '',
  productionYear: new Date().getFullYear(),
  projectCategory: 'client',
  shootSz: false,
  shootHk: false,
  shootLocationHk: false,
  shootLocationSz: false,
  rawFootageDone: false,
  needsEditing: null,
  demoDone: false,
  platformPublish: {},
  storagePath: '',
});

export function VideoManagementModule() {
  const { systemUser } = useAuth();
  const { videos, loading, error, addVideo, updateVideo } = useVideoOutput();
  const { channels } = useVchannels();

  const [vchannelFilter, setVchannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | VideoProjectCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | VideoOutputStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoOutput | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const channelMap = useMemo(() => new Map(channels.map(c => [c.channelCode, c])), [channels]);

  const resolveVchannelId = (videoCode: string, selectedId?: string) => {
    if (selectedId) return selectedId;
    const prefix = resolveChannelPrefixFromCode(videoCode);
    return channelMap.get(prefix)?.id ?? '';
  };

  const handleOpenAdd = () => {
    setForm(emptyForm());
    setFormError(null);
    setShowAddModal(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!form.videoCode.trim()) {
      setFormError('請輸入 Video Code');
      return;
    }
    if (!form.title.trim()) {
      setFormError('請輸入主題');
      return;
    }
    const vchannelId = resolveVchannelId(form.videoCode, form.vchannelId);
    if (!vchannelId) {
      setFormError('無法匹配 Vchannel，請選擇頻道或修正 Video Code 前綴');
      return;
    }

    setSaving(true);
    const err = await addVideo({
      vchannelId,
      videoCode: form.videoCode.trim(),
      title: form.title.trim(),
      productionYear: form.productionYear,
      projectCategory: form.projectCategory ?? inferProjectCategory(resolveChannelPrefixFromCode(form.videoCode)),
      shootSz: form.shootLocationSz,
      shootHk: form.shootLocationHk,
      rawFootageDone: form.rawFootageDone,
      needsEditing: form.needsEditing,
      demoDone: form.demoDone,
      storagePath: form.storagePath?.trim() || undefined,
      platformPublish: form.platformPublish,
      asanaTaskId: form.asanaTaskId,
      asanaUrl: form.asanaUrl,
      plannedPublishDate: form.plannedPublishDate,
      publishedDate: form.publishedDate,
    });
    setSaving(false);

    if (err) {
      setFormError(typeof err === 'object' && err && 'message' in err ? String((err as { message: string }).message) : '儲存失敗');
      return;
    }
    setShowAddModal(false);
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

        <button
          type="button"
          onClick={handleOpenAdd}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} /> 新增影片
        </button>
      </div>

      <p className="text-[12px] text-muted-foreground">
        顯示 {filteredVideos.length} / {videos.length} 部
      </p>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-x-auto">
        <table className="w-full text-[13px] min-w-[1200px]">
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
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">拍攝時間</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">狀態</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">發佈日期</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground min-w-[160px]">視頻鏈接/保存地址</th>
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
                    <td className="px-3 py-2.5 align-middle text-[12px] whitespace-nowrap">{video.shootAt ?? '—'}</td>
                    <td className="px-3 py-2.5 align-middle">
                      <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded whitespace-nowrap', VIDEO_OUTPUT_STATUS_COLORS[status])}>
                        {VIDEO_OUTPUT_STATUS_LABELS[status]}
                      </span>
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
                      <td colSpan={13} className="p-0">
                        <PlatformPublishRow platformPublish={video.platformPublish} />
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

      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增影片" size="lg">
        <div className="space-y-4">
          {formError && (
            <p className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">{formError}</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium mb-1 block">Vchannel</label>
              <Select
                value={form.vchannelId || 'auto'}
                onValueChange={v => setForm(f => ({ ...f, vchannelId: v === 'auto' ? '' : v }))}
              >
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="依 Video Code 自動匹配" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">依 Video Code 自動匹配</SelectItem>
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
                value={form.productionYear ?? ''}
                onChange={e => setForm(f => ({ ...f, productionYear: parseInt(e.target.value, 10) || undefined }))}
                className="h-9 text-[13px]"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1 block">Video Code *</label>
            <Input
              value={form.videoCode}
              onChange={e => setForm(f => ({ ...f, videoCode: e.target.value }))}
              placeholder="V11-2026-003M 或 V12/V14-2025-003"
              className="h-9 text-[13px] font-mono"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1 block">主題 *</label>
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="h-9 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1 block">視頻保存地址 / 鏈接</label>
            <Input
              value={form.storagePath ?? ''}
              onChange={e => setForm(f => ({ ...f, storagePath: e.target.value }))}
              placeholder="V:\... 或 https://..."
              className="h-9 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium mb-2 block">拍攝地址</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={form.shootLocationHk}
                  onChange={e => setForm(f => ({ ...f, shootLocationHk: e.target.checked }))}
                />
                香港
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={form.shootLocationSz}
                  onChange={e => setForm(f => ({ ...f, shootLocationSz: e.target.checked }))}
                />
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
              <input
                type="checkbox"
                checked={form.needsEditing === true}
                onChange={e => setForm(f => ({ ...f, needsEditing: e.target.checked }))}
              />
              是否剪輯
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={form.demoDone} onChange={e => setForm(f => ({ ...f, demoDone: e.target.checked }))} />
              Demo 完成
            </label>
          </div>

          <div>
            <label className="text-[12px] font-medium mb-1 block">項目類型</label>
            <Select
              value={form.projectCategory ?? 'client'}
              onValueChange={v => setForm(f => ({ ...f, projectCategory: v as VideoProjectCategory }))}
            >
              <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">內部項目</SelectItem>
                <SelectItem value="client">客戶項目</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSubmit} disabled={saving}>
              {saving ? '儲存中...' : '建立影片'}
            </Button>
          </div>
        </div>
      </CrudModal>

      {editingVideo && (
        <VideoEditModal
          video={editingVideo}
          channels={channelOptions}
          onClose={() => setEditingVideo(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
