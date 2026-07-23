import { useState, useMemo } from 'react';
import { Plus, Search, ExternalLink, Globe, Facebook, Instagram, BookOpen, X, Eye, Clock, Link2, ArrowLeft, Edit, Trash2, Calendar, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SocialPost } from '@/types/app';
import { useDataStore } from '@/context/DataStore';
import { useSocialPosts } from '@/hooks/useSocialPosts';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectCategoryBadge, getProjectCategory } from '@/components/ui/project-category-badge';
import { projects as allProjectsData } from '@/data/mockData';
import { websiteProfiles } from '@/data/websiteData';

const platformConfig: Record<string, { label: string; icon: any; color: string; bg: string; borderColor: string }> = {
  facebook: { label: 'Facebook', icon: Facebook, color: 'text-blue-600', bg: 'bg-blue-50', borderColor: 'border-blue-200' },
  instagram: { label: 'Instagram', icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-50', borderColor: 'border-pink-200' },
  xiaohongshu: { label: '小紅書', icon: BookOpen, color: 'text-red-600', bg: 'bg-red-50', borderColor: 'border-red-200' },
  linkedin: { label: 'LinkedIn', icon: Globe, color: 'text-blue-700', bg: 'bg-blue-50', borderColor: 'border-blue-200' },
  youtube: { label: 'YouTube', icon: Globe, color: 'text-red-600', bg: 'bg-red-50', borderColor: 'border-red-200' },
  tiktok: { label: 'TikTok', icon: Globe, color: 'text-gray-800', bg: 'bg-gray-50', borderColor: 'border-gray-200' },
  twitter: { label: 'Twitter/X', icon: Globe, color: 'text-sky-600', bg: 'bg-sky-50', borderColor: 'border-sky-200' },
  other: { label: '其他', icon: Globe, color: 'text-gray-600', bg: 'bg-gray-50', borderColor: 'border-gray-200' },
};

// Predefined topics v2.3
const topicOptions = [
  '品牌形象', '產品推廣', '節日活動', '客戶案例', '教學內容',
  '行業趨勢', '公司動態', '優惠推廣', '互動活動', '品牌故事',
];

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: '草稿', color: 'text-slate-700', bg: 'bg-slate-100' },
  scheduled: { label: '已排程', color: 'text-amber-700', bg: 'bg-amber-100' },
  published: { label: '已發佈', color: 'text-teal-700', bg: 'bg-teal-100' },
  archived: { label: '已歸檔', color: 'text-gray-600', bg: 'bg-gray-100' },
};

const postTypeLabels: Record<string, string> = {
  image: '圖片',
  video: '影片',
  carousel: '輪播',
  story: 'Story',
  reel: 'Reel',
};

function getPostProjectCategory(websiteName: string) {
  const ws = websiteProfiles.find(w => w.websiteName === websiteName);
  return getProjectCategory(ws?.projectId, allProjectsData);
}

