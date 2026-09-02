import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X, ExternalLink, Video, Share2, Megaphone, TrendingUp, Mail, Puzzle, Link2, ChevronLeft, ChevronRight, Sparkles, AlertTriangle, Loader2, Unlink, Search, Edit, Trash2, MapPin, RefreshCw } from 'lucide-react';
import { formatMoneyFromMicros } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { BrandFieldBadge, MutedFieldBadge, NullableBadge, StatusFieldBadge, displayText } from '@/components/ui/nullable-badge';
import { WebsiteProfileFull, SocialPost, EdmCampaign } from '@/types/app';
import {
  getVideosForWebsite,
  getSocialPostsForWebsite,
  getEdmCampaignsForWebsite,
  getPluginsForWebsite,
  getExternalLinksForWebsite,
  Plugin,
  ExternalLink as ExternalLinkType,
} from '@/data/websiteDetailData';
import { useSeoKeywords } from '@/hooks/useSeoKeywords';
import { useWebsitePaidAds } from '@/hooks/useWebsitePaidAds';
import {
  buildFacebookAdsCampaignHash,
  buildGoogleAdsCampaignHash,
  setFacebookAdsCampaignHash,
  setGoogleAdsCampaignHash,
} from '@/lib/adsCampaignNavigation';
import type { DateRangePreset } from '@/types/googleAds';
import type { WebsiteFacebookAdCampaign, WebsiteGoogleAdCampaign } from '@/types/websitePaidAds';
import type { VideoOutput } from '@/types/videoOutput';
import {
  VIDEO_OUTPUT_STATUS_COLORS,
  VIDEO_OUTPUT_STATUS_LABELS,
  buildProductionYearOptions,
  deriveVideoOutputStatus,
  filterVideoOutputs,
  getCurrentProductionYear,
  PLATFORM_PUBLISH_LABELS,
  getPublishedPlatformKeys,
} from '@/lib/videoOutputUtils';
import {
  fetchLinkedVideosForWebsite,
  fetchLinkableVideoOutputs,
  linkVideosToWebsite,
  unlinkVideoFromWebsite,
  type WebsiteLinkedVideo,
} from '@/services/websiteVideoLinkService';
import { useVchannels } from '@/hooks/useVchannels';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useBacklinkPurchases } from '@/hooks/useBacklinkPurchases';
import { useBrands } from '@/hooks/useBrands';
import { useWebPageSuppliers } from '@/hooks/useWebPageSuppliers';
import { brandLabelOf } from '@/lib/projectOrg';
import { useGoogleBusinessRegistrations } from '@/hooks/useGoogleBusinessRegistrations';
import type { BacklinkBrand, BacklinkPurchase, GoogleBusinessRegistration } from '@/types/marketingOps';
import { BACKLINK_BRANDS } from '@/types/marketingOps';
import { formatBacklinkHkd, formatBacklinkUsd, normalizeBacklinkCosts } from '@/lib/backlinkCurrency';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ============================================================
// Shared Configs
// ============================================================


const socialPlatformConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  facebook: { label: 'Facebook', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  instagram: { label: 'Instagram', color: 'text-pink-700', bgColor: 'bg-pink-50' },
  xiaohongshu: { label: '小紅書', color: 'text-red-700', bgColor: 'bg-red-50' },
  linkedin: { label: 'LinkedIn', color: 'text-sky-700', bgColor: 'bg-sky-50' },
  youtube: { label: 'YouTube', color: 'text-red-700', bgColor: 'bg-red-50' },
  twitter: { label: 'Twitter', color: 'text-sky-700', bgColor: 'bg-sky-50' },
  other: { label: '其他', color: 'text-slate-700', bgColor: 'bg-slate-50' },
};

