import { useState, useMemo } from 'react';
import { Plus, Search, ExternalLink, Globe, Facebook, Instagram, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/context/DataStore';
import { useSocialPosts } from '@/hooks/useSocialPosts';

const platformConfig = {
  facebook: { label: 'Facebook', icon: Facebook, color: 'text-blue-600', bg: 'bg-blue-50' },
  instagram: { label: 'Instagram', icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-50' },
  xiaohongshu: { label: '小紅書', icon: BookOpen, color: 'text-red-600', bg: 'bg-red-50' },
  linkedin: { label: 'LinkedIn', icon: Globe, color: 'text-blue-700', bg: 'bg-blue-50' },
  youtube: { label: 'YouTube', icon: Globe, color: 'text-red-600', bg: 'bg-red-50' },
  twitter: { label: 'Twitter', icon: Globe, color: 'text-sky-600', bg: 'bg-sky-50' },
  other: { label: '其他', icon: Globe, color: 'text-gray-600', bg: 'bg-gray-50' },
};

const statusConfig = {
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

export function SocialPostsList() {
  const { websites } = useDataStore();
  const { posts } = useSocialPosts();
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);

  const siteMap = useMemo(() => new Map(websites.map(w => [w.id, w])), [websites]);
  const allPosts = useMemo(() => posts.map(p => {
    const site = siteMap.get(p.websiteProfileId);
    return {
      ...p,
      websiteName: site?.websiteName || p.websiteProfileId,
      company: site?.company || '',
      brand: site?.brand || '',
    };
  }), [posts, siteMap]);

  const filteredPosts = allPosts.filter((post) => {
    if (filterPlatform !== 'all' && post.platform !== filterPlatform) return false;
    if (filterStatus !== 'all' && post.status !== filterStatus) return false;
    if (searchQuery && !post.content?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const totalHours = filteredPosts.reduce((sum, p) => sum + (p.hoursSpent || 0), 0);
  const publishedCount = allPosts.filter(p => p.status === 'published').length;
  const scheduledCount = allPosts.filter(p => p.status === 'scheduled').length;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">總帖文</span>
          <p className="text-[20px] font-bold">{allPosts.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">已發佈</span>
          <p className="text-[20px] font-bold text-teal-600">{publishedCount}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">已排程</span>
          <p className="text-[20px] font-bold text-amber-600">{scheduledCount}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">總工時</span>
          <p className="text-[20px] font-bold">{totalHours}h</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋帖文內容..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setFilterPlatform('all')} className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200', filterPlatform === 'all' ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>全部平台</button>
          {Object.entries(platformConfig).slice(0, 5).map(([key, config]) => (
            <button key={key} onClick={() => setFilterPlatform(key)} className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200', filterPlatform === key ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
              {config.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'draft', 'scheduled', 'published'] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)} className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200', filterStatus === s ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
              {s === 'all' ? '全部狀態' : statusConfig[s].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} />
          新增帖文
        </button>
      </div>

      {/* New Form */}
      {showNewForm && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <h3 className="text-[14px] font-bold mb-4">新增社交媒體帖文</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬公司</label>
              <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                <option>BWDesign Centre</option>
                <option>志豐企業</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">品牌</label>
              <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                <option>BW Wine</option>
                <option>ACI Events</option>
                <option>BW Design</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">平台</label>
              <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                <option>Facebook</option>
                <option>Instagram</option>
                <option>小紅書</option>
                <option>LinkedIn</option>
                <option>YouTube</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">帖文內容 *</label>
              <textarea rows={2} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none" placeholder="輸入帖文內容..." />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">帖文類型</label>
              <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                <option>圖片</option>
                <option>影片</option>
                <option>輪播</option>
                <option>Story</option>
                <option>Reel</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">排期日期</label>
              <input type="date" className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">投入工時</label>
              <input type="number" step="0.5" className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" placeholder="0" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button className="px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200">儲存</button>
            <button onClick={() => setShowNewForm(false)} className="px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">取消</button>
          </div>
        </div>
      )}

      {/* Posts Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">平台</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">內容</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">公司 / 品牌</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">網站</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">類型</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">日期</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">工時</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">標籤</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filteredPosts.map((post) => {
              const pConfig = platformConfig[post.platform];
              const sConfig = statusConfig[post.status];
              const Icon = pConfig.icon;
              return (
                <tr key={post.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', pConfig.bg)}>
                        <Icon size={14} className={pConfig.color} />
                      </div>
                      <span className="text-[12px] font-medium">{pConfig.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <span className="truncate block text-[13px]">{post.content}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[12px] font-medium">{post.company}</div>
                    <div className="text-[11px] text-muted-foreground">{post.brand}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] text-teal-600">{post.websiteName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] bg-muted px-2 py-0.5 rounded">{postTypeLabels[post.postType] || post.postType}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-[12px]">
                    {post.publishedDate || post.scheduledDate || '—'}
                  </td>
                  <td className="px-4 py-3">{post.hoursSpent ? `${post.hoursSpent}h` : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {post.tags?.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">#{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>
                      {sConfig.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {post.postUrl && (
                      <a href={post.postUrl} target="_blank" rel="noreferrer" className="text-teal-600 hover:text-teal-700">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredPosts.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-[13px]">
            <p>沒有符合條件的帖文記錄</p>
          </div>
        )}
      </div>
    </div>
  );
}