// Social Post Detail Page with Tabs
function SocialPostDetail({ post, onBack }: { post: any; onBack: () => void }) {
  const { websites } = useDataStore();
  const [activeTab, setActiveTab] = useState<'info' | 'websites' | 'projects' | 'performance'>('info');
  const [linkedWebsites, setLinkedWebsites] = useState<string[]>(
    post.websiteName ? [post.websiteName] : []
  );
  const [linkedProjects, setLinkedProjects] = useState<string[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showEditMode, setShowEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const pConfig = platformConfig[post.platform] || platformConfig.other;
  const sConfig = statusConfig[post.status] || statusConfig.draft;
  const PlatformIcon = pConfig.icon;

  const tabs = [
    { id: 'info', label: '基本資訊' },
    { id: 'websites', label: '關聯網站' },
    { id: 'projects', label: '關聯項目' },
    { id: 'performance', label: '表現數據' },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">
          <ArrowLeft size={14} /> 返回社交媒體列表
        </button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-[12px]" onClick={() => setShowEditMode(true)}>
            <Edit size={12} /> 編輯
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-[12px] text-rose-500 border-rose-200 hover:bg-rose-50" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 size={12} /> 刪除
          </Button>
        </div>
      </div>

      {/* Context Bar */}
      <div className="bg-slate-50 rounded-md border border-slate-200 p-3 flex items-center gap-4 text-[12px] text-muted-foreground">
        <ProjectCategoryBadge category={getPostProjectCategory(post.websiteName).category} clientName={getPostProjectCategory(post.websiteName).clientName} />
        <span className="font-medium text-foreground">所屬公司:</span> {post.company}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">品牌:</span> {post.brand}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">平台:</span>
        <span className={cn('flex items-center gap-1', pConfig.color)}>
          <PlatformIcon size={12} /> {pConfig.label}
        </span>
        <span className="mx-1">•</span>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>
          {sConfig.label}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border gap-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-[1px]',
              activeTab === tab.id
                ? 'text-teal-600 border-teal-600'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Basic Info */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
              <h3 className="text-[16px] font-bold mb-4">帖文內容</h3>
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{post.content || '（無內容）'}</p>
              {post.tags && post.tags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-4">
                  {post.tags.map((tag: string) => (
                    <span key={tag} className="text-[10px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
              <h3 className="text-[14px] font-bold mb-3">基本資料</h3>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">帖文類型</span>
                  <span>{postTypeLabels[post.postType] || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">發佈日期</span>
                  <span>{post.publishedDate || post.scheduledDate || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">花費工時</span>
                  <span>{post.hoursSpent ? `${post.hoursSpent}h` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">帖文連結</span>
                  {post.postUrl ? (
                    <a href="#" className="text-teal-600 hover:underline flex items-center gap-1">
                      <ExternalLink size={10} /> 查看
                    </a>
                  ) : <span>—</span>}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">所屬網站</span>
                  <span className="text-teal-600">{post.websiteName || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Linked Websites */}
      {activeTab === 'websites' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-bold">關聯網站（{linkedWebsites.length}）</h3>
            <button
              onClick={() => setShowLinkModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
            >
              <Link2 size={12} /> 管理關聯
            </button>
          </div>
          {linkedWebsites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-[13px]">尚未關聯任何網站，點擊右上角「管理關聯」新增</div>
          ) : (
            <div className="space-y-2">
              {linkedWebsites.map(ws => (
                <div key={ws} className="flex items-center justify-between text-[13px] bg-muted/30 rounded px-4 py-3 border border-border/50">
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="text-teal-600" />
                    <span className="font-medium">{ws}</span>
                  </div>
                  <button onClick={() => setLinkedWebsites(prev => prev.filter(w => w !== ws))} className="text-muted-foreground hover:text-red-500 p-1">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Linked Projects */}
      {activeTab === 'projects' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-bold">關聯項目（{linkedProjects.length}）</h3>
            <button
              onClick={() => setShowProjectModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
            >
              <Link2 size={12} /> 關聯項目
            </button>
          </div>
          {linkedProjects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-[13px]">尚未關聯任何項目</div>
          ) : (
            <div className="space-y-2">
              {linkedProjects.map(pj => (
                <div key={pj} className="flex items-center justify-between text-[13px] bg-muted/30 rounded px-4 py-3 border border-border/50">
                  <span className="font-medium">{pj}</span>
                  <button onClick={() => setLinkedProjects(prev => prev.filter(p => p !== pj))} className="text-muted-foreground hover:text-red-500 p-1">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Performance Data */}
      {activeTab === 'performance' && (
        <div className="space-y-4">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[16px] font-bold mb-4">互動數據</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/20 rounded-md">
                <p className="text-[24px] font-bold text-teal-600">{post.engagementData?.likes || 0}</p>
                <span className="text-[12px] text-muted-foreground">讚好</span>
              </div>
              <div className="text-center p-4 bg-muted/20 rounded-md">
                <p className="text-[24px] font-bold text-blue-600">{post.engagementData?.comments || 0}</p>
                <span className="text-[12px] text-muted-foreground">留言</span>
              </div>
              <div className="text-center p-4 bg-muted/20 rounded-md">
                <p className="text-[24px] font-bold text-purple-600">{post.engagementData?.shares || 0}</p>
                <span className="text-[12px] text-muted-foreground">分享</span>
              </div>
              <div className="text-center p-4 bg-muted/20 rounded-md">
                <p className="text-[24px] font-bold text-amber-600">{post.engagementData?.reach || 0}</p>
                <span className="text-[12px] text-muted-foreground">觸及</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[16px] font-bold mb-4">互動率分析</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 border border-border rounded-md">
                <p className="text-[18px] font-bold">
                  {post.engagementData?.reach ? ((post.engagementData?.likes + post.engagementData?.comments) / post.engagementData?.reach * 100).toFixed(2) : '0.00'}%
                </p>
                <span className="text-[11px] text-muted-foreground">互動率</span>
              </div>
              <div className="text-center p-3 border border-border rounded-md">
                <p className="text-[18px] font-bold">
                  {post.engagementData?.reach ? (post.engagementData?.shares / post.engagementData?.reach * 100).toFixed(2) : '0.00'}%
                </p>
                <span className="text-[11px] text-muted-foreground">分享率</span>
              </div>
              <div className="text-center p-3 border border-border rounded-md">
                <p className="text-[18px] font-bold">
                  {post.engagementData?.reach ? (post.engagementData?.comments / post.engagementData?.reach * 100).toFixed(2) : '0.00'}%
                </p>
                <span className="text-[11px] text-muted-foreground">留言率</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Website Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowLinkModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-[480px] max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold">選擇關聯網站（可多選）</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              {websites.map(wp => (
                <label key={wp.id} className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-muted/30 cursor-pointer transition-colors duration-200">
                  <input
                    type="checkbox"
                    checked={linkedWebsites.includes(wp.websiteName)}
                    onChange={(e) => {
                      if (e.target.checked) setLinkedWebsites(prev => [...prev, wp.websiteName]);
                      else setLinkedWebsites(prev => prev.filter(w => w !== wp.websiteName));
                    }}
                    className="rounded border-border text-teal-600 focus:ring-teal-600"
                  />
                  <div>
                    <p className="text-[13px] font-medium">{wp.websiteName}</p>
                    <p className="text-[11px] text-muted-foreground">{wp.company} / {wp.brand}</p>
                  </div>
                </label>
              ))}
            </div>
            <button onClick={() => setShowLinkModal(false)} className="mt-4 w-full py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200">
              確認
            </button>
          </div>
        </div>
      )}

      {/* Link Project Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowProjectModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-[480px] max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold">選擇關聯項目（可多選）</h3>
              <button onClick={() => setShowProjectModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground">可從項目列表中選擇關聯的項目。</p>
            </div>
            <button onClick={() => setShowProjectModal(false)} className="mt-4 w-full py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200">
              確認
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-[400px]">
            <h3 className="text-[16px] font-bold mb-2">確認刪除</h3>
            <p className="text-[13px] text-muted-foreground mb-4">確認要刪除此帖文嗎？此操作無法撤銷。</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
              <Button size="sm" className="bg-rose-500 hover:bg-rose-600 text-white" onClick={() => { setShowDeleteConfirm(false); onBack(); }}>刪除</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toDateOnly(value?: string): string | undefined {
  if (!value) return undefined;
  return value.substring(0, 10);
}

// Main Social Posts Module
export function SocialPostsModule() {
  const { websites } = useDataStore();
  const { posts, addPost, updatePost, deletePost } = useSocialPosts();
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTopic, setFilterTopic] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'internal' | 'client'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [newPost, setNewPost] = useState({ websiteProfileId: '', platform: 'facebook' as any, postType: 'image' as any, content: '', topic: '', status: 'draft' as any, hoursSpent: 0, scheduledDate: '', reportDate: '', asanaLink: '', outputLink: '' });
  const [newPostPlatforms, setNewPostPlatforms] = useState<string[]>(['facebook']);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);

  const siteMap = useMemo(() => new Map(websites.map(w => [w.id, w])), [websites]);

  const allSocialPostsList = useMemo(
    () =>
      posts.map(p => {
        const site = siteMap.get(p.websiteProfileId);
        return {
          ...p,
          websiteName: site?.websiteName || p.websiteProfileId,
          company: site?.company || '',
          brand: site?.brand || '',
        };
      }),
    [posts, siteMap],
  );

  // Gather all unique topics for filter
  const allTopics = useMemo(() => {
    const set = new Set<string>();
    allSocialPostsList.forEach(p => { if ((p as any).topic) set.add((p as any).topic); });
    topicOptions.forEach(t => set.add(t));
    return Array.from(set).sort();
  }, [allSocialPostsList]);

  const allPosts = allSocialPostsList;

  const filteredPosts = allPosts.filter((post) => {
    if (filterPlatform !== 'all') {
      const postPlatforms: string[] = (post as any).platforms || [post.platform];
      if (!postPlatforms.includes(filterPlatform)) return false;
    }
    if (filterStatus !== 'all' && post.status !== filterStatus) return false;
    if (filterTopic !== 'all' && (post as any).topic !== filterTopic) return false;
    if (categoryFilter !== 'all') {
      const { category } = getPostProjectCategory(post.websiteName || '');
      if (category !== categoryFilter) return false;
    }
    if (searchQuery && !post.content?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const publishedCount = allPosts.filter(p => p.status === 'published').length;
  const scheduledCount = allPosts.filter(p => p.status === 'scheduled').length;
  const totalHours = allPosts.reduce((sum, p) => sum + (p.hoursSpent || 0), 0);

  if (selectedPost) {
    return <SocialPostDetail post={selectedPost} onBack={() => setSelectedPost(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">帖文總數</span>
          <p className="text-[18px] font-bold">{allPosts.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">已發佈</span>
          <p className="text-[18px] font-bold text-teal-600">{publishedCount}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">已排程</span>
          <p className="text-[18px] font-bold text-amber-600">{scheduledCount}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">總工時</span>
          <p className="text-[18px] font-bold">{totalHours}h</p>
        </div>
      </div>

      {/* Category Quick Switch */}
      <div className="flex items-center gap-1.5">
        {(['all', 'internal', 'client'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
              categoryFilter === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {cat === 'all' ? '全部' : cat === 'internal' ? '內部項目' : '客戶項目'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜尋帖文..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <select
          value={filterPlatform}
          onChange={e => setFilterPlatform(e.target.value)}
          className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
        >
          <option value="all">全部平台</option>
          {Object.entries(platformConfig).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
        >
          <option value="all">全部狀態</option>
          {Object.entries(statusConfig).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <select
          value={filterTopic}
          onChange={e => setFilterTopic(e.target.value)}
          className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
        >
          <option value="all">全部主題</option>
          {allTopics.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button onClick={() => { setWizardStep(1); setShowAddModal(true); }} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
          <Plus size={12} /> 新增帖文
        </button>
      </div>

      {/* Posts Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">平台</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">主題</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">內容</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">項目類型</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">公司 / 品牌</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">工時</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">日期</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredPosts.map((post) => {
              const postPlatforms: string[] = (post as any).platforms || [post.platform];
              const sConfig = statusConfig[post.status] || statusConfig.draft;
              return (
                <tr key={post.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {postPlatforms.slice(0, 3).map((p) => {
                        const cfg = platformConfig[p] || platformConfig.other;
                        const PIcon = cfg.icon;
                        return (
                          <span key={p} className={cn('flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border', cfg.bg, cfg.color, cfg.borderColor)}>
                            <PIcon size={9} /> {cfg.label}
                          </span>
                        );
                      })}
                      {postPlatforms.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{postPlatforms.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {(post as any).topic ? (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-0.5">
                        <Tag size={9} /> {(post as any).topic}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[13px] font-medium truncate block max-w-[180px]">{post.content?.substring(0, 35) || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <ProjectCategoryBadge category={getPostProjectCategory(post.websiteName).category} clientName={getPostProjectCategory(post.websiteName).clientName} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{post.company} / {post.brand}</td>
                  <td className="px-4 py-3">{post.hoursSpent ? `${post.hoursSpent}h` : '—'}</td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{post.publishedDate || post.scheduledDate || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>{sConfig.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedPost(post)}
                        className="text-[11px] text-teal-600 hover:underline flex items-center gap-1"
                      >
                        <Eye size={10} /> 詳情
                      </button>
                      <button
                        onClick={() => { setEditingPost(post); setShowEditModal(true); }}
                        className="p-1 hover:bg-muted rounded transition-colors"
                      >
                        <Edit size={10} className="text-teal-600" />
                      </button>
                      <button
                        onClick={() => { setDeleteTarget(post); setShowDeleteModal(true); }}
                        className="p-1 hover:bg-muted rounded transition-colors"
                      >
                        <Trash2 size={10} className="text-rose-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredPosts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">沒有符合條件的帖文</div>
      )}

      {/* Add Modal — Wizard Style v2.3 */}
      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增社交媒體帖文" size="lg">
        <div className="space-y-5">
          {/* Wizard Steps */}
          <div className="flex items-center gap-2 mb-2">
            {(['主題', '內容', '平台選擇', '排程預覽'] as const).map((label, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold',
                  wizardStep === (i + 1) ? 'bg-teal-600 text-white' : wizardStep > (i + 1) ? 'bg-teal-100 text-teal-700' : 'bg-muted text-muted-foreground'
                )}>
                  {i + 1}
                </div>
                <span className={cn('text-[12px]', wizardStep === (i + 1) ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{label}</span>
                {i < 3 && <div className="w-6 h-[1px] bg-border" />}
              </div>
            ))}
          </div>

          {/* Step 1: Topic & Website */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬網站 *</label>
                <Select value={newPost.websiteProfileId} onValueChange={(val) => setNewPost({ ...newPost, websiteProfileId: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇網站" /></SelectTrigger>
                  <SelectContent>{websites.map(w => <SelectItem key={w.id} value={w.id}>{w.websiteName} ({w.company}/{w.brand})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1.5 flex items-center gap-1">
                  <Tag size={12} className="text-purple-500" /> 主題標籤
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {topicOptions.map(t => (
                    <button
                      key={t}
                      onClick={() => setNewPost(prev => ({ ...prev, topic: prev.topic === t ? '' : t }))}
                      className={cn(
                        'text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors duration-200',
                        newPost.topic === t
                          ? 'bg-purple-100 text-purple-700 border-purple-300'
                          : 'bg-white text-muted-foreground border-border hover:border-purple-200 hover:text-purple-600'
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <Input
                  value={newPost.topic}
                  onChange={(e) => setNewPost({ ...newPost, topic: e.target.value })}
                  placeholder="或自行輸入主題..."
                  className="h-9 text-[13px]"
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">帖文類型</label>
                <Select value={newPost.postType} onValueChange={(val: any) => setNewPost({ ...newPost, postType: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(postTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Content */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">帖文內容 *</label>
                <textarea
                  value={newPost.content}
                  onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none"
                  rows={5}
                  placeholder="輸入帖文內容..."
                />
                <p className="text-[11px] text-muted-foreground mt-1">{newPost.content.length} 字</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1"><Clock size={12} className="inline mr-1 text-teal-500" />工時 (h)</label>
                  <Input type="number" step={0.5} value={newPost.hoursSpent} onChange={(e) => setNewPost({ ...newPost, hoursSpent: parseFloat(e.target.value) || 0 })} className="h-9 text-[13px]" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1"><ExternalLink size={12} className="inline mr-1 text-teal-500" />Asana 連結</label>
                  <Input value={newPost.asanaLink} onChange={(e) => setNewPost({ ...newPost, asanaLink: e.target.value })} className="h-9 text-[13px]" placeholder="https://app.asana.com/..." />
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1"><Link2 size={12} className="inline mr-1 text-teal-500" />成果連結</label>
                <Input value={newPost.outputLink} onChange={(e) => setNewPost({ ...newPost, outputLink: e.target.value })} className="h-9 text-[13px]" placeholder="https://..." />
              </div>
            </div>
          )}

          {/* Step 3: Multi-Platform Selection */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-2">選擇發佈平台（可多選）*</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(platformConfig).filter(([k]) => k !== 'other').map(([key, config]) => {
                    const Icon = config.icon;
                    const isSelected = newPostPlatforms.includes(key);
                    return (
                      <label
                        key={key}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all duration-200',
                          isSelected
                            ? `${config.bg} ${config.borderColor} border-2`
                            : 'border-border hover:border-teal-200 hover:bg-muted/20'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setNewPostPlatforms(prev =>
                              prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
                            );
                          }}
                          className="rounded border-border text-teal-600 focus:ring-teal-600"
                        />
                        <Icon size={16} className={config.color} />
                        <span className={cn('text-[13px] font-medium', isSelected ? config.color : 'text-foreground')}>
                          {config.label}
                        </span>
                        {isSelected && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {key === 'instagram' || key === 'xiaohongshu' ? '1:1' : '16:9'}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {newPostPlatforms.length === 0 && (
                  <p className="text-[11px] text-rose-500 mt-1">請至少選擇一個平台</p>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Schedule & Preview */}
          {wizardStep === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">排程日期</label>
                  <Input type="datetime-local" value={newPost.scheduledDate} onChange={(e) => setNewPost({ ...newPost, scheduledDate: e.target.value })} className="h-9 text-[13px]" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1"><Calendar size={12} className="inline mr-1 text-teal-500" />日報日期</label>
                  <Input type="date" value={newPost.reportDate} onChange={(e) => setNewPost({ ...newPost, reportDate: e.target.value })} className="h-9 text-[13px]" />
                </div>
              </div>
              {/* Preview */}
              <div className="bg-muted/20 rounded-md p-4 border border-border">
                <h4 className="text-[13px] font-bold mb-3">帖文預覽</h4>
                <div className="space-y-2 text-[12px]">
                  <div className="flex gap-2"><span className="text-muted-foreground w-16">主題:</span><span className="font-medium">{newPost.topic || '—'}</span></div>
                  <div className="flex gap-2"><span className="text-muted-foreground w-16">內容:</span><span className="font-medium line-clamp-2">{newPost.content || '—'}</span></div>
                  <div className="flex gap-2 items-center">
                    <span className="text-muted-foreground w-16">平台:</span>
                    <div className="flex gap-1 flex-wrap">
                      {newPostPlatforms.map(p => {
                        const cfg = platformConfig[p] || platformConfig.other;
                        const Icon = cfg.icon;
                        return (
                          <span key={p} className={cn('flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border', cfg.bg, cfg.color, cfg.borderColor)}>
                            <Icon size={9} /> {cfg.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2"><span className="text-muted-foreground w-16">排程:</span><span>{newPost.scheduledDate || '即時發佈'}</span></div>
                </div>
              </div>
              {/* Platform format differences */}
              <div>
                <h4 className="text-[12px] font-medium text-muted-foreground mb-2">各平台格式差異</h4>
                <div className="grid grid-cols-3 gap-2">
                  {newPostPlatforms.slice(0, 6).map(p => {
                    const cfg = platformConfig[p] || platformConfig.other;
                    const Icon = cfg.icon;
                    const isSquare = p === 'instagram' || p === 'xiaohongshu';
                    return (
                      <div key={p} className={cn('border rounded-md p-2', cfg.borderColor)}>
                        <div className="flex items-center gap-1 mb-1.5">
                          <Icon size={10} className={cfg.color} />
                          <span className="text-[10px] font-medium">{cfg.label}</span>
                        </div>
                        <div className={cn('bg-muted/30 rounded flex items-center justify-center text-[9px] text-muted-foreground', isSquare ? 'aspect-square' : 'aspect-video')}>
                          {isSquare ? '1:1' : '16:9'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4 border-t border-border">
            <div>
              {wizardStep > 1 && (
                <Button variant="outline" onClick={() => setWizardStep((wizardStep - 1) as any)}>
                  上一步
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
              {wizardStep < 4 ? (
                <Button
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={() => setWizardStep((wizardStep + 1) as any)}
                  disabled={
                    (wizardStep === 1 && !newPost.websiteProfileId) ||
                    (wizardStep === 2 && !newPost.content) ||
                    (wizardStep === 3 && newPostPlatforms.length === 0)
                  }
                >
                  下一步
                </Button>
              ) : (
                <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => {
                  void (async () => {
                    if (!(newPost.websiteProfileId && newPost.content && newPostPlatforms.length > 0)) return;
                    const scheduledDate = toDateOnly(newPost.scheduledDate);
                    const publishedDate = newPost.status === 'published' ? (scheduledDate || new Date().toISOString().slice(0, 10)) : undefined;
                    const { error } = await addPost({
                      websiteProfileId: newPost.websiteProfileId,
                      platform: newPostPlatforms[0] as any,
                      platforms: newPostPlatforms,
                      postType: newPost.postType,
                      content: newPost.content,
                      topic: newPost.topic || undefined,
                      status: newPost.status,
                      hoursSpent: newPost.hoursSpent || undefined,
                      scheduledDate,
                      publishedDate,
                      postUrl: newPost.outputLink || undefined,
                    });
                    if (error) {
                      toast.error(`新增失敗：${error.message}`);
                      return;
                    }
                    setNewPost({ websiteProfileId: '', platform: 'facebook', postType: 'image', content: '', topic: '', status: 'draft', hoursSpent: 0, scheduledDate: '', reportDate: '', asanaLink: '', outputLink: '' });
                    setNewPostPlatforms(['facebook']);
                    setShowAddModal(false);
                  })();
                }}>
                  確認新增
                </Button>
              )}
            </div>
          </div>
        </div>
      </CrudModal>

      {/* Edit Modal — Enhanced v2.3 with Topic + Multi-platform */}
      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯社交媒體帖文" size="lg">
        {editingPost && (
          <div className="space-y-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5 flex items-center gap-1">
                <Tag size={12} className="text-purple-500" /> 主題標籤
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {topicOptions.map(t => (
                  <button
                    key={t}
                    onClick={() => setEditingPost({ ...editingPost, topic: editingPost.topic === t ? '' : t })}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors',
                      editingPost.topic === t
                        ? 'bg-purple-100 text-purple-700 border-purple-300'
                        : 'bg-white text-muted-foreground border-border hover:border-purple-200'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Input
                value={editingPost.topic || ''}
                onChange={(e) => setEditingPost({ ...editingPost, topic: e.target.value })}
                placeholder="自行輸入主題..."
                className="h-9 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">發佈平台（多選）</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(platformConfig).filter(([k]) => k !== 'other').map(([key, config]) => {
                  const Icon = config.icon;
                  const currentPlatforms: string[] = editingPost.platforms || [editingPost.platform];
                  const isSelected = currentPlatforms.includes(key);
                  return (
                    <label key={key} className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border cursor-pointer transition-all text-[11px] font-medium',
                      isSelected ? `${config.bg} ${config.borderColor}` : 'border-border hover:bg-muted/20'
                    )}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const platforms = editingPost.platforms || [editingPost.platform];
                          const next = isSelected
                            ? platforms.filter((p: string) => p !== key)
                            : [...platforms, key];
                          setEditingPost({ ...editingPost, platforms: next, platform: next[0] || editingPost.platform });
                        }}
                        className="w-3 h-3 rounded border-border text-teal-600 focus:ring-teal-600"
                      />
                      <Icon size={12} className={config.color} />
                      {config.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">帖文類型</label>
                <Select value={editingPost.postType || 'image'} onValueChange={(val: any) => setEditingPost({ ...editingPost, postType: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(postTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
                <Select value={editingPost.status} onValueChange={(val: any) => setEditingPost({ ...editingPost, status: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">內容</label>
              <textarea value={editingPost.content || ''} onChange={(e) => setEditingPost({ ...editingPost, content: e.target.value })} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">工時</label>
                <Input type="number" step={0.5} value={editingPost.hoursSpent || 0} onChange={(e) => setEditingPost({ ...editingPost, hoursSpent: parseFloat(e.target.value) || 0 })} className="h-9 text-[13px]" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">帖文連結</label>
                <Input value={editingPost.postUrl || ''} onChange={(e) => setEditingPost({ ...editingPost, postUrl: e.target.value })} className="h-9 text-[13px]" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => {
                void (async () => {
                  if (!editingPost) return;
                  const error = await updatePost(editingPost.id, {
                    websiteProfileId: editingPost.websiteProfileId,
                    platform: editingPost.platform,
                    platforms: editingPost.platforms,
                    topic: editingPost.topic,
                    postType: editingPost.postType,
                    content: editingPost.content,
                    status: editingPost.status,
                    hoursSpent: editingPost.hoursSpent,
                    postUrl: editingPost.postUrl,
                    scheduledDate: toDateOnly(editingPost.scheduledDate),
                    publishedDate: toDateOnly(editingPost.publishedDate),
                  });
                  if (error) {
                    toast.error(`更新失敗：${error.message}`);
                    return;
                  }
                  setShowEditModal(false);
                  setEditingPost(null);
                })();
              }}>儲存變更</Button>
            </div>
          </div>
        )}
      </CrudModal>

      {/* Delete Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => {
          void (async () => {
            if (deleteTarget) {
              const error = await deletePost(deleteTarget.id);
              if (error) {
                toast.error(`刪除失敗：${error.message}`);
                return;
              }
            }
            setShowDeleteModal(false);
            setDeleteTarget(null);
          })();
        }}
        itemName={deleteTarget?.content?.substring(0, 30) || '帖文'}
        canDelete={true}
        reasons={[]}
      />
    </div>
  );
}