const socialStatusConfig = {
  draft: { label: '草稿', color: 'text-slate-700', bgColor: 'bg-slate-50' },
  scheduled: { label: '已排期', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  published: { label: '已發佈', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  archived: { label: '已封存', color: 'text-slate-700', bgColor: 'bg-slate-50' },
};

const seoLevelConfig = {
  level_1: { label: 'S1 核心', color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200' },
  level_2: { label: 'S2 重要', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  level_3: { label: 'S3 長尾', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
};

const seoStatusConfig = {
  monitoring: { label: '監控中', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  optimizing: { label: '優化中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  achieved: { label: '已達標', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  paused: { label: '已暫停', color: 'text-slate-700', bgColor: 'bg-slate-50' },
};

const edmStatusConfig = {
  draft: { label: '草稿', color: 'text-slate-700', bgColor: 'bg-slate-50' },
  scheduled: { label: '已排期', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  sent: { label: '已發送', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  cancelled: { label: '已取消', color: 'text-rose-700', bgColor: 'bg-rose-50' },
};

const linkTypeConfig: Record<string, { label: string; icon: string; color: string }> = {
  figma: { label: 'Figma', icon: '🎨', color: 'text-purple-600' },
  github: { label: 'GitHub', icon: '🐙', color: 'text-slate-800' },
  staging: { label: 'Staging', icon: '🌐', color: 'text-amber-600' },
  dev: { label: 'Dev URL', icon: '🛠️', color: 'text-blue-600' },
  analytics: { label: 'Analytics', icon: '📊', color: 'text-green-600' },
  cms: { label: 'CMS', icon: '📝', color: 'text-teal-600' },
  documentation: { label: 'Docs', icon: '📖', color: 'text-indigo-600' },
  other: { label: '其他', icon: '🔗', color: 'text-slate-600' },
};

// ============================================================
// VIDEOS TAB — link to 影片製作 (video_output)
// ============================================================
export function WebsiteVideosTab({
  site,
  onVideosCountChange,
}: {
  site: WebsiteProfileFull;
  onVideosCountChange?: (count: number) => void;
}) {
  const { channels } = useVchannels();
  const [videos, setVideos] = useState<WebsiteLinkedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [linkable, setLinkable] = useState<VideoOutput[]>([]);
  const [loadingLinkable, setLoadingLinkable] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [yearFilter, setYearFilter] = useState(getCurrentProductionYear);
  const [vchannelFilter, setVchannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const loadLinked = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchLinkedVideosForWebsite(site.id);
      setVideos(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入關聯影片失敗');
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [site.id]);

  useEffect(() => {
    void loadLinked();
  }, [loadLinked]);

  const openLinkModal = async () => {
    setShowModal(true);
    setSelectedIds(new Set());
    setYearFilter(getCurrentProductionYear());
    setVchannelFilter('all');
    setSearchQuery('');
    setLoadingLinkable(true);
    try {
      const rows = await fetchLinkableVideoOutputs(site.id);
      setLinkable(rows);
    } catch {
      setLinkable([]);
    } finally {
      setLoadingLinkable(false);
    }
  };

  const yearOptions = useMemo(
    () => buildProductionYearOptions(linkable.map(v => v.productionYear)),
    [linkable],
  );

  const filteredLinkable = useMemo(
    () =>
      filterVideoOutputs(linkable, {
        vchannelId: vchannelFilter,
        searchQuery,
        category: 'all',
        status: 'all',
        productionYear: yearFilter,
      }),
    [linkable, vchannelFilter, searchQuery, yearFilter],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLink = async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    try {
      const count = await linkVideosToWebsite(site.id, [...selectedIds]);
      onVideosCountChange?.(count);
      setShowModal(false);
      await loadLinked();
    } catch (e) {
      setError(e instanceof Error ? e.message : '關聯失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (linkId: string) => {
    if (!confirm('確定取消關聯此影片？')) return;
    setUnlinkingId(linkId);
    try {
      const count = await unlinkVideoFromWebsite(site.id, linkId);
      onVideosCountChange?.(count);
      await loadLinked();
    } catch (e) {
      setError(e instanceof Error ? e.message : '取消關聯失敗');
    } finally {
      setUnlinkingId(null);
    }
  };

  const totalHours = videos.reduce((sum, v) => sum + v.totalHours, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">影片列表</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            共 {videos.length} 部影片關聯至此網站
            {videos.length > 0 && (
              <span className="ml-2">· 合計工時 {totalHours.toFixed(1).replace(/\.0$/, '')}h</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openLinkModal()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
        >
          <Link2 size={13} />關聯影片
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[13px]">載入關聯影片...</span>
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <Video size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未關聯任何影片</p>
          <p className="text-[12px] text-muted-foreground mt-1">點擊「關聯影片」從影片製作選擇</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">編號</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">影片標題</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">頻道</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">拍攝日期</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">發佈日期</th>
                  <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">工時</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">發佈平台</th>
                  <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {videos.map(video => {
                  const status = deriveVideoOutputStatus(video);
                  const platforms = getPublishedPlatformKeys(video.platformPublish);
                  return (
                    <tr key={video.linkId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-[12px] text-muted-foreground font-mono whitespace-nowrap">
                        {video.videoCode}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[13px] font-medium">{video.title}</span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                        {video.channelPublicName || video.channelCode || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', VIDEO_OUTPUT_STATUS_COLORS[status])}>
                          {VIDEO_OUTPUT_STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                        {video.shootAt || '—'}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                        {video.publishedDate || '—'}
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium text-right whitespace-nowrap">
                        {video.totalHours > 0
                          ? `${video.totalHours.toFixed(1).replace(/\.0$/, '')}h`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {platforms.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {platforms.map(key => (
                              <NullableBadge key={key} value={PLATFORM_PUBLISH_LABELS[key]} className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded" />
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleUnlink(video.linkId)}
                          disabled={unlinkingId === video.linkId}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-rose-600 disabled:opacity-50"
                          title="取消關聯"
                        >
                          {unlinkingId === video.linkId ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Unlink size={12} />
                          )}
                          取消關聯
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h3 className="text-[16px] font-bold">關聯影片</h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  從「影片製作」選擇要關聯至 {site.websiteName} 的影片
                </p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
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

                <div className="relative flex-1 min-w-[180px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                    placeholder="搜尋主題或 Video Code..."
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3 min-h-[200px]">
              {loadingLinkable ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-[13px]">載入可關聯影片...</span>
                </div>
              ) : filteredLinkable.length === 0 ? (
                <div className="text-center py-10 text-[13px] text-muted-foreground">
                  {linkable.length === 0 ? '沒有可關聯的影片（可能皆已關聯）' : '沒有符合篩選條件的影片'}
                </div>
              ) : (
                <ul className="space-y-1">
                  {filteredLinkable.map(v => {
                    const status = deriveVideoOutputStatus(v);
                    const checked = selectedIds.has(v.id);
                    return (
                      <li key={v.id}>
                        <label
                          className={cn(
                            'flex items-start gap-3 px-3 py-2.5 rounded-md border cursor-pointer transition-colors',
                            checked
                              ? 'border-teal-300 bg-teal-50/60'
                              : 'border-transparent hover:bg-muted/40',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(v.id)}
                            className="mt-1 accent-teal-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-mono text-muted-foreground">{v.videoCode}</span>
                              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', VIDEO_OUTPUT_STATUS_COLORS[status])}>
                                {VIDEO_OUTPUT_STATUS_LABELS[status]}
                              </span>
                            </div>
                            <p className="text-[13px] font-medium mt-0.5 truncate">{v.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {v.channelPublicName || v.channelCode}
                              {v.shootAt ? ` · 拍攝 ${v.shootAt}` : ''}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-border shrink-0">
              <span className="text-[12px] text-muted-foreground">已選 {selectedIds.size} 部</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleLink()}
                  disabled={selectedIds.size === 0 || saving}
                  className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  確認關聯
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SOCIAL POSTS TAB
// ============================================================
export function WebsiteSocialTab({ site }: { site: WebsiteProfileFull }) {
  const [posts] = useState<SocialPost[]>(() => getSocialPostsForWebsite(site.id));
  const [showModal, setShowModal] = useState(false);
  const [newPost, setNewPost] = useState({ platform: 'facebook', content: '', scheduledDate: '' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">社交帖文</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">共 {posts.length} 篇社交帖文</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors">
          <Plus size={13} />新增帖文
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <Share2 size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未有社交帖文</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => {
            const platCfg = socialPlatformConfig[post.platform] || socialPlatformConfig.other;
            const statusCfg = socialStatusConfig[post.status];
            return (
              <div key={post.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded', platCfg.bgColor, platCfg.color)}>{platCfg.label}</span>
                      <MutedFieldBadge value={post.postType} className="capitalize" />
                      <StatusFieldBadge config={statusCfg} />
                    </div>
                    <p className="text-[13px] text-foreground line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      {post.scheduledDate && <span>📅 {post.scheduledDate.split('T')[0]}</span>}
                      {post.hoursSpent && <span>⏱️ {post.hoursSpent}h</span>}
                      {post.postUrl && (
                        <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline flex items-center gap-0.5">
                          <ExternalLink size={10} />查看帖文
                        </a>
                      )}
                    </div>
                  </div>
                  {/* Engagement Data */}
                  {post.engagementData && post.status === 'published' && (
                    <div className="grid grid-cols-3 gap-2 text-center shrink-0">
                      <div><span className="text-[14px] font-bold block">{post.engagementData.likes}</span><span className="text-[9px] text-muted-foreground">讚好</span></div>
                      <div><span className="text-[14px] font-bold block">{post.engagementData.comments}</span><span className="text-[9px] text-muted-foreground">留言</span></div>
                      <div><span className="text-[14px] font-bold block">{post.engagementData.shares}</span><span className="text-[9px] text-muted-foreground">分享</span></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Social Post Modal */}
      {showModal && (
        <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[540px]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-[16px] font-bold">新增社交帖文</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-muted/30 rounded-md p-3 text-[12px] text-muted-foreground">
                公司：<span className="font-medium text-foreground">{displayText(site.company)}</span> · 品牌：<span className="font-medium text-foreground">{displayText(site.brand)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">平台 *</label>
                  <select value={newPost.platform} onChange={e => setNewPost(p => ({ ...p, platform: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="xiaohongshu">小紅書</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="youtube">YouTube</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">排期日期</label>
                  <input type="date" value={newPost.scheduledDate} onChange={e => setNewPost(p => ({ ...p, scheduledDate: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" />
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">內容 *</label>
                <textarea value={newPost.content} onChange={e => setNewPost(p => ({ ...p, content: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 h-24 resize-none bg-white" placeholder="輸入帖文內容..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
              <button onClick={() => setShowModal(false)} disabled={!newPost.content} className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed">新增帖文</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PAID ADS TAB
// ============================================================
function adsApiStatusBadge(status: string) {
  const s = status.toUpperCase();
  const color =
    s === 'ENABLED' || s === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-700'
      : s === 'PAUSED'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-100 text-slate-600';
  return (
    <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', color)}>
      {status}
    </span>
  );
}

const ADS_DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' },
  { value: '90d', label: '90 天' },
  { value: 'ytd', label: '今年' },
  { value: 'all', label: '全部' },
];

export function WebsiteAdsTab({ site }: { site: WebsiteProfileFull }) {
  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const {
    googleCampaigns,
    facebookCampaigns,
    loading,
    error,
    dateFrom,
    dateTo,
  } = useWebsitePaidAds(site.id, preset, site.brandId);

  const dateQuery = { preset, from: dateFrom, to: dateTo };

  const openGoogleCampaign = (c: WebsiteGoogleAdCampaign) => {
    setGoogleAdsCampaignHash({ campaignKey: c.key, ...dateQuery });
  };

  const openFacebookCampaign = (c: WebsiteFacebookAdCampaign) => {
    setFacebookAdsCampaignHash({ campaignKey: c.key, ...dateQuery });
  };

  const totalItems = googleCampaigns.length + facebookCampaigns.length;
  const totalSpendMicros =
    googleCampaigns.reduce((sum, c) => sum + c.spendMicros, 0) +
    facebookCampaigns.reduce((sum, c) => sum + c.spendMicros, 0);
  const totalImpressions =
    googleCampaigns.reduce((sum, c) => sum + c.impressions, 0) +
    facebookCampaigns.reduce((sum, c) => sum + c.impressions, 0);
  const totalClicks =
    googleCampaigns.reduce((sum, c) => sum + c.clicks, 0) +
    facebookCampaigns.reduce((sum, c) => sum + c.clicks, 0);
  const totalConversions =
    googleCampaigns.reduce((sum, c) => sum + c.conversions, 0) +
    facebookCampaigns.reduce((sum, c) => sum + c.conversions, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-[15px] font-bold">付費廣告</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Google {googleCampaigns.length} · Facebook {facebookCampaigns.length}
            <span className="ml-2">· 指標區間 {dateFrom} → {dateTo}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Google Ads 依網域自動關聯；Facebook Ads 依網站品牌對應。點擊活動列可開啟詳情。無法手動新增或編輯。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {ADS_DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPreset(p.value)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                preset === p.value
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-muted-foreground border-border hover:bg-muted/40',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[13px]">載入付費廣告同步資料...</span>
        </div>
      ) : totalItems === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <Megaphone size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未關聯任何付費廣告</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            請先於網站列表執行「同步廣告網域」，完成 Google Ads 同步，或為 Facebook Ads 活動指定此網站品牌。
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-amber-50 rounded-md p-3 text-center">
              <span className="text-[16px] font-bold text-amber-700 block">
                {formatMoneyFromMicros(totalSpendMicros)}
              </span>
              <span className="text-[10px] text-amber-600">花費</span>
            </div>
            <div className="bg-blue-50 rounded-md p-3 text-center">
              <span className="text-[16px] font-bold text-blue-700 block">
                {totalImpressions.toLocaleString()}
              </span>
              <span className="text-[10px] text-blue-600">曝光</span>
            </div>
            <div className="bg-purple-50 rounded-md p-3 text-center">
              <span className="text-[16px] font-bold text-purple-700 block">
                {totalClicks.toLocaleString()}
              </span>
              <span className="text-[10px] text-purple-600">點擊</span>
            </div>
            <div className="bg-green-50 rounded-md p-3 text-center">
              <span className="text-[16px] font-bold text-green-700 block">
                {totalConversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-green-600">轉換</span>
            </div>
          </div>

                          {googleCampaigns.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-[13px] font-semibold">Google Ads 活動</h5>
              <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">活動名稱</th>
                        <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">帳戶</th>
                        <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">類型</th>
                        <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">匹配網域</th>
                        <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">曝光</th>
                        <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">點擊</th>
                        <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">花費</th>
                        <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">轉換</th>
                        <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {googleCampaigns.map((c) => (
                        <tr
                          key={c.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => openGoogleCampaign(c)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openGoogleCampaign(c);
                            }
                          }}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                          title="開啟 Google Ads 活動詳情"
                        >
                          <td className="px-4 py-3">
                            <a
                              href={`#${buildGoogleAdsCampaignHash({
                                campaignKey: c.key,
                                preset,
                                from: dateFrom,
                                to: dateTo,
                              })}`}
                              className="text-[13px] font-medium text-teal-800 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {c.campaignName}
                            </a>
                            <div className="text-[11px] text-muted-foreground font-mono">{c.campaignId}</div>
                          </td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground">
                            <div>{c.accountName || c.customerId}</div>
                            <div className="text-[11px] font-mono">{c.customerId}</div>
                          </td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                            {c.channelType || '—'}
                          </td>
                          <td className="px-4 py-3 text-[12px]">
                            <div>{c.matchedDomain || '—'}</div>
                            {c.sampleFinalUrl && (
                              <a
                                href={c.sampleFinalUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[11px] text-teal-700 hover:underline inline-flex items-center gap-0.5 max-w-[200px] truncate"
                              >
                                {c.sampleFinalUrl}
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-right tabular-nums">{c.impressions.toLocaleString()}</td>
                          <td className="px-4 py-3 text-[12px] text-right tabular-nums">{c.clicks.toLocaleString()}</td>
                          <td className="px-4 py-3 text-[13px] text-right tabular-nums font-medium">{formatMoneyFromMicros(c.spendMicros)}</td>
                          <td className="px-4 py-3 text-[12px] text-right tabular-nums">
                            {c.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3">{adsApiStatusBadge(c.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {facebookCampaigns.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-[13px] font-semibold">Facebook Ads 活動</h5>
              <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">活動名稱</th>
                        <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">帳戶</th>
                        <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">目標</th>
                        <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">曝光</th>
                        <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">點擊</th>
                        <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">花費</th>
                        <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">轉換</th>
                        <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facebookCampaigns.map((c) => (
                        <tr
                          key={c.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => openFacebookCampaign(c)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openFacebookCampaign(c);
                            }
                          }}
                          className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                          title="開啟 Facebook Ads 活動詳情"
                        >
                          <td className="px-4 py-3">
                            <a
                              href={`#${buildFacebookAdsCampaignHash({
                                campaignKey: c.key,
                                ...dateQuery,
                              })}`}
                              className="text-[13px] font-medium text-teal-800 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {c.campaignName}
                            </a>
                            <div className="text-[11px] text-muted-foreground font-mono">{c.campaignId}</div>
                          </td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground">
                            <div>{c.accountName || c.adAccountId}</div>
                            <div className="text-[11px] font-mono">
                              {c.businessName ? `${c.businessName} · ` : ''}
                              {c.adAccountId}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                            {c.objective || '—'}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-right tabular-nums">{c.impressions.toLocaleString()}</td>
                          <td className="px-4 py-3 text-[12px] text-right tabular-nums">{c.clicks.toLocaleString()}</td>
                          <td className="px-4 py-3 text-[13px] text-right tabular-nums font-medium">{formatMoneyFromMicros(c.spendMicros)}</td>
                          <td className="px-4 py-3 text-[12px] text-right tabular-nums">
                            {c.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3">{adsApiStatusBadge(c.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}

// ============================================================
// SEO KEYWORDS TAB
// ============================================================
export function WebsiteSeoTab({ site }: { site: WebsiteProfileFull }) {
  const { keywords: allKeywords, loading, addKeyword, syncGsc, syncing } = useSeoKeywords();
  const keywords = useMemo(
    () => allKeywords.filter((k) => k.website_profile_id === site.id),
    [allKeywords, site.id],
  );
  const [showModal, setShowModal] = useState(false);
  const [newKeyword, setNewKeyword] = useState({ keyword: '', level: 'level_2', targetPage: '', targetRanking: '' });

  const handleSyncGsc = async () => {
    const r = await syncGsc();
    if (r.ok) {
      toast.success(`GSC 同步完成：${r.sitesSynced ?? 0} 站、${r.keywordsUpserted ?? 0} 關鍵字`);
    } else {
      toast.error(r.error || 'GSC 同步失敗');
    }
  };

  const level1 = keywords.filter(k => k.level === 'level_1');
  const level2 = keywords.filter(k => k.level === 'level_2');
  const level3 = keywords.filter(k => k.level === 'level_3');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">SEO 關鍵字</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">共 {keywords.length} 個關鍵字 — S1: {level1.length} | S2: {level2.length} | S3: {level3.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={syncing}
            onClick={handleSyncGsc}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            同步 GSC
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors">
            <Plus size={13} />新增關鍵字
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-[13px] flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" /> 載入中…
        </div>
      ) : keywords.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <TrendingUp size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未設定 SEO 關鍵字</p>
          <p className="text-[12px] text-muted-foreground mt-1">可手動新增，或按「同步 GSC」匯入查詢與排名資料（見 docs/gsc-setup.md）</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">關鍵字</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">等級</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">搜尋量</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">GSC 平均排名</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">目標排名</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">目標頁面</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">難度</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map(kw => {
                const levelCfg = seoLevelConfig[kw.level];
                const statusCfg = seoStatusConfig[kw.status];
                const currentRanking = kw.current_ranking;
                const targetRanking = kw.target_ranking;
                const searchVolume = kw.search_volume;
                const targetPage = kw.target_page;
                const difficultyScore = kw.difficulty_score;
                return (
                  <tr key={kw.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium">{kw.keyword}</span>
                        {kw.ai_generated && <Sparkles size={11} className="text-teal-600" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-sm border', levelCfg.bgColor, levelCfg.color, levelCfg.borderColor)}>{levelCfg.label}</span>
                    </td>
                    <td className="px-4 py-3 text-[13px]">{searchVolume?.toLocaleString() || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[13px] font-bold', currentRanking && currentRanking <= 5 ? 'text-teal-700' : currentRanking && currentRanking <= 10 ? 'text-amber-700' : 'text-slate-600')}>
                        {currentRanking != null ? `#${currentRanking}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px]">{targetRanking != null ? `#${targetRanking}` : '—'}</td>
                    <td className="px-4 py-3 text-[11px] text-teal-600 font-mono">{targetPage || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', (difficultyScore || 0) >= 70 ? 'bg-rose-500' : (difficultyScore || 0) >= 50 ? 'bg-amber-500' : 'bg-teal-500')} style={{ width: `${difficultyScore || 0}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground">{difficultyScore ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusFieldBadge config={statusCfg} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Keyword Modal */}
      {showModal && (
        <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[540px]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-[16px] font-bold">新增 SEO 關鍵字</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">關鍵字 *</label>
                <input value={newKeyword.keyword} onChange={e => setNewKeyword(p => ({ ...p, keyword: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="輸入關鍵字" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">等級</label>
                  <select value={newKeyword.level} onChange={e => setNewKeyword(p => ({ ...p, level: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                    <option value="level_1">S1 核心</option>
                    <option value="level_2">S2 重要</option>
                    <option value="level_3">S3 長尾</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">目標排名</label>
                  <input type="number" value={newKeyword.targetRanking} onChange={e => setNewKeyword(p => ({ ...p, targetRanking: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="e.g. 5" />
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">目標頁面</label>
                <input value={newKeyword.targetPage} onChange={e => setNewKeyword(p => ({ ...p, targetPage: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="/services/web-design" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
              <button
                onClick={async () => {
                  const { error } = await addKeyword({
                    website_profile_id: site.id,
                    keyword: newKeyword.keyword,
                    level: newKeyword.level as 'level_1' | 'level_2' | 'level_3',
                    target_page: newKeyword.targetPage || null,
                    target_ranking: newKeyword.targetRanking ? parseInt(newKeyword.targetRanking, 10) : null,
                  });
                  if (error) {
                    toast.error(error.message || '新增失敗');
                    return;
                  }
                  toast.success('已新增關鍵字');
                  setNewKeyword({ keyword: '', level: 'level_2', targetPage: '', targetRanking: '' });
                  setShowModal(false);
                }}
                disabled={!newKeyword.keyword}
                className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                新增關鍵字
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// EDM TAB
// ============================================================
export function WebsiteEdmTab({ site }: { site: WebsiteProfileFull }) {
  const [campaigns] = useState<EdmCampaign[]>(() => getEdmCampaignsForWebsite(site.id));
  const [showModal, setShowModal] = useState(false);
  const [newEdm, setNewEdm] = useState({ subject: '', campaignType: 'email', sendDate: '', recipientType: '' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">EDM 電郵/短訊管理</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">共 {campaigns.length} 個 EDM 活動</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors">
          <Plus size={13} />新增 EDM
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <Mail size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未有 EDM 記錄</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">主題</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">類型</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">發送日期</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">收件人數</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">開信率</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">點擊率</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">工時</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(edm => {
                const statusCfg = edmStatusConfig[edm.status];
                return (
                  <tr key={edm.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-[13px] font-medium max-w-[240px] truncate">{edm.subject}</td>
                    <td className="px-4 py-3"><span className={cn('text-[11px] px-1.5 py-0.5 rounded', edm.campaignType === 'email' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700')}>{edm.campaignType === 'email' ? '電郵' : '短訊'}</span></td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{edm.sendDate || '—'}</td>
                    <td className="px-4 py-3 text-[13px]">{edm.recipientCount?.toLocaleString() || '—'}</td>
                    <td className="px-4 py-3 text-[13px] font-medium">{edm.openRate ? `${edm.openRate}%` : '—'}</td>
                    <td className="px-4 py-3 text-[13px] font-medium">{edm.clickRate ? `${edm.clickRate}%` : '—'}</td>
                    <td className="px-4 py-3 text-[13px]">{edm.hoursSpent ? `${edm.hoursSpent}h` : '—'}</td>
                    <td className="px-4 py-3"><StatusFieldBadge config={statusCfg} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add EDM Modal */}
      {showModal && (
        <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[540px]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-[16px] font-bold">新增 EDM 活動</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-muted/30 rounded-md p-3 text-[12px] text-muted-foreground">
                公司：<span className="font-medium text-foreground">{displayText(site.company)}</span> · 品牌：<span className="font-medium text-foreground">{displayText(site.brand)}</span>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">主題 *</label>
                <input value={newEdm.subject} onChange={e => setNewEdm(p => ({ ...p, subject: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="EDM 主題" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">類型</label>
                  <select value={newEdm.campaignType} onChange={e => setNewEdm(p => ({ ...p, campaignType: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                    <option value="email">電郵</option>
                    <option value="sms">短訊</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">發送日期</label>
                  <input type="date" value={newEdm.sendDate} onChange={e => setNewEdm(p => ({ ...p, sendDate: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" />
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">收件人類別</label>
                <input value={newEdm.recipientType} onChange={e => setNewEdm(p => ({ ...p, recipientType: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="例如：全部訂閱者、VIP 會員" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
              <button onClick={() => setShowModal(false)} disabled={!newEdm.subject} className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed">新增 EDM</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PLUGINS TAB
// ============================================================
export function WebsitePluginsTab({ site }: { site: WebsiteProfileFull }) {
  const [plugins] = useState<Plugin[]>(() => getPluginsForWebsite(site.id));
  const [showModal, setShowModal] = useState(false);
  const [newPlugin, setNewPlugin] = useState({ pluginName: '', cost: '', billingCycle: 'monthly', expiryDate: '' });

  const isExpiringSoon = (expiryDate?: string) => {
    if (!expiryDate) return false;
    const diff = new Date(expiryDate).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000; // 30 days
  };

  const isExpired = (expiryDate?: string) => {
    if (!expiryDate) return false;
    return new Date(expiryDate).getTime() < Date.now();
  };

  const totalMonthlyCost = plugins.reduce((sum, p) => {
    if (p.status !== 'active' || p.cost === 0) return sum;
    if (p.billingCycle === 'monthly') return sum + p.cost;
    if (p.billingCycle === 'annual') return sum + p.cost / 12;
    return sum;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">插件/工具訂閱</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">共 {plugins.length} 個插件 · 每月約 ${totalMonthlyCost.toFixed(0)} USD</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors">
          <Plus size={13} />新增插件
        </button>
      </div>

      {plugins.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <Puzzle size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未新增任何插件</p>
        </div>
      ) : (
        <div className="space-y-2">
          {plugins.map(plugin => {
            const expiring = isExpiringSoon(plugin.expiryDate);
            const expired = isExpired(plugin.expiryDate) || plugin.status === 'expired';
            const billingLabels: Record<string, string> = { monthly: '月付', annual: '年付', one_time: '一次性', lifetime: '永久' };
            return (
              <div key={plugin.id} className={cn('flex items-center justify-between p-4 rounded-md border transition-all', expired ? 'border-rose-300 bg-rose-50/50' : expiring ? 'border-amber-300 bg-amber-50/30' : 'border-[rgba(13,26,45,0.08)] bg-white')}>
                <div className="flex items-center gap-3">
                  <Puzzle size={16} className={cn(expired ? 'text-rose-500' : expiring ? 'text-amber-500' : 'text-teal-600')} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{plugin.pluginName}</span>
                      {expired && <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><AlertTriangle size={9} />已過期</span>}
                      {expiring && !expired && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5"><AlertTriangle size={9} />即將到期</span>}
                    </div>
                    {plugin.description && <p className="text-[11px] text-muted-foreground mt-0.5">{plugin.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="text-[13px] font-bold block">{plugin.cost === 0 ? '免費' : `$${plugin.cost} ${plugin.currency}`}</span>
                    <span className="text-[10px] text-muted-foreground">{billingLabels[plugin.billingCycle]}{plugin.autoRenew ? ' · 自動續約' : ''}</span>
                  </div>
                  {plugin.expiryDate && (
                    <div className="text-right">
                      <span className={cn('text-[11px] font-medium', expired ? 'text-rose-600' : expiring ? 'text-amber-600' : 'text-muted-foreground')}>{plugin.expiryDate}</span>
                      <span className="text-[9px] text-muted-foreground block">到期日</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Plugin Modal */}
      {showModal && (
        <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[540px]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-[16px] font-bold">新增插件/工具</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-muted/30 rounded-md p-3 text-[12px] text-muted-foreground">
                公司：<span className="font-medium text-foreground">{displayText(site.company)}</span> · 品牌：<span className="font-medium text-foreground">{displayText(site.brand)}</span>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">插件名稱 *</label>
                <input value={newPlugin.pluginName} onChange={e => setNewPlugin(p => ({ ...p, pluginName: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="例如：Yoast SEO Premium" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">費用 (USD)</label>
                  <input type="number" value={newPlugin.cost} onChange={e => setNewPlugin(p => ({ ...p, cost: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="0" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">計費週期</label>
                  <select value={newPlugin.billingCycle} onChange={e => setNewPlugin(p => ({ ...p, billingCycle: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                    <option value="monthly">月付</option>
                    <option value="annual">年付</option>
                    <option value="one_time">一次性</option>
                    <option value="lifetime">永久</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">到期日</label>
                <input type="date" value={newPlugin.expiryDate} onChange={e => setNewPlugin(p => ({ ...p, expiryDate: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
              <button onClick={() => setShowModal(false)} disabled={!newPlugin.pluginName} className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed">新增插件</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// EXTERNAL LINKS TAB
// ============================================================
export function WebsiteLinksTab({ site }: { site: WebsiteProfileFull }) {
  const [links] = useState<ExternalLinkType[]>(() => getExternalLinksForWebsite(site.id));
  const [showModal, setShowModal] = useState(false);
  const [newLink, setNewLink] = useState({ label: '', url: '', linkType: 'other' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">外部連結</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">管理 Figma、GitHub、Staging 等開發相關連結</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors">
          <Plus size={13} />新增連結
        </button>
      </div>

      {links.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <Link2 size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未新增外部連結</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {links.map(link => {
            const typeCfg = linkTypeConfig[link.linkType] || linkTypeConfig.other;
            return (
              <div key={link.id} className="flex items-center justify-between p-4 bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] hover:shadow-[0_4px_12px_rgba(0,20,40,0.08)] transition-all group">
                <div className="flex items-center gap-3">
                  <span className="text-[18px]">{typeCfg.icon}</span>
                  <div>
                    <span className="text-[13px] font-medium block">{link.label}</span>
                    <span className={cn('text-[10px] font-medium', typeCfg.color)}>{typeCfg.label}</span>
                  </div>
                </div>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] text-teal-600 hover:underline opacity-80 group-hover:opacity-100 transition-opacity">
                  <ExternalLink size={12} />開啟
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Link Modal */}
      {showModal && (
        <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[480px]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-[16px] font-bold">新增外部連結</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">連結名稱 *</label>
                <input value={newLink.label} onChange={e => setNewLink(p => ({ ...p, label: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="例如：Figma 設計稿" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">URL *</label>
                <input value={newLink.url} onChange={e => setNewLink(p => ({ ...p, url: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="https://..." />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">連結類型</label>
                <select value={newLink.linkType} onChange={e => setNewLink(p => ({ ...p, linkType: e.target.value }))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                  <option value="figma">Figma</option>
                  <option value="github">GitHub</option>
                  <option value="staging">Staging</option>
                  <option value="dev">Dev URL</option>
                  <option value="analytics">Analytics</option>
                  <option value="cms">CMS</option>
                  <option value="documentation">Documentation</option>
                  <option value="other">其他</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
              <button onClick={() => setShowModal(false)} disabled={!newLink.label || !newLink.url} className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed">新增連結</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONTENT CALENDAR TAB
// ============================================================
export function WebsiteCalendarTab({ site }: { site: WebsiteProfileFull }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  // Collect all content with dates for this website
  const videos = getVideosForWebsite(site.id);
  const posts = getSocialPostsForWebsite(site.id);
  const edms = getEdmCampaignsForWebsite(site.id);

  interface CalendarEvent {
    id: string;
    title: string;
    date: string;
    type: 'article' | 'video' | 'social' | 'edm';
    color: string;
  }

  const events: CalendarEvent[] = [];

  // Videos
  videos.forEach(v => {
    if (v.publishDate) events.push({ id: v.id, title: v.title, date: v.publishDate, type: 'video', color: 'bg-blue-500' });
    if (v.shootDate) events.push({ id: `${v.id}-shoot`, title: `📹 ${v.title}`, date: v.shootDate, type: 'video', color: 'bg-blue-300' });
  });

  // Social posts
  posts.forEach(p => {
    const date = p.publishedDate || p.scheduledDate?.split('T')[0];
    if (date) events.push({ id: p.id, title: p.content.slice(0, 30), date, type: 'social', color: 'bg-purple-500' });
  });

  // EDM
  edms.forEach(e => {
    if (e.sendDate) events.push({ id: e.id, title: e.subject, date: e.sendDate, type: 'edm', color: 'bg-amber-500' });
  });

  // Calendar helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getEventsForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.date === dateStr);
  };

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const selectedEvents = selectedDay ? getEventsForDate(selectedDay) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">內容日曆</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">查看文章、影片、社交帖文的發佈計劃</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            <button onClick={() => setViewMode('month')} className={cn('px-3 py-1.5 text-[12px] font-medium', viewMode === 'month' ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted')}>月</button>
            <button onClick={() => setViewMode('week')} className={cn('px-3 py-1.5 text-[12px] font-medium', viewMode === 'week' ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted')}>週</button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500" /><span>影片</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-purple-500" /><span>社交帖文</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-amber-500" /><span>EDM</span></div>
      </div>

      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1.5 hover:bg-muted rounded transition-colors"><ChevronLeft size={16} /></button>
        <span className="text-[15px] font-bold">{year} 年 {monthNames[month]}</span>
        <button onClick={nextMonth} className="p-1.5 hover:bg-muted rounded transition-colors"><ChevronRight size={16} /></button>
      </div>

      {/* Calendar Grid */}
      <div className="border border-border rounded-md overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-muted/30 border-b border-border">
          {dayNames.map(d => (
            <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        {/* Days */}
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="border-b border-r border-border/50 h-20 bg-muted/10" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = getEventsForDate(day);
            const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
            const isSelected = selectedDay === day;
            return (
              <div
                key={day}
                onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                className={cn(
                  'border-b border-r border-border/50 h-20 p-1 cursor-pointer transition-all hover:bg-muted/20',
                  isSelected && 'bg-teal-50 ring-1 ring-teal-400',
                  isToday && 'bg-teal-50/50'
                )}
              >
                <span className={cn('text-[11px] font-medium block mb-0.5', isToday && 'text-teal-600 font-bold')}>{day}</span>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map(ev => (
                    <div key={ev.id} className={cn('h-1 rounded-full', ev.color)} title={ev.title} />
                  ))}
                  {dayEvents.length > 3 && <span className="text-[8px] text-muted-foreground">+{dayEvents.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Detail */}
      {selectedDay && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <h5 className="text-[14px] font-bold mb-3">{month + 1}/{selectedDay} 的內容</h5>
          {selectedEvents.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">當日無排定內容</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map(ev => {
                const typeLabels = { article: '文章', video: '影片', social: '社交', edm: 'EDM' };
                const typeColors = { article: 'bg-teal-50 text-teal-700', video: 'bg-blue-50 text-blue-700', social: 'bg-purple-50 text-purple-700', edm: 'bg-amber-50 text-amber-700' };
                return (
                  <div key={ev.id} className="flex items-center gap-2 p-2 bg-muted/20 rounded">
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', typeColors[ev.type])}>{typeLabels[ev.type]}</span>
                    <span className="text-[13px] truncate">{ev.title}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// BACKLINK TAB (反向連結)
// ============================================================
type BacklinkForm = {
  webSupplierId: string;
  costUsd: number;
  costHkd: number;
  brand?: BacklinkBrand;
  purchaseDate: string;
  quantity: number;
  notes: string;
};

const emptyBacklinkForm: BacklinkForm = {
  webSupplierId: '',
  costUsd: 0,
  costHkd: 0,
  brand: undefined,
  purchaseDate: '',
  quantity: 1,
  notes: '',
};

export function WebsiteBacklinkTab({ site }: { site: WebsiteProfileFull }) {
  const { brands } = useBrands();
  const { suppliers: webPageSuppliers } = useWebPageSuppliers();
  const {
    purchases: backlinkPurchases,
    addPurchase,
    updatePurchase,
    deletePurchase,
  } = useBacklinkPurchases();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState<BacklinkForm>(emptyBacklinkForm);
  const [editing, setEditing] = useState<BacklinkPurchase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BacklinkPurchase | null>(null);

  const supplierMap = useMemo(
    () => new Map(webPageSuppliers.map((s) => [s.id, s])),
    [webPageSuppliers],
  );

  const records = useMemo(
    () => backlinkPurchases.filter((p) => p.websiteProfileId === site.id),
    [backlinkPurchases, site.id],
  );
  const siteBrandLabel = brandLabelOf(brands, site.brandId) || site.brand || '';

  const stats = useMemo(() => {
    const totalQty = records.reduce((s, p) => s + p.quantity, 0);
    const usd = records.reduce((s, p) => s + p.costUsd, 0);
    const hkd = records.reduce((s, p) => s + p.costHkd, 0);
    return { count: records.length, totalQty, usd, hkd };
  }, [records]);

  const handleAdd = async () => {
    if (!form.webSupplierId || !form.purchaseDate || form.quantity < 1) return;
    const normalized = normalizeBacklinkCosts(form.costUsd, form.costHkd);
    const { error } = await addPurchase({
      websiteProfileId: site.id,
      webSupplierId: form.webSupplierId,
      costUsd: normalized.costUsd,
      costHkd: normalized.costHkd,
      brand: form.brand,
      purchaseDate: form.purchaseDate,
      quantity: form.quantity,
      notes: form.notes || undefined,
    });
    if (error) {
      toast.error(`新增失敗：${error.message}`);
      return;
    }
    setForm(emptyBacklinkForm);
    setShowAddModal(false);
  };

  const handleSaveEdit = async () => {
    if (!editing || !editing.webSupplierId || !editing.purchaseDate || editing.quantity < 1) return;
    const normalized = normalizeBacklinkCosts(editing.costUsd, editing.costHkd);
    const error = await updatePurchase(editing.id, {
      webSupplierId: editing.webSupplierId,
      costUsd: normalized.costUsd,
      costHkd: normalized.costHkd,
      brand: editing.brand,
      purchaseDate: editing.purchaseDate,
      quantity: editing.quantity,
      notes: editing.notes,
      websiteProfileId: site.id,
    });
    if (error) {
      toast.error(`更新失敗：${error.message}`);
      return;
    }
    setShowEditModal(false);
    setEditing(null);
  };

  const renderFields = (
    data: BacklinkForm | BacklinkPurchase,
    onChange: (next: BacklinkForm | BacklinkPurchase) => void,
  ) => {
    const supplier = data.webSupplierId ? supplierMap.get(data.webSupplierId) : undefined;
    return (
      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">網站（供應商網址）*</label>
          <Select value={data.webSupplierId} onValueChange={(val) => onChange({ ...data, webSupplierId: val })}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="從網頁供應商選擇" /></SelectTrigger>
            <SelectContent>
              {webPageSuppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.url}（{s.name}）</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {webPageSuppliers.length === 0 && (
            <p className="text-[11px] text-amber-600 mt-1">請先至「供應商 → 網頁供應商」新增名單</p>
          )}
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">供應商</label>
          <Input value={supplier?.name || ''} readOnly className="h-9 text-[13px] bg-muted/40" placeholder="選擇後自動帶出" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">費用 USD</label>
            <Input type="number" min={0} value={data.costUsd || ''} onChange={(e) => onChange({ ...data, costUsd: parseFloat(e.target.value) || 0 })} className="h-9 text-[13px]" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">費用 HKD</label>
            <Input type="number" min={0} step="0.01" value={data.costHkd || ''} onChange={(e) => onChange({ ...data, costHkd: parseFloat(e.target.value) || 0 })} className="h-9 text-[13px]" />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">品牌</label>
          <Select value={data.brand || '__none__'} onValueChange={(val) => onChange({ ...data, brand: val === '__none__' ? undefined : (val as BacklinkBrand) })}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇品牌" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">未指定</SelectItem>
              {BACKLINK_BRANDS.map((brand) => (
                <SelectItem key={brand} value={brand}>{brand}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">購買日期 *</label>
            <Input type="date" value={data.purchaseDate} onChange={(e) => onChange({ ...data, purchaseDate: e.target.value })} className="h-9 text-[13px]" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">反向連結數量 *</label>
            <Input type="number" min={1} value={data.quantity} onChange={(e) => onChange({ ...data, quantity: parseInt(e.target.value, 10) || 0 })} className="h-9 text-[13px]" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">反向連結</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">此網站購買的反向連結紀錄</p>
        </div>
        <button
          onClick={() => { setForm(emptyBacklinkForm); setShowAddModal(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
        >
          <Plus size={13} />新增購買
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-3 py-2">
          <span className="text-[11px] text-muted-foreground">筆數</span>
          <p className="text-[16px] font-bold">{stats.count}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-3 py-2">
          <span className="text-[11px] text-muted-foreground">總連結數</span>
          <p className="text-[16px] font-bold">{stats.totalQty}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-3 py-2">
          <span className="text-[11px] text-muted-foreground">USD</span>
          <p className="text-[16px] font-bold">${stats.usd.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-3 py-2">
          <span className="text-[11px] text-muted-foreground">HKD</span>
          <p className="text-[16px] font-bold">${stats.hkd.toLocaleString()}</p>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <Link2 size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未新增反向連結</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">品牌</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">供應商網址</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">供應商</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">費用 USD</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">費用 HKD</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">購買日期</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">數量</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">備註</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const supplier = supplierMap.get(record.webSupplierId);
                return (
                  <tr key={record.id} className="border-t border-border/50 hover:bg-muted/10">
                    <td className="px-4 py-3">
                      <BrandFieldBadge value={siteBrandLabel} />
                    </td>
                    <td className="px-4 py-3 break-all">{supplier?.url || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{supplier?.name || '—'}</td>
                    <td className="px-4 py-3 tabular-nums">{formatBacklinkUsd(record.costUsd)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatBacklinkHkd(record.costHkd)}</td>
                    <td className="px-4 py-3">{record.purchaseDate}</td>
                    <td className="px-4 py-3">{record.quantity}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[240px]">
                      <span className="line-clamp-2 break-words" title={record.notes || undefined}>
                        {record.notes || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditing({ ...record }); setShowEditModal(true); }} className="p-1 hover:bg-muted rounded" title="編輯">
                          <Edit size={12} className="text-teal-600" />
                        </button>
                        <button onClick={() => setDeleteTarget(record)} className="p-1 hover:bg-muted rounded" title="刪除">
                          <Trash2 size={12} className="text-rose-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增反向連結購買" size="lg">
        {renderFields(form, (next) => setForm(next as BacklinkForm))}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAdd}>新增</Button>
        </div>
      </CrudModal>

      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯反向連結購買" size="lg">
        {editing && renderFields(editing, (next) => setEditing(next as BacklinkPurchase))}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSaveEdit}>儲存</Button>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            void deletePurchase(deleteTarget.id).then((error) => {
              if (error) toast.error(`刪除失敗：${error.message}`);
            });
          }
          setDeleteTarget(null);
        }}
        itemName={supplierMap.get(deleteTarget?.webSupplierId || '')?.name || '反向連結紀錄'}
        canDelete
        reasons={[]}
      />
    </div>
  );
}

// ============================================================
// GOOGLE BUSINESS TAB
// ============================================================
type GbForm = Omit<GoogleBusinessRegistration, 'id' | 'websiteProfileId'>;

const emptyGbForm: GbForm = { url: '', registeredAt: '', content: '' };

export function WebsiteGoogleBusinessTab({ site }: { site: WebsiteProfileFull }) {
  const {
    registrations: googleBusinessRegistrations,
    addRegistration,
    updateRegistration,
    deleteRegistration,
  } = useGoogleBusinessRegistrations();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState<GbForm>(emptyGbForm);
  const [editing, setEditing] = useState<GoogleBusinessRegistration | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GoogleBusinessRegistration | null>(null);

  const records = useMemo(
    () => googleBusinessRegistrations.filter((r) => r.websiteProfileId === site.id),
    [googleBusinessRegistrations, site.id],
  );

  const handleAdd = async () => {
    if (!form.url.trim() || !form.registeredAt || !form.content.trim()) return;
    const { error } = await addRegistration({ ...form, websiteProfileId: site.id });
    if (error) {
      toast.error(`新增失敗：${error.message}`);
      return;
    }
    setForm(emptyGbForm);
    setShowAddModal(false);
  };

  const handleSaveEdit = async () => {
    if (!editing || !editing.url.trim() || !editing.registeredAt || !editing.content.trim()) return;
    const error = await updateRegistration(editing.id, {
      url: editing.url,
      registeredAt: editing.registeredAt,
      content: editing.content,
      websiteProfileId: site.id,
    });
    if (error) {
      toast.error(`更新失敗：${error.message}`);
      return;
    }
    setShowEditModal(false);
    setEditing(null);
  };

  const renderFields = (
    data: GbForm | GoogleBusinessRegistration,
    onChange: (next: GbForm | GoogleBusinessRegistration) => void,
  ) => (
    <div className="space-y-4">
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">Google Business 網址 *</label>
        <Input
          value={data.url}
          onChange={(e) => onChange({ ...data, url: e.target.value })}
          className="h-9 text-[13px]"
          placeholder="https://g.page/... 或 maps 連結"
        />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">登記日期 *</label>
        <Input
          type="date"
          value={data.registeredAt}
          onChange={(e) => onChange({ ...data, registeredAt: e.target.value })}
          className="h-9 text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">登記內容 *</label>
        <textarea
          value={data.content}
          onChange={(e) => onChange({ ...data, content: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none bg-white"
          rows={4}
          placeholder="業務資訊、地址、營業時間等"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">Google Business</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">此網站已登記的 Google Business 檔案</p>
        </div>
        <button
          onClick={() => { setForm(emptyGbForm); setShowAddModal(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
        >
          <Plus size={13} />新增登記
        </button>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-3 py-2 w-fit">
        <span className="text-[11px] text-muted-foreground">登記筆數</span>
        <p className="text-[16px] font-bold">{records.length}</p>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <MapPin size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未登記 Google Business</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Google Business 網址</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">登記日期</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">登記內容</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-t border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-3">
                    <a
                      href={record.url.startsWith('http') ? record.url : `https://${record.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-teal-600 hover:underline inline-flex items-center gap-1 break-all"
                    >
                      {record.url}
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{record.registeredAt}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[320px]">
                    {record.content.length > 80 ? `${record.content.slice(0, 80)}…` : record.content}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditing({ ...record }); setShowEditModal(true); }} className="p-1 hover:bg-muted rounded" title="編輯">
                        <Edit size={12} className="text-teal-600" />
                      </button>
                      <button onClick={() => setDeleteTarget(record)} className="p-1 hover:bg-muted rounded" title="刪除">
                        <Trash2 size={12} className="text-rose-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增 Google Business 登記" size="lg">
        {renderFields(form, (next) => setForm(next as GbForm))}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAdd}>新增</Button>
        </div>
      </CrudModal>

      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯 Google Business 登記" size="lg">
        {editing && renderFields(editing, (next) => setEditing(next as GoogleBusinessRegistration))}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSaveEdit}>儲存</Button>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            void deleteRegistration(deleteTarget.id).then((error) => {
              if (error) toast.error(`刪除失敗：${error.message}`);
            });
          }
          setDeleteTarget(null);
        }}
        itemName={deleteTarget?.url || ''}
        canDelete
        reasons={[]}
      />
    </div>
  );
}
