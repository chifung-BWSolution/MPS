import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Globe, Plus, Search, ExternalLink, FileText, Video, Share2, Mail, TrendingUp, Puzzle, Link2, Calendar, X, Check, Trash2, LayoutGrid, List, ArrowLeft, Megaphone, Star, Sparkles, ChevronDown, Pencil, Monitor, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WebsiteProfileFull, Article, WebsiteLevel, ProfileType, SystemType } from '@/types/app';
import {
  allArticles,
  getArticlesForWebsite,
  addArticleToWebsite,
  removeArticleFromWebsite,
  getWebsitesForArticle,
  addWebsiteToArticle,
  removeWebsiteFromArticle,
} from '@/data/websiteData';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';
import { useCompanies } from '@/hooks/useCompanies';
import { useBrands } from '@/hooks/useBrands';
import { useSystemOptions } from '@/hooks/useSystemOptions';
import { projects as allProjectsData } from '@/data/mockData';
import { ProjectCategoryBadge, getProjectCategory } from '@/components/ui/project-category-badge';
import { useDataStore } from '@/context/DataStore';
import {
  WebsiteVideosTab,
  WebsiteSocialTab,
  WebsiteAdsTab,
  WebsiteSeoTab,
  WebsiteEdmTab,
  WebsitePluginsTab,
  WebsiteLinksTab,
  WebsiteCalendarTab,
} from './WebsiteDetailTabs';

const statusConfig = {
  development: { label: '開發中', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  live: { label: '已上線', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  maintenance: { label: '維護中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  archived: { label: '已封存', color: 'text-slate-700', bgColor: 'bg-slate-50' },
};

const articleStatusConfig = {
  draft: { label: '草稿', color: 'text-slate-700', bgColor: 'bg-slate-50' },
  writing: { label: '撰寫中', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  review: { label: '審核中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  published: { label: '已發佈', color: 'text-teal-700', bgColor: 'bg-teal-50' },
};

// ===== Level Config =====
const levelConfig: Record<WebsiteLevel, { label: string; borderColor: string; textColor: string; bgColor: string; className: string }> = {
  1: { label: '主打', borderColor: 'border-amber-500', textColor: 'text-amber-800', bgColor: 'bg-gradient-to-r from-amber-50 to-yellow-50', className: 'border-amber-500 bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-800' },
  2: { label: '重要', borderColor: 'border-blue-500', textColor: 'text-blue-700', bgColor: 'bg-blue-50', className: 'border-blue-500 bg-blue-50 text-blue-700' },
  3: { label: '定期推廣', borderColor: 'border-green-500', textColor: 'text-green-700', bgColor: 'bg-green-50', className: 'border-green-500 bg-green-50 text-green-700' },
  4: { label: '不主動', borderColor: 'border-slate-400', textColor: 'text-slate-600', bgColor: 'bg-slate-50', className: 'border-slate-400 bg-slate-50 text-slate-600' },
  5: { label: '已關閉', borderColor: 'border-rose-500', textColor: 'text-rose-600', bgColor: 'bg-rose-50', className: 'border-rose-500 bg-rose-50 text-rose-600 line-through' },
};

// ===== Website Level Badge Component =====
function WebsiteLevelBadge({ level, size = 'default' }: { level: WebsiteLevel; size?: 'default' | 'small' | 'large' }) {
  const config = levelConfig[level];
  const sizeClasses = size === 'small' ? 'text-[9px] px-1 py-0' : size === 'large' ? 'text-[12px] px-2 py-1' : 'text-[10px] px-1.5 py-0.5';
  return (
    <span className={cn('font-bold rounded-sm border inline-flex items-center gap-0.5', sizeClasses, config.className)}>
      {level === 1 && <Star size={size === 'small' ? 8 : size === 'large' ? 12 : 10} className="fill-amber-400 text-amber-500" />}
      L{level} {config.label}
    </span>
  );
}

// ===== Profile Type Badge Component =====
const profileTypeConfig: Record<string, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  website: { label: '網站', icon: <Globe size={10} />, color: 'text-teal-700', bgColor: 'bg-teal-50 border-teal-200' },
  system: { label: '系統', icon: <Server size={10} />, color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200' },
};

const systemTypeLabels: Record<SystemType, string> = {
  internal_tool: '內部工具',
  client_system: '客戶系統',
  saas_platform: 'SaaS 平台',
  erp: 'ERP 系統',
  crm: 'CRM 系統',
  other: '其他系統',
};

function ProfileTypeBadge({ profileType, size = 'default' }: { profileType?: ProfileType; size?: 'default' | 'small' }) {
  const type = profileType || 'website';
  const config = profileTypeConfig[type];
  const sizeClasses = size === 'small' ? 'text-[9px] px-1 py-0 gap-0.5' : 'text-[10px] px-1.5 py-0.5 gap-1';
  return (
    <span className={cn('font-bold rounded-sm border inline-flex items-center', sizeClasses, config.bgColor, config.color)}>
      {config.icon}
      {config.label}
    </span>
  );
}

// ===== Website Card =====
function WebsiteCard({ site, onClick }: { site: WebsiteProfileFull; onClick: () => void }) {
  const config = statusConfig[site.status];
  const { category, clientName } = getProjectCategory(site.projectId, allProjectsData);

  return (
    <div onClick={onClick} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5 hover:shadow-[0_4px_12px_rgba(0,20,40,0.1)] transition-all duration-200 cursor-pointer">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h4 className="text-[15px] font-bold">{site.websiteName}</h4>
            <ProfileTypeBadge profileType={site.profileType} size="small" />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {site.profileType === 'system' ? <Monitor size={11} className="text-purple-500" /> : <Globe size={11} className="text-muted-foreground" />}
            <span className="text-[12px] text-teal-600">{site.domainUrl}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <WebsiteLevelBadge level={site.level} />
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-sm', config.bgColor, config.color)}>{config.label}</span>
        </div>
      </div>

      {/* Platform & Brand */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <ProjectCategoryBadge category={category} clientName={clientName} size="sm" />
        {site.profileType === 'system' && site.systemType && (
          <span className="text-[11px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">{systemTypeLabels[site.systemType]}</span>
        )}
        <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{site.platform}</span>
        <span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{site.brand}</span>
        <span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{site.company}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-3 pt-3 border-t border-border/50">
        <div className="text-center">
          <span className="text-[14px] font-bold block">{site.pagesCount}</span>
          <span className="text-[10px] text-muted-foreground">頁面</span>
        </div>
        <div className="text-center">
          <span className="text-[14px] font-bold block">{site.articlesCount}</span>
          <span className="text-[10px] text-muted-foreground">文章</span>
        </div>
        <div className="text-center">
          <span className="text-[14px] font-bold block">{site.videosCount}</span>
          <span className="text-[10px] text-muted-foreground">影片</span>
        </div>
        <div className="text-center">
          <span className="text-[14px] font-bold block">{site.keywordsCount}</span>
          <span className="text-[10px] text-muted-foreground">關鍵字</span>
        </div>
      </div>

      {/* External Links */}
      {site.externalLinks && site.externalLinks.length > 0 && (
        <div className="flex items-center gap-1.5 pt-2 border-t border-border/50">
          {site.externalLinks.map((link, i) => (
            <a key={i} href={link.url} onClick={e => e.stopPropagation()} className="flex items-center gap-0.5 text-[10px] text-teal-600 hover:underline">
              <ExternalLink size={9} />{link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Website Table Row =====
function WebsiteTableRow({ site, onClick }: { site: WebsiteProfileFull; onClick: () => void }) {
  const config = statusConfig[site.status];
  const { category, clientName } = getProjectCategory(site.projectId, allProjectsData);
  return (
    <tr onClick={onClick} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
      <td className="px-4 py-3">
        <div>
          <span className="text-[13px] font-medium block">{site.websiteName}</span>
          <span className="text-[11px] text-teal-600">{site.domainUrl}</span>
        </div>
      </td>
      <td className="px-4 py-3"><ProjectCategoryBadge category={category} clientName={clientName} size="sm" /></td>
      <td className="px-4 py-3"><WebsiteLevelBadge level={site.level} size="small" /></td>
      <td className="px-4 py-3"><span className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{site.platform}</span></td>
      <td className="px-4 py-3"><span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{site.brand}</span></td>
      <td className="px-4 py-3"><span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{site.company}</span></td>
      <td className="px-4 py-3"><span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', config.bgColor, config.color)}>{config.label}</span></td>
      <td className="px-4 py-3 text-[13px]">{site.articlesCount}</td>
      <td className="px-4 py-3 text-[13px]">{site.videosCount}</td>
      <td className="px-4 py-3 text-[13px] font-medium">{site.totalHours}h</td>
    </tr>
  );
}

// ===== Add Article Modal =====
function AddArticleModal({
  websiteId,
  existingArticleIds,
  onClose,
  onAdd,
}: {
  websiteId: string;
  existingArticleIds: string[];
  onClose: () => void;
  onAdd: (articleIds: string[]) => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newArticle, setNewArticle] = useState({ title: '', channel: 'website_article', authorName: '' });

  const availableArticles = allArticles.filter(a => !existingArticleIds.includes(a.id));
  const filteredArticles = availableArticles.filter(a =>
    !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase()) || (a.brand || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSubmit = () => {
    if (mode === 'existing') {
      onAdd(selectedIds);
    } else {
      onAdd([`new_${Date.now()}`]);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[640px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">新增文章到此網站</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-2 px-6 pt-4">
          <button
            onClick={() => setMode('existing')}
            className={cn('px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors', mode === 'existing' ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
          >
            從現有文章加入
          </button>
          <button
            onClick={() => setMode('new')}
            className={cn('px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors', mode === 'new' ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
          >
            新建文章
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {mode === 'existing' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm">
                <Search size={14} className="text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
                  placeholder="搜尋文章標題或品牌..."
                />
              </div>
              {selectedIds.length > 0 && (
                <div className="text-[12px] text-teal-600 font-medium">已選擇 {selectedIds.length} 篇文章</div>
              )}
              <div className="space-y-1 max-h-[350px] overflow-y-auto">
                {filteredArticles.length === 0 ? (
                  <div className="text-center py-6 text-[13px] text-muted-foreground">沒有可加入的文章</div>
                ) : (
                  filteredArticles.map(article => {
                    const isSelected = selectedIds.includes(article.id);
                    const statusCfg = articleStatusConfig[article.contentStatus];
                    return (
                      <div
                        key={article.id}
                        onClick={() => toggleSelect(article.id)}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all',
                          isSelected ? 'border-teal-600 bg-teal-50' : 'border-border hover:bg-muted/30'
                        )}
                      >
                        <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0', isSelected ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/30')}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[13px] font-medium block truncate">{article.title}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-muted-foreground">{article.authorName}</span>
                            <span className="text-[11px] bg-teal-50 text-teal-700 px-1 py-0.5 rounded">{article.brand}</span>
                            {article.publishDate && <span className="text-[11px] text-muted-foreground">{article.publishDate}</span>}
                          </div>
                        </div>
                        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-sm shrink-0', statusCfg.bgColor, statusCfg.color)}>{statusCfg.label}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">文章標題 *</label>
                <input
                  value={newArticle.title}
                  onChange={(e) => setNewArticle(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
                  placeholder="輸入文章標題"
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">渠道</label>
                <select
                  value={newArticle.channel}
                  onChange={(e) => setNewArticle(prev => ({ ...prev, channel: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
                >
                  <option value="website_article">網站文章</option>
                  <option value="youtube">YouTube</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="xiaohongshu">小紅書</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">作者</label>
                <input
                  value={newArticle.authorName}
                  onChange={(e) => setNewArticle(prev => ({ ...prev, authorName: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
                  placeholder="撰稿人名稱"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
          <button
            onClick={handleSubmit}
            disabled={mode === 'existing' ? selectedIds.length === 0 : !newArticle.title}
            className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'existing' ? `加入 ${selectedIds.length} 篇文章` : '新建並關聯'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Website Detail — Articles Tab =====
function WebsiteArticlesTab({ site }: { site: WebsiteProfileFull }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [articles, setArticles] = useState<Article[]>(() => getArticlesForWebsite(site.id));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);

  const existingArticleIds = articles.map(a => a.id);

  const handleAddArticles = (articleIds: string[]) => {
    articleIds.forEach(id => {
      if (!id.startsWith('new_')) {
        addArticleToWebsite(site.id, id);
      }
    });
    setArticles(getArticlesForWebsite(site.id));
  };

  const handleRemoveArticle = (articleId: string) => {
    removeArticleFromWebsite(site.id, articleId);
    setArticles(getArticlesForWebsite(site.id));
    setSelectedIds(prev => prev.filter(id => id !== articleId));
    setRemoveConfirmId(null);
  };

  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(prev => prev.length === articles.length ? [] : articles.map(a => a.id));
  const allSelected = articles.length > 0 && selectedIds.length === articles.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[15px] font-bold">文章列表</h4>
          <p className="text-[12px] text-muted-foreground mt-0.5">已關聯 {articles.length} 篇文章（多對多關聯）</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              onClick={() => { selectedIds.forEach(id => { removeArticleFromWebsite(site.id, id); }); setArticles(getArticlesForWebsite(site.id)); setSelectedIds([]); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-300 text-rose-600 rounded-md text-[12px] font-medium hover:bg-rose-100 transition-colors"
            >
              <Trash2 size={12} />移除 {selectedIds.length} 篇
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
          >
            <Plus size={13} />新增文章到此網站
          </button>
        </div>
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <FileText size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">尚未關聯任何文章</p>
          <p className="text-[12px] text-muted-foreground mt-1">點擊「新增文章到此網站」開始關聯</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 w-8">
                  <div onClick={toggleAll} className={cn('w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer', allSelected ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/40')}>
                    {allSelected && <Check size={10} className="text-white" />}
                  </div>
                </th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">標題</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">作者</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">發佈日期</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">工時</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">SEO Tags</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">成果</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {articles.map(article => {
                const statusCfg = articleStatusConfig[article.contentStatus];
                const isSelected = selectedIds.includes(article.id);
                return (
                  <tr key={article.id} className={cn('border-b border-border/50 hover:bg-muted/20 transition-colors', isSelected && 'bg-rose-50/30')}>
                    <td className="px-4 py-3" onClick={() => toggleSelect(article.id)}>
                      <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer', isSelected ? 'border-rose-500 bg-rose-500' : 'border-muted-foreground/40')}>
                        {isSelected && <Check size={10} className="text-white" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px] font-medium max-w-[200px] truncate block">{article.title}</span>
                    </td>
                    <td className="px-4 py-3 text-[13px]">{article.authorName || '—'}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{article.publishDate || '—'}</td>
                    <td className="px-4 py-3 text-[13px] font-medium">{article.hoursSpent ? `${article.hoursSpent}h` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {article.targetKeywords?.slice(0, 2).map((kw, i) => (
                          <span key={i} className={cn('text-[10px] px-1.5 py-0.5 rounded-sm font-bold border',
                            kw.level === 'S1' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            kw.level === 'S2' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-green-50 text-green-700 border-green-200'
                          )}>
                            {kw.level}<span className="font-normal ml-0.5">{kw.keyword}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', statusCfg.bgColor, statusCfg.color)}>{statusCfg.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      {article.url ? (
                        <a href={article.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-teal-600 hover:underline font-medium">
                          <ExternalLink size={11} />查看文章
                        </a>
                      ) : <span className="text-[11px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setRemoveConfirmId(article.id)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors"
                        title="移除關聯"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddArticleModal
          websiteId={site.id}
          existingArticleIds={existingArticleIds}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddArticles}
        />
      )}

      {/* Remove confirm dialog */}
      {removeConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-[380px]">
            <h3 className="text-[16px] font-bold mb-2">確認移除關聯</h3>
            <p className="text-[13px] text-muted-foreground mb-4">確定要移除此文章與網站的關聯嗎？此操作不會刪除文章本身。</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setRemoveConfirmId(null)} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
              <button onClick={() => handleRemoveArticle(removeConfirmId)} className="px-4 py-2 text-[13px] font-medium bg-rose-600 text-white rounded-md hover:bg-rose-700">確認移除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Website Detail =====
function WebsiteDetail({ site, onBack }: { site: WebsiteProfileFull; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [currentLevel, setCurrentLevel] = useState<WebsiteLevel>(site.level);
  const [showLevelDropdown, setShowLevelDropdown] = useState(false);

  const tabs = [
    { id: 'overview', label: '概覽', icon: Globe },
    { id: 'articles', label: '文章列表', icon: FileText },
    { id: 'videos', label: '影片列表', icon: Video },
    { id: 'social', label: '社交帖文', icon: Share2 },
    { id: 'ads', label: '付費廣告', icon: Megaphone },
    { id: 'seo', label: 'SEO 關鍵字', icon: TrendingUp },
    { id: 'edm', label: 'EDM', icon: Mail },
    { id: 'plugins', label: '插件/工具', icon: Puzzle },
    { id: 'links', label: '外部連結', icon: Link2 },
    { id: 'calendar', label: '內容日曆', icon: Calendar },
  ];

  const budgetPercent = site.budgetTotal ? Math.round((site.budgetUsed || 0) / site.budgetTotal * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-teal-600 font-medium hover:underline">
        <ArrowLeft size={14} />返回{site.profileType === 'system' ? '系統' : '網站'}列表
      </button>

      {/* Site Header */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-[20px] font-bold">{site.websiteName}</h2>
              <ProfileTypeBadge profileType={site.profileType} />
              {/* Level Badge with Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowLevelDropdown(!showLevelDropdown)}
                  className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                >
                  <WebsiteLevelBadge level={currentLevel} size="large" />
                  <ChevronDown size={12} className="text-muted-foreground" />
                </button>
                {showLevelDropdown && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-md shadow-lg py-1 min-w-[160px]">
                    {([1, 2, 3, 4, 5] as WebsiteLevel[]).map(lvl => (
                      <button
                        key={lvl}
                        onClick={() => { setCurrentLevel(lvl); setShowLevelDropdown(false); }}
                        className={cn('w-full px-3 py-2 text-left text-[12px] hover:bg-muted/50 transition-colors flex items-center gap-2', currentLevel === lvl && 'bg-muted/30')}
                      >
                        <WebsiteLevelBadge level={lvl} size="small" />
                        {currentLevel === lvl && <Check size={11} className="text-teal-600 ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {site.profileType === 'system' ? <Monitor size={12} className="text-purple-500" /> : <Globe size={12} className="text-muted-foreground" />}
              <a href={`https://${site.domainUrl}`} className="text-[13px] text-teal-600 hover:underline">{site.domainUrl}</a>
              <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{site.platform}</span>
              {site.profileType === 'system' && site.systemType && (
                <span className="text-[11px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">{systemTypeLabels[site.systemType]}</span>
              )}
              <span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{site.brand}</span>
              <span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{site.company}</span>
              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-sm', statusConfig[site.status].bgColor, statusConfig[site.status].color)}>
                {statusConfig[site.status].label}
              </span>
            </div>
            {/* System-specific metadata */}
            {site.profileType === 'system' && (site.techStack || site.deploymentEnv || site.apiDocUrl) && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {site.techStack && site.techStack.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground font-medium">技術棧:</span>
                    {site.techStack.map((tech, i) => (
                      <span key={i} className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{tech}</span>
                    ))}
                  </div>
                )}
                {site.deploymentEnv && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">🚀 {site.deploymentEnv}</span>
                )}
                {site.apiDocUrl && (
                  <a href={site.apiDocUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                    <ExternalLink size={9} />API 文件
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-5 gap-4 text-center">
            <div><span className="text-[18px] font-bold block">{site.pagesCount}</span><span className="text-[10px] text-muted-foreground">頁面</span></div>
            <div><span className="text-[18px] font-bold block">{site.articlesCount}</span><span className="text-[10px] text-muted-foreground">文章</span></div>
            <div><span className="text-[18px] font-bold block">{site.videosCount}</span><span className="text-[10px] text-muted-foreground">影片</span></div>
            <div><span className="text-[18px] font-bold block">{site.keywordsCount}</span><span className="text-[10px] text-muted-foreground">關鍵字</span></div>
            <div><span className="text-[18px] font-bold block">{site.totalHours}h</span><span className="text-[10px] text-muted-foreground">工時</span></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border pb-0">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 whitespace-nowrap transition-all',
                activeTab === tab.id ? 'border-teal-600 text-teal-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon size={13} />{tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-teal-50 rounded-md p-4 text-center">
                <span className="text-[24px] font-bold text-teal-700 block">{site.articlesCount}</span>
                <span className="text-[12px] text-teal-600">文章數</span>
              </div>
              <div className="bg-blue-50 rounded-md p-4 text-center">
                <span className="text-[24px] font-bold text-blue-700 block">{site.videosCount}</span>
                <span className="text-[12px] text-blue-600">影片數</span>
              </div>
              <div className="bg-purple-50 rounded-md p-4 text-center">
                <span className="text-[24px] font-bold text-purple-700 block">{site.socialPostsCount}</span>
                <span className="text-[12px] text-purple-600">社交帖數</span>
              </div>
              <div className="bg-amber-50 rounded-md p-4 text-center">
                <span className="text-[24px] font-bold text-amber-700 block">{budgetPercent}%</span>
                <span className="text-[12px] text-amber-600">預算使用率</span>
              </div>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h5 className="text-[14px] font-bold">基本資料</h5>
                <div className="space-y-2">
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Level</span><span className="font-medium"><WebsiteLevelBadge level={currentLevel} /></span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">狀態</span><span className="font-medium">{statusConfig[site.status].label}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">平台</span><span className="font-medium capitalize">{site.platform}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">品牌</span><span className="font-medium">{site.brand}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">公司</span><span className="font-medium">{site.company}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">主機</span><span className="font-medium">{site.hostingProvider || '—'}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">總工時</span><span className="font-medium">{site.totalHours}h</span></div>
                </div>
              </div>
              <div className="space-y-3">
                <h5 className="text-[14px] font-bold">團隊</h5>
                {site.assignedStaff && site.assignedStaff.length > 0 ? (
                  <div className="space-y-2">
                    {site.assignedStaff.map((staff, i) => (
                      <div key={i} className="flex items-center justify-between text-[13px]">
                        <span className="font-medium">{staff.name}</span>
                        <span className="text-muted-foreground text-[11px] bg-muted px-1.5 py-0.5 rounded">{staff.role}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-muted-foreground">尚未分配團隊</p>
                )}

                {/* Budget */}
                {site.budgetTotal && (
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <h5 className="text-[14px] font-bold mb-2">預算</h5>
                    <div className="flex justify-between text-[13px] mb-1">
                      <span className="text-muted-foreground">已使用 / 總預算</span>
                      <span className="font-medium">${(site.budgetUsed || 0).toLocaleString()} / ${site.budgetTotal.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', budgetPercent >= 90 ? 'bg-rose-500' : budgetPercent >= 70 ? 'bg-amber-500' : 'bg-teal-600')}
                        style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* External Links */}
            {site.externalLinks && site.externalLinks.length > 0 && (
              <div className="pt-4 border-t border-border/50">
                <h5 className="text-[14px] font-bold mb-2">外部連結</h5>
                <div className="flex items-center gap-3 flex-wrap">
                  {site.externalLinks.map((link, i) => (
                    <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] text-teal-600 hover:underline px-2 py-1 bg-teal-50 rounded">
                      <ExternalLink size={11} />{link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {site.notes && (
              <div className="pt-4 border-t border-border/50">
                <h5 className="text-[14px] font-bold mb-2">備註</h5>
                <p className="text-[13px] text-muted-foreground">{site.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'articles' && <WebsiteArticlesTab site={site} />}

        {activeTab === 'videos' && <WebsiteVideosTab site={site} />}
        {activeTab === 'social' && <WebsiteSocialTab site={site} />}
        {activeTab === 'ads' && <WebsiteAdsTab site={site} />}
        {activeTab === 'seo' && <WebsiteSeoTab site={site} />}
        {activeTab === 'edm' && <WebsiteEdmTab site={site} />}
        {activeTab === 'plugins' && <WebsitePluginsTab site={site} />}
        {activeTab === 'links' && <WebsiteLinksTab site={site} />}
        {activeTab === 'calendar' && <WebsiteCalendarTab site={site} />}
      </div>
    </div>
  );
}

// ===== Add/Edit Website Modal =====
interface WebsiteFormData {
  websiteName: string;
  domainUrl: string;
  companyId: string;
  brandId: string;
  platform: string;
  hostingProvider: string;
  level: WebsiteLevel;
  status: 'development' | 'live' | 'maintenance' | 'archived';
  notes: string;
  profileType: ProfileType;
  systemType?: SystemType;
  techStack?: string[];
  deploymentEnv?: string;
  apiDocUrl?: string;
}

const emptyFormData: WebsiteFormData = {
  websiteName: '',
  domainUrl: '',
  companyId: '',
  brandId: '',
  platform: '',
  hostingProvider: '',
  level: 3,
  status: 'development',
  notes: '',
  profileType: 'website',
  systemType: undefined,
  techStack: [],
  deploymentEnv: '',
  apiDocUrl: '',
};

function WebsiteFormModal({
  mode,
  initialData,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  initialData?: WebsiteFormData;
  onClose: () => void;
  onSave: (data: WebsiteFormData) => void;
}) {
  const [form, setForm] = useState<WebsiteFormData>(initialData || emptyFormData);
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const { byCategory: optionsByCategory } = useSystemOptions();
  const platformOptions = optionsByCategory('platform');
  const knownPlatformValues = platformOptions
    .filter(p => p.value.toLowerCase() !== 'custom' && p.value !== '自訂')
    .map(p => p.value);
  const canonicalPlatform = form.platform
    ? (knownPlatformValues.find(v => v.toLowerCase() === form.platform.toLowerCase()) ?? form.platform)
    : '';
  const initialIsCustom = !!form.platform && knownPlatformValues.length > 0 && !knownPlatformValues.some(v => v.toLowerCase() === form.platform.toLowerCase());
  const [isCustomSelected, setIsCustomSelected] = useState(false);
  const [customPlatform, setCustomPlatform] = useState('');

  // Re-evaluate once platformOptions finish loading (they start as empty array)
  useEffect(() => {
    if (knownPlatformValues.length === 0) return;
    const isCustom = !!form.platform && !knownPlatformValues.some(v => v.toLowerCase() === form.platform.toLowerCase());
    setIsCustomSelected(isCustom);
    setCustomPlatform(isCustom ? form.platform : '');
  }, [knownPlatformValues.length]);

  const filteredBrandsForForm = form.companyId
    ? brands.filter(b => b.companyId === form.companyId)
    : brands;

  const handleChange = (field: keyof WebsiteFormData, value: any) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      // Reset brand if company changes
      if (field === 'companyId') {
        updated.brandId = '';
      }
      return updated;
    });
  };

  const handleSubmit = () => {
    if (!form.websiteName || !form.companyId) return;
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[640px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">{mode === 'add' ? '新增網站/系統' : '編輯網站/系統'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Profile Type */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">類型 *</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleChange('profileType', 'website')}
                className={cn('flex items-center gap-1.5 px-3 py-2 rounded-md border text-[13px] font-medium transition-all', form.profileType === 'website' ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-border text-muted-foreground hover:bg-muted/50')}
              >
                <Globe size={13} /> 網站
              </button>
              <button
                type="button"
                onClick={() => handleChange('profileType', 'system')}
                className={cn('flex items-center gap-1.5 px-3 py-2 rounded-md border text-[13px] font-medium transition-all', form.profileType === 'system' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-border text-muted-foreground hover:bg-muted/50')}
              >
                <Server size={13} /> 系統
              </button>
            </div>
          </div>

          {/* Website/System Name */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">{form.profileType === 'system' ? '系統名稱' : '網站名稱'} *</label>
            <input
              value={form.websiteName}
              onChange={(e) => handleChange('websiteName', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
              placeholder={form.profileType === 'system' ? '輸入系統名稱' : '輸入網站名稱'}
            />
          </div>

          {/* Domain URL */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">{form.profileType === 'system' ? '系統 URL / 域名' : '域名 URL'}</label>
            <input
              value={form.domainUrl}
              onChange={(e) => handleChange('domainUrl', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
              placeholder={form.profileType === 'system' ? 'app.example.com' : 'www.example.com'}
            />
          </div>

          {/* Company & Brand (Cascading) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬公司 *</label>
              <select
                value={form.companyId}
                onChange={(e) => handleChange('companyId', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="">選擇公司</option>
                {companies.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{c.companyCode} — {c.companyNameEn}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬品牌</label>
              <select
                value={form.brandId}
                onChange={(e) => handleChange('brandId', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
                disabled={!form.companyId}
              >
                <option value="">選擇品牌</option>
                {filteredBrandsForForm.filter(b => b.isActive).map(b => (
                  <option key={b.id} value={b.id}>{b.brandCode} — {b.brandNameZh}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Platform & Hosting */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">平台</label>
              <select
                value={isCustomSelected ? '__custom__' : canonicalPlatform}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomSelected(true);
                    handleChange('platform', customPlatform || '');
                  } else {
                    setIsCustomSelected(false);
                    setCustomPlatform('');
                    handleChange('platform', e.target.value);
                  }
                }}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="">選擇平台</option>
                {platformOptions
                  .filter(p => p.value.toLowerCase() !== 'custom' && p.value !== '自訂')
                  .map(p => (
                    <option key={p.id} value={p.value}>{p.value}</option>
                  ))}
                <option value="__custom__">自訂</option>
              </select>
              {isCustomSelected && (
                <input
                  value={customPlatform}
                  onChange={(e) => {
                    const v = e.target.value.slice(0, 10);
                    setCustomPlatform(v);
                    handleChange('platform', v);
                  }}
                  maxLength={10}
                  placeholder="輸入自訂平台 (最多10字)"
                  className="mt-2 w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
                />
              )}
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">主機商</label>
              <input
                value={form.hostingProvider}
                onChange={(e) => handleChange('hostingProvider', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
                placeholder="如 Cloudways, AWS..."
              />
            </div>
          </div>

          {/* Level & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Level 等級</label>
              <select
                value={form.level}
                onChange={(e) => handleChange('level', Number(e.target.value) as WebsiteLevel)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value={1}>L1 主打</option>
                <option value={2}>L2 重要</option>
                <option value={3}>L3 定期推廣</option>
                <option value={4}>L4 不主動</option>
                <option value={5}>L5 已關閉</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
              <select
                value={form.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="development">開發中</option>
                <option value="live">已上線</option>
                <option value="maintenance">維護中</option>
                <option value="archived">已封存</option>
              </select>
            </div>
          </div>

          {/* System-specific fields */}
          {form.profileType === 'system' && (
            <div className="space-y-4 p-4 rounded-lg bg-purple-50/50 border border-purple-100">
              <h4 className="text-[13px] font-bold text-purple-700 flex items-center gap-1.5"><Server size={13} /> 系統專屬設定</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">系統類型</label>
                  <select
                    value={form.systemType || ''}
                    onChange={(e) => handleChange('systemType', e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-purple-600"
                  >
                    <option value="">選擇類型...</option>
                    <option value="internal_tool">內部工具</option>
                    <option value="client_system">客戶系統</option>
                    <option value="saas_platform">SaaS 平台</option>
                    <option value="erp">ERP 系統</option>
                    <option value="crm">CRM 系統</option>
                    <option value="other">其他系統</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">部署環境</label>
                  <input
                    value={form.deploymentEnv || ''}
                    onChange={(e) => handleChange('deploymentEnv', e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-purple-600"
                    placeholder="如 AWS, Vercel, GCP..."
                  />
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">技術棧（逗號分隔）</label>
                <input
                  value={(form.techStack || []).join(', ')}
                  onChange={(e) => handleChange('techStack', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-purple-600"
                  placeholder="React, TypeScript, Supabase..."
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">API 文件連結</label>
                <input
                  value={form.apiDocUrl || ''}
                  onChange={(e) => handleChange('apiDocUrl', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-purple-600"
                  placeholder="https://api-docs.example.com"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 resize-none"
              placeholder="其他備註..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
          <button
            onClick={handleSubmit}
            disabled={!form.websiteName || !form.companyId}
            className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'add' ? '新增' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Website List =====
function WebsiteList({ onSelectSite, profileTypeFilter }: { onSelectSite: (site: WebsiteProfileFull) => void; profileTypeFilter?: 'all' | 'website' | 'system' }) {
  const { addWebsiteWithId: addWebsiteToStore, updateWebsite: updateWebsiteInStore } = useDataStore();
  const { profiles: websiteProfiles, loading: profilesLoading, addProfile, updateProfile } = useWebsiteProfiles();
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'internal' | 'client'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'website' | 'system'>(profileTypeFilter || 'all');
  const [levelFilter, setLevelFilter] = useState<number[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSite, setEditingSite] = useState<WebsiteProfileFull | null>(null);

  const filteredBrands = companyFilter === 'all'
    ? brands
    : brands.filter(b => {
        const co = companies.find(c => c.id === b.companyId);
        return co?.companyCode === companyFilter;
      });
  // Deduplicate brands by brandCode for the filter dropdown
  const uniqueBrandCodes = Array.from(
    new Map(filteredBrands.filter(b => b.isActive).map(b => [b.brandCode, b])).values()
  );
  // Map of brandCode -> set of brand ids (so filtering matches all brands sharing the same code)
  const brandIdsByCode = new Map<string, Set<string>>();
  brands.forEach(b => {
    if (!brandIdsByCode.has(b.brandCode)) brandIdsByCode.set(b.brandCode, new Set());
    brandIdsByCode.get(b.brandCode)!.add(b.id);
  });

  const toggleLevelFilter = (lvl: number) => {
    setLevelFilter(prev => prev.includes(lvl) ? prev.filter(l => l !== lvl) : [...prev, lvl]);
  };

  const getWebsiteProjectCategory = (ws: WebsiteProfileFull) => getProjectCategory(ws.projectId, allProjectsData);

  const handleAddWebsite = async (data: WebsiteFormData) => {
    const company = companies.find(c => c.id === data.companyId);
    const brand = brands.find(b => b.id === data.brandId);
    const newSite: WebsiteProfileFull = {
      id: `${data.profileType === 'system' ? 'sys' : 'ws'}_${Date.now()}`,
      companyId: data.companyId,
      brandId: data.brandId,
      websiteName: data.websiteName,
      domainUrl: data.domainUrl,
      platform: data.platform as WebsiteProfileFull['platform'],
      hostingProvider: data.hostingProvider,
      company: company?.companyCode || '',
      brand: brand?.brandCode || '',
      level: data.level,
      status: data.status,
      notes: data.notes || undefined,
      pagesCount: 0,
      articlesCount: 0,
      videosCount: 0,
      socialPostsCount: 0,
      keywordsCount: 0,
      pluginsCount: 0,
      totalHours: 0,
      profileType: data.profileType,
      systemType: data.systemType,
      techStack: data.techStack,
      deploymentEnv: data.deploymentEnv || undefined,
      apiDocUrl: data.apiDocUrl || undefined,
    };
    const err = await addProfile(newSite);
    if (err) {
      toast.error('新增失敗', { description: err.message });
      return;
    }
    addWebsiteToStore(newSite);
    toast.success(data.profileType === 'system' ? '系統已新增' : '網站已新增');
    setShowAddModal(false);
  };

  const handleEditWebsite = async (data: WebsiteFormData) => {
    if (!editingSite) return;
    const company = companies.find(c => c.id === data.companyId);
    const brand = brands.find(b => b.id === data.brandId);
    const updates = {
      websiteName: data.websiteName,
      domainUrl: data.domainUrl,
      companyId: data.companyId,
      brandId: data.brandId,
      platform: data.platform as WebsiteProfileFull['platform'],
      hostingProvider: data.hostingProvider,
      company: company?.companyCode ?? editingSite.company ?? '',
      brand: brand?.brandCode ?? editingSite.brand ?? '',
      level: data.level,
      status: data.status,
      notes: data.notes || undefined,
      systemType: data.systemType,
    };
    await updateProfile(editingSite.id, updates);
    updateWebsiteInStore(editingSite.id, updates);
    setEditingSite(null);
  };

  const getEditFormData = (site: WebsiteProfileFull): WebsiteFormData => ({
    websiteName: site.websiteName,
    domainUrl: site.domainUrl || '',
    companyId: site.companyId,
    brandId: site.brandId,
    platform: site.platform,
    hostingProvider: site.hostingProvider || '',
    level: site.level,
    status: site.status,
    notes: site.notes || '',
    profileType: site.profileType || 'website',
    systemType: site.systemType,
    techStack: site.techStack || [],
    deploymentEnv: site.deploymentEnv || '',
    apiDocUrl: site.apiDocUrl || '',
  });

  const filtered = websiteProfiles.filter(ws => {
    if (typeFilter !== 'all') {
      const wsType = ws.profileType || 'website';
      if (wsType !== typeFilter) return false;
    }
    if (companyFilter !== 'all' && (ws.company || '') !== companyFilter) return false;
    if (brandFilter !== 'all') {
      const matchingIds = brandIdsByCode.get(brandFilter);
      if (!matchingIds || !matchingIds.has(ws.brandId)) return false;
    }
    if (statusFilter !== 'all' && ws.status !== statusFilter) return false;
    if (levelFilter.length > 0 && !levelFilter.includes(ws.level)) return false;
    if (categoryFilter !== 'all') {
      const { category } = getWebsiteProjectCategory(ws);
      if (category !== categoryFilter) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return ws.websiteName.toLowerCase().includes(q) || (ws.domainUrl || '').toLowerCase().includes(q) || (ws.brand || '').toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => b.totalHours - a.totalHours);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{typeFilter === 'system' ? '系統列表' : typeFilter === 'website' ? '網站列表' : '網站+系統 列表'}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{typeFilter === 'system' ? '所有 System Profile 的管理樞紐。' : typeFilter === 'website' ? '所有 Website Profile 的管理樞紐。' : '所有網站與系統 Profile 的統一管理。'}</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]">
          <Plus size={14} />{typeFilter === 'system' ? '新增系統' : '新增網站'}
        </button>
      </div>

      {/* Profile Type Quick Switch */}
      <div className="flex items-center gap-1.5">
        {(['all', 'website', 'system'] as const).map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={cn(
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200 flex items-center gap-1.5',
              typeFilter === type ? (type === 'system' ? 'bg-purple-600 text-white' : 'bg-teal-600 text-white') : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {type === 'all' && '全部'}
            {type === 'website' && <><Globe size={11} />網站</>}
            {type === 'system' && <><Server size={11} />系統</>}
          </button>
        ))}
      </div>

      {/* Category Quick Switch Tabs */}
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
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[260px]">
          <Search size={14} className="text-muted-foreground" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" placeholder="搜尋網站名稱..." />
        </div>
        <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setBrandFilter('all'); }} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          <option value="all">所有公司</option>
          {Array.from(new Set(websiteProfiles.map(p => p.company || '').filter(Boolean))).sort().map(code => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          <option value="all">所有品牌</option>
          {uniqueBrandCodes.map(b => (
            <option key={b.brandCode} value={b.brandCode}>{b.brandCode}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          <option value="all">所有狀態</option>
          <option value="live">已上線</option>
          <option value="development">開發中</option>
          <option value="maintenance">維護中</option>
          <option value="archived">已封存</option>
        </select>
      </div>

      {/* Level Filter Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-muted-foreground font-medium">Level 篩選：</span>
        {([1, 2, 3, 4, 5] as WebsiteLevel[]).map(lvl => {
          const active = levelFilter.includes(lvl);
          return (
            <button
              key={lvl}
              onClick={() => toggleLevelFilter(lvl)}
              className={cn(
                'text-[11px] px-2 py-1 rounded-md border font-bold transition-all',
                active
                  ? levelConfig[lvl].className + ' shadow-sm'
                  : 'border-border bg-white text-muted-foreground hover:border-slate-400'
              )}
            >
              L{lvl} {levelConfig[lvl].label}
            </button>
          );
        })}
        {levelFilter.length > 0 && (
          <button onClick={() => setLevelFilter([])} className="text-[11px] text-rose-500 hover:underline ml-1">清除篩選</button>
        )}
      </div>

      {/* Results Count */}
      <div className="text-[12px] text-muted-foreground">
        {profilesLoading ? '載入中…' : `顯示 ${filtered.length} 個${typeFilter === 'system' ? '系統' : typeFilter === 'website' ? '網站' : '項目'}`}
      </div>

      {/* Content - Table Only */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
        {profilesLoading ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
            從資料庫載入中…
          </div>
        ) : null}
        <table className="w-full" style={{ display: profilesLoading ? 'none' : undefined }}>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">名稱</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">類型</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">項目類型</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">LEVEL</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">平台</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">品牌</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">公司</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">文章</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">影片</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">工時</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(site => {
              const config = statusConfig[site.status];
              const { category, clientName } = getProjectCategory(site.projectId, allProjectsData);
              return (
                <tr key={site.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3">
                    <div>
                      <span className="text-[13px] font-medium block">{site.websiteName}</span>
                      <span className="text-[11px] text-teal-600">{site.domainUrl}</span>
                    </div>
                  </td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><ProfileTypeBadge profileType={site.profileType} size="small" /></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><ProjectCategoryBadge category={category} clientName={clientName} size="sm" /></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><WebsiteLevelBadge level={site.level} size="small" /></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><span className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{site.platform}</span></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{site.brand}</span></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{site.company}</span></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', config.bgColor, config.color)}>{config.label}</span></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3 text-[13px]">{site.articlesCount}</td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3 text-[13px]">{site.videosCount}</td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3 text-[13px] font-medium">{site.totalHours}h</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingSite(site); }}
                      className="p-1.5 hover:bg-muted rounded-md transition-colors"
                      title="編輯網站"
                    >
                      <Pencil size={13} className="text-muted-foreground" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <WebsiteFormModal
          mode="add"
          onClose={() => setShowAddModal(false)}
          onSave={handleAddWebsite}
        />
      )}

      {/* Edit Modal */}
      {editingSite && (
        <WebsiteFormModal
          mode="edit"
          initialData={getEditFormData(editingSite)}
          onClose={() => setEditingSite(null)}
          onSave={handleEditWebsite}
        />
      )}
    </div>
  );
}

// ===== Featured Website Card (enhanced) =====
function FeaturedWebsiteCard({ site, onClick }: { site: WebsiteProfileFull; onClick: () => void }) {
  const config = statusConfig[site.status];
  const budgetPercent = site.budgetTotal ? Math.round((site.budgetUsed || 0) / site.budgetTotal * 100) : 0;
  const lastUpdate = '2024-12-01';

  // Mock last article title
  const lastArticleTitles: Record<string, string> = {
    'w1': '紅酒保存的10個技巧',
    'w2': '活動策劃完整指南 2025',
    'w3': 'Web Design Trends 2025',
    'w4': '品酒入門 — 法國波爾多篇',
    'w5': 'BSC 品牌設計案例分享',
  };
  const lastArticleTitle = lastArticleTitles[site.id];

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5 hover:shadow-[0_4px_14px_rgba(0,20,40,0.1)] transition-all duration-200 cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />
            <h4 className="text-[15px] font-bold truncate group-hover:text-teal-700 transition-colors">{site.websiteName}</h4>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Globe size={11} className="text-muted-foreground shrink-0" />
            <a href={`https://${site.domainUrl}`} onClick={e => e.stopPropagation()} className="text-[12px] text-teal-600 hover:underline truncate">{site.domainUrl}</a>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <WebsiteLevelBadge level={site.level} />
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-sm', config.bgColor, config.color)}>{config.label}</span>
        </div>
      </div>

      {/* Company / Brand */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{site.company}</span>
        <span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{site.brand}</span>
        <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded capitalize">{site.platform}</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-4 pb-4 border-b border-border/50">
        <div className="text-center">
          <span className="text-[16px] font-bold text-teal-700 block">{site.articlesCount}</span>
          <span className="text-[10px] text-muted-foreground">文章</span>
        </div>
        <div className="text-center">
          <span className="text-[16px] font-bold text-blue-700 block">{site.videosCount}</span>
          <span className="text-[10px] text-muted-foreground">影片</span>
        </div>
        <div className="text-center">
          <span className="text-[16px] font-bold text-purple-700 block">{site.socialPostsCount}</span>
          <span className="text-[10px] text-muted-foreground">社交帖</span>
        </div>
      </div>

      {/* Budget bar */}
      {site.budgetTotal ? (
        <div className="mb-3">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-muted-foreground">預算使用率</span>
            <span className={cn('font-medium', budgetPercent >= 90 ? 'text-rose-600' : budgetPercent >= 70 ? 'text-amber-600' : 'text-teal-600')}>{budgetPercent}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', budgetPercent >= 90 ? 'bg-rose-500' : budgetPercent >= 70 ? 'bg-amber-500' : 'bg-teal-500')}
              style={{ width: `${Math.min(budgetPercent, 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Last article title */}
      {lastArticleTitle && (
        <div className="mb-2 px-2 py-1.5 bg-muted/40 rounded text-[11px] truncate">
          <span className="text-muted-foreground">最新文章：</span>
          <span className="font-medium">{lastArticleTitle}</span>
        </div>
      )}

      {/* Last update */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>最近更新：{lastUpdate}</span>
        <ExternalLink size={11} className="text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

type FeaturedFilter = 'level_1_2' | 'all' | 'high_articles' | 'high_budget' | 'recently_updated' | 'live_maintenance';

// ===== Featured Websites =====
function FeaturedWebsites({ onSelectSite }: { onSelectSite: (site: WebsiteProfileFull) => void }) {
  const { profiles: websiteProfiles } = useWebsiteProfiles();
  const [activeFilter, setActiveFilter] = useState<FeaturedFilter>('level_1_2');

  const filters: { id: FeaturedFilter; label: string; desc: string }[] = [
    { id: 'level_1_2', label: '主打 + 重要', desc: 'Level 1-2' },
    { id: 'all', label: '全部網站', desc: '' },
    { id: 'high_articles', label: '高活躍度', desc: '文章數 > 10' },
    { id: 'high_budget', label: '高預算使用率', desc: '預算使用 > 70%' },
    { id: 'recently_updated', label: '最近更新', desc: '近期有新內容' },
    { id: 'live_maintenance', label: '已上線/維護中', desc: '' },
  ];

  const applyFilter = (sites: WebsiteProfileFull[]) => {
    switch (activeFilter) {
      case 'level_1_2': return sites.filter(ws => ws.level === 1 || ws.level === 2);
      case 'high_articles': return sites.filter(ws => ws.articlesCount > 10);
      case 'high_budget': return sites.filter(ws => ws.budgetTotal ? (ws.budgetUsed || 0) / ws.budgetTotal > 0.7 : false);
      case 'recently_updated': return sites.filter(ws => ws.articlesCount > 0 || ws.videosCount > 0);
      case 'live_maintenance': return sites.filter(ws => ws.status === 'live' || ws.status === 'maintenance');
      default: return sites;
    }
  };

  const featured = applyFilter(websiteProfiles).sort((a, b) => a.level - b.level);

  const filterDescription = activeFilter === 'level_1_2' ? '目前顯示：主打網站 + 重要網站（Level 1-2）' : activeFilter === 'all' ? '顯示所有網站' : '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">重點網站</h1>
          <p className="text-[14px] text-muted-foreground mt-1">已上線及重點追蹤的網站，含智能篩選器。</p>
        </div>
        <div className="text-[13px] text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
          共 <span className="font-bold text-foreground">{featured.length}</span> 個網站
        </div>
      </div>

      {/* Current filter description */}
      {filterDescription && (
        <div className="bg-gradient-to-r from-amber-50 to-teal-50 border border-amber-200 rounded-md px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Star size={14} className="text-amber-500 fill-amber-400" />
            <span className="text-[13px] font-medium text-amber-800">{filterDescription}</span>
          </div>
        </div>
      )}

      {/* Smart filter buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border',
              activeFilter === f.id
                ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                : 'bg-white text-muted-foreground border-border hover:border-teal-400 hover:text-teal-700'
            )}
          >
            {f.id === 'level_1_2' && <Star size={11} />}
            {f.id === 'high_articles' && <TrendingUp size={11} />}
            {f.id === 'high_budget' && <span className="text-[10px]">💰</span>}
            {f.id === 'recently_updated' && <Calendar size={11} />}
            {f.id === 'live_maintenance' && <Globe size={11} />}
            {f.id === 'all' && <LayoutGrid size={11} />}
            {f.label}
            {f.desc && <span className="text-[10px] opacity-70">({f.desc})</span>}
          </button>
        ))}
        {activeFilter !== 'level_1_2' && (
          <button
            onClick={() => setActiveFilter('level_1_2')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
          >
            ✕ 重置篩選
          </button>
        )}
      </div>

      {featured.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <Star size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">沒有符合條件的網站</p>
          <p className="text-[12px] text-muted-foreground mt-1">嘗試更換篩選條件</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featured.map(site => (
            <FeaturedWebsiteCard key={site.id} site={site} onClick={() => onSelectSite(site)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Global Article List (under website module) =====
const articleStatusConfig2 = {
  draft: { label: '草稿', color: 'text-slate-700', bgColor: 'bg-slate-50' },
  writing: { label: '撰寫中', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  review: { label: '審核中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  published: { label: '已發佈', color: 'text-teal-700', bgColor: 'bg-teal-50' },
};

const channelLabels: Record<string, string> = {
  website_article: '網站文章',
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  xiaohongshu: '小紅書',
  other_video: '其他影片',
};

// ===== Add Website to Article Modal =====
function AddWebsiteToArticleModal({
  articleId,
  existingWebsiteIds,
  onClose,
  onAdd,
}: {
  articleId: string;
  existingWebsiteIds: string[];
  onClose: () => void;
  onAdd: (websiteIds: string[]) => void;
}) {
  const { profiles: websiteProfiles } = useWebsiteProfiles();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const available = websiteProfiles.filter(ws => !existingWebsiteIds.includes(ws.id));
  const filtered = available.filter(ws =>
    !searchQuery || ws.websiteName.toLowerCase().includes(searchQuery.toLowerCase()) || (ws.brand || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggle = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[560px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">加入其他網站</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm">
            <Search size={14} className="text-muted-foreground" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" placeholder="搜尋網站名稱..." />
          </div>
          {selectedIds.length > 0 && <div className="text-[12px] text-teal-600 font-medium">已選擇 {selectedIds.length} 個網站</div>}
          <div className="space-y-1 max-h-[320px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-6 text-[13px] text-muted-foreground">沒有可加入的網站</div>
            ) : filtered.map(ws => {
              const isSel = selectedIds.includes(ws.id);
              return (
                <div key={ws.id} onClick={() => toggle(ws.id)} className={cn('flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all', isSel ? 'border-teal-600 bg-teal-50' : 'border-border hover:bg-muted/30')}>
                  <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0', isSel ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/30')}>
                    {isSel && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium block">{ws.websiteName}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Globe size={10} className="text-muted-foreground" />
                      <span className="text-[11px] text-teal-600">{ws.domainUrl}</span>
                      <span className="text-[11px] bg-teal-50 text-teal-700 px-1 py-0.5 rounded">{ws.brand}</span>
                      <span className="text-[11px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded">{ws.company}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
          <button onClick={() => { onAdd(selectedIds); onClose(); }} disabled={selectedIds.length === 0} className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed">
            加入 {selectedIds.length} 個網站
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Article Detail (inside Website module) =====
function ArticleDetailView({ article, onBack }: { article: Article; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState('info');
  const [relatedWebsites, setRelatedWebsites] = useState<WebsiteProfileFull[]>(() => getWebsitesForArticle(article.id));
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const existingWebsiteIds = relatedWebsites.map(ws => ws.id);
  const statusCfg = articleStatusConfig2[article.contentStatus];

  const handleAddWebsites = (ids: string[]) => {
    ids.forEach(id => addWebsiteToArticle(article.id, id));
    setRelatedWebsites(getWebsitesForArticle(article.id));
  };
  const handleRemoveWebsite = (wsId: string) => {
    removeWebsiteFromArticle(article.id, wsId);
    setRelatedWebsites(getWebsitesForArticle(article.id));
    setRemoveConfirmId(null);
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-teal-600 font-medium hover:underline">
        <ArrowLeft size={14} />返回文章列表
      </button>
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[20px] font-bold">{article.title}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', statusCfg.bgColor, statusCfg.color)}>{statusCfg.label}</span>
              <span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{article.brand}</span>
              <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{channelLabels[article.channel] || article.channel}</span>
              {article.authorName && <span className="text-[12px] text-muted-foreground">撰稿人：{article.authorName}</span>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><span className="text-[18px] font-bold block">{article.wordCount || 0}</span><span className="text-[10px] text-muted-foreground">字數</span></div>
            <div><span className="text-[18px] font-bold block">{article.hoursSpent || 0}h</span><span className="text-[10px] text-muted-foreground">工時</span></div>
            <div><span className="text-[18px] font-bold block">{relatedWebsites.length}</span><span className="text-[10px] text-muted-foreground">所屬網站</span></div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border pb-0">
        {[{ id: 'info', label: '文章資訊' }, { id: 'websites', label: `所屬網站 (${relatedWebsites.length})` }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('px-3 py-2 text-[13px] font-medium border-b-2 transition-all', activeTab === tab.id ? 'border-teal-600 text-teal-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h5 className="text-[14px] font-bold">基本資料</h5>
              <div className="space-y-2">
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">渠道</span><span className="font-medium">{channelLabels[article.channel]}</span></div>
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">品牌</span><span className="font-medium">{article.brand}</span></div>
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">公司</span><span className="font-medium">{article.company || '—'}</span></div>
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">撰稿人</span><span className="font-medium">{article.authorName || '—'}</span></div>
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">字數</span><span className="font-medium">{article.wordCount?.toLocaleString() || '—'}</span></div>
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">工時</span><span className="font-medium">{article.hoursSpent ? `${article.hoursSpent}h` : '—'}</span></div>
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">發佈日期</span><span className="font-medium">{article.publishDate || '—'}</span></div>
                <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">SEO 分數</span><span className="font-medium">{article.seoScore ? `${article.seoScore}/100` : '—'}</span></div>
              </div>
            </div>
            <div className="space-y-3">
              <h5 className="text-[14px] font-bold">SEO 關鍵字</h5>
              {article.targetKeywords && article.targetKeywords.length > 0 ? (
                <div className="space-y-2">
                  {article.targetKeywords.map((kw, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-sm font-bold border',
                        kw.level === 'S1' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        kw.level === 'S2' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-green-50 text-green-700 border-green-200'
                      )}>{kw.level}</span>
                      <span className="text-[13px]">{kw.keyword}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[13px] text-muted-foreground">尚未設定關鍵字</p>}
              {article.url && (
                <div className="pt-3 border-t border-border/50">
                  <h5 className="text-[14px] font-bold mb-2">文章連結</h5>
                  <a href={article.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] text-teal-600 hover:underline">
                    <ExternalLink size={11} />{article.url}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'websites' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-[15px] font-bold">所屬網站</h4>
                <p className="text-[12px] text-muted-foreground mt-0.5">此文章已發佈於 {relatedWebsites.length} 個網站（多對多關聯）</p>
              </div>
              <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors">
                <Plus size={13} />批量加入網站
              </button>
            </div>
            {relatedWebsites.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-md">
                <Globe size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-[14px] font-medium text-muted-foreground">此文章尚未關聯任何網站</p>
                <p className="text-[12px] text-muted-foreground mt-1">點擊「批量加入網站」開始關聯</p>
              </div>
            ) : (
              <div className="space-y-2">
                {relatedWebsites.map(ws => {
                  const cfg = statusConfig[ws.status];
                  return (
                    <div key={ws.id} className="flex items-center justify-between p-4 bg-muted/20 rounded-md border border-border/50 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <Globe size={16} className="text-teal-600" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium">{ws.websiteName}</span>
                            <WebsiteLevelBadge level={ws.level} size="small" />
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-teal-600">{ws.domainUrl}</span>
                            <span className="text-[11px] bg-teal-50 text-teal-700 px-1 py-0.5 rounded">{ws.brand}</span>
                            <span className="text-[11px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded">{ws.company}</span>
                            <span className={cn('text-[10px] font-medium px-1 py-0.5 rounded-sm', cfg.bgColor, cfg.color)}>{cfg.label}</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setRemoveConfirmId(ws.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded transition-colors" title="移除關聯">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {showAddModal && (
              <AddWebsiteToArticleModal
                articleId={article.id}
                existingWebsiteIds={existingWebsiteIds}
                onClose={() => setShowAddModal(false)}
                onAdd={handleAddWebsites}
              />
            )}
            {/* Remove confirm */}
            {removeConfirmId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-[380px]">
                  <h3 className="text-[16px] font-bold mb-2">確認移除關聯</h3>
                  <p className="text-[13px] text-muted-foreground mb-4">確定要移除此文章與網站的關聯嗎？此操作不會刪除網站或文章本身。</p>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setRemoveConfirmId(null)} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
                    <button onClick={() => handleRemoveWebsite(removeConfirmId)} className="px-4 py-2 text-[13px] font-medium bg-rose-600 text-white rounded-md hover:bg-rose-700">確認移除</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Batch Add Articles to Website Modal =====
function BatchAddToWebsiteModal({
  selectedArticleIds,
  onClose,
  onDone,
}: {
  selectedArticleIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { profiles: websiteProfiles } = useWebsiteProfiles();
  const [selectedWebsiteIds, setSelectedWebsiteIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const filtered = websiteProfiles.filter(ws =>
    !search || ws.websiteName.toLowerCase().includes(search.toLowerCase()) || (ws.brand || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setSelectedWebsiteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSubmit = () => {
    selectedArticleIds.forEach(articleId => {
      selectedWebsiteIds.forEach(wsId => {
        addWebsiteToArticle(articleId, wsId);
      });
    });
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[540px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-[16px] font-bold">批量加入網站</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">將 {selectedArticleIds.length} 篇文章加入選定網站</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm">
            <Search size={14} className="text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" placeholder="搜尋網站..." />
          </div>
          {selectedWebsiteIds.length > 0 && <div className="text-[12px] text-teal-600 font-medium">已選擇 {selectedWebsiteIds.length} 個網站</div>}
          <div className="space-y-1 max-h-[320px] overflow-y-auto">
            {filtered.map(ws => {
              const isSel = selectedWebsiteIds.includes(ws.id);
              const cfg = statusConfig[ws.status];
              return (
                <div key={ws.id} onClick={() => toggle(ws.id)} className={cn('flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all', isSel ? 'border-teal-600 bg-teal-50' : 'border-border hover:bg-muted/30')}>
                  <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0', isSel ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/30')}>
                    {isSel && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-medium block">{ws.websiteName}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Globe size={10} className="text-muted-foreground" />
                      <span className="text-[11px] text-teal-600">{ws.domainUrl}</span>
                      <span className="text-[11px] bg-teal-50 text-teal-700 px-1 py-0.5 rounded">{ws.brand}</span>
                    </div>
                  </div>
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-sm shrink-0', cfg.bgColor, cfg.color)}>{cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
          <button
            onClick={handleSubmit}
            disabled={selectedWebsiteIds.length === 0}
            className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            加入 {selectedWebsiteIds.length} 個網站
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Global Article List =====
function GlobalArticleList({ onSelectArticle }: { onSelectArticle: (a: Article) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [, forceUpdate] = useState(0);

  const filteredBrands = companyFilter === 'all' ? brands : brands.filter(b => b.companyId === companyFilter);
  const filtered = allArticles.filter(a => {
    if (companyFilter !== 'all' && a.companyId !== companyFilter) return false;
    if (brandFilter !== 'all' && a.brandId !== brandFilter) return false;
    if (statusFilter !== 'all' && a.contentStatus !== statusFilter) return false;
    if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(prev => prev.length === filtered.length ? [] : filtered.map(a => a.id));
  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">文章列表</h1>
          <p className="text-[14px] text-muted-foreground mt-1">管理 SEO 文章、內容發佈及多對多網站關聯。</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-600 text-teal-700 rounded-md text-[12px] font-medium hover:bg-teal-100 transition-colors"
            >
              <Globe size={13} />批量加入網站（{selectedIds.length}）
            </button>
          )}
          <button className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]">
            <Plus size={14} />新增文章
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[260px]">
          <Search size={14} className="text-muted-foreground" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" placeholder="搜尋文章..." />
        </div>
        <select value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setBrandFilter('all'); }} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          <option value="all">所有公司</option>
          {companies.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.companyCode}</option>)}
        </select>
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          <option value="all">所有品牌</option>
          {filteredBrands.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.brandCode}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          <option value="all">所有狀態</option>
          <option value="draft">草稿</option>
          <option value="writing">撰寫中</option>
          <option value="review">審核中</option>
          <option value="published">已發佈</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted-foreground">顯示 {filtered.length} 篇文章{selectedIds.length > 0 && <span className="ml-2 text-teal-600 font-medium">• 已選 {selectedIds.length} 篇</span>}</div>
        {filtered.length > 0 && (
          <button onClick={toggleAll} className="text-[12px] text-teal-600 hover:underline">
            {allSelected ? '取消全選' : '全選'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 w-8">
                <div
                  onClick={toggleAll}
                  className={cn('w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer', allSelected ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/40')}
                >
                  {allSelected && <Check size={10} className="text-white" />}
                </div>
              </th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">標題</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">渠道</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">品牌</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">撰稿人</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">工時</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">SEO Tags</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">所屬網站</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">成果</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(article => {
              const config = articleStatusConfig2[article.contentStatus];
              const isSelected = selectedIds.includes(article.id);
              const relatedWebsites = getWebsitesForArticle(article.id);
              return (
                <tr
                  key={article.id}
                  className={cn('border-b border-border/50 hover:bg-muted/20 transition-colors', isSelected && 'bg-teal-50/50')}
                >
                  <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(article.id); }}>
                    <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer', isSelected ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/40')}>
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => onSelectArticle(article)}>
                    <span className="text-[13px] font-medium max-w-[200px] truncate block hover:text-teal-700 transition-colors">{article.title}</span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{channelLabels[article.channel] || article.channel}</td>
                  <td className="px-4 py-3"><span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{article.brand}</span></td>
                  <td className="px-4 py-3 text-[13px]">{article.authorName || '—'}</td>
                  <td className="px-4 py-3 text-[13px] font-medium">{article.hoursSpent ? `${article.hoursSpent}h` : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {article.targetKeywords?.slice(0, 2).map((kw, i) => (
                        <span key={i} className={cn('text-[10px] px-1.5 py-0.5 rounded-sm font-bold border',
                          kw.level === 'S1'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : kw.level === 'S2'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-green-50 text-green-700 border-green-200'
                        )}>
                          {kw.level}
                          <span className="font-normal ml-0.5">{kw.keyword}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', config.bgColor, config.color)}>{config.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    {relatedWebsites.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {relatedWebsites.slice(0, 2).map(ws => (
                          <span key={ws.id} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 cursor-pointer transition-colors inline-flex items-center gap-0.5" title={ws.domainUrl}>
                            {ws.websiteName}
                            <span className={cn('text-[8px] font-bold px-0.5 rounded-sm border ml-0.5', levelConfig[ws.level].className)}>L{ws.level}</span>
                          </span>
                        ))}
                        {relatedWebsites.length > 2 && (
                          <span className="text-[10px] bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded border border-teal-200 cursor-pointer font-medium" title={relatedWebsites.slice(2).map(w => w.websiteName).join(', ')}>+{relatedWebsites.length - 2} 個</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">未關聯</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {article.url ? (
                      <a href={article.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-700 hover:underline font-medium transition-colors">
                        <ExternalLink size={11} />查看文章
                      </a>
                    ) : <span className="text-[11px] text-muted-foreground">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-10 text-[13px] text-muted-foreground">
            <FileText size={28} className="text-muted-foreground/40 mx-auto mb-2" />
            沒有符合條件的文章
          </div>
        )}
      </div>

      {showBatchModal && (
        <BatchAddToWebsiteModal
          selectedArticleIds={selectedIds}
          onClose={() => setShowBatchModal(false)}
          onDone={() => { setSelectedIds([]); forceUpdate(n => n + 1); }}
        />
      )}
    </div>
  );
}

// ===== Pending Content (待跟進項目) =====
const mockPendingEntries = [
  { id: '1', title: '電商網站轉換率優化 5 大秘訣', brand: 'BW Design', plannedDate: '2025-01-15', source: 'AI 生成', status: 'planned' as const, aiGenerated: true, notes: '根據 S1 關鍵字「轉換率」自動生成' },
  { id: '2', title: '如何選擇適合的網站主機', brand: 'BW Design', plannedDate: '2025-01-18', source: 'AI 生成', status: 'planned' as const, aiGenerated: true, notes: '根據 S2 關鍵字「網站主機」自動生成' },
  { id: '3', title: 'Google Ads vs Facebook Ads 比較分析', brand: 'ACI Global', plannedDate: '2025-01-20', source: 'AI 生成', status: 'in_progress' as const, aiGenerated: true, notes: '' },
  { id: '4', title: '品牌形象設計的重要性', brand: 'FCC Media', plannedDate: '2025-01-22', source: '手動新增', status: 'planned' as const, aiGenerated: false, notes: '客戶要求主題' },
  { id: '5', title: '小紅書行銷攻略 2025', brand: 'BW Design', plannedDate: '2025-01-25', source: 'AI 生成', status: 'planned' as const, aiGenerated: true, notes: '根據社交媒體關鍵字生成' },
];

function SubmitCompleteModal({
  entry,
  onClose,
  onDone,
}: {
  entry: typeof mockPendingEntries[0];
  onClose: () => void;
  onDone: () => void;
}) {
  const { profiles: websiteProfiles } = useWebsiteProfiles();
  // Pre-select recommended website based on brand matching
  const recommended = websiteProfiles.filter(ws =>
    ws.brand === entry.brand || (ws.brand || '').toLowerCase().includes(entry.brand.toLowerCase().split(' ')[0])
  );
  const [selectedWebsiteIds, setSelectedWebsiteIds] = useState<string[]>(recommended.map(r => r.id));
  const [search, setSearch] = useState('');

  const filtered = websiteProfiles.filter(ws =>
    !search || ws.websiteName.toLowerCase().includes(search.toLowerCase()) || (ws.brand || '').toLowerCase().includes(search.toLowerCase())
  );
  const toggle = (id: string) => setSelectedWebsiteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSubmit = () => {
    // Create article record linked to selected websites
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[540px] max-h-[75vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-[16px] font-bold">提交完成</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5 max-w-[360px] truncate">「{entry.title}」</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="bg-teal-50 rounded-md p-3 border border-teal-200">
            <p className="text-[12px] text-teal-700">選擇要將此文章關聯到的網站，系統將自動建立文章記錄並關聯。</p>
          </div>

          {/* Recommended sites */}
          {recommended.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-[11px] font-bold text-amber-700 mb-1">⭐ 推薦網站（根據品牌「{entry.brand}」自動匹配）</p>
              <div className="flex items-center gap-2">
                {recommended.map(ws => (
                  <span key={ws.id} className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">{ws.websiteName}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-2">選擇網站（可多選）</label>
            <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm mb-3">
              <Search size={14} className="text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" placeholder="搜尋網站..." />
            </div>
            {selectedWebsiteIds.length > 0 && <div className="text-[12px] text-teal-600 font-medium mb-2">已選擇 {selectedWebsiteIds.length} 個網站</div>}
            <div className="space-y-1 max-h-[260px] overflow-y-auto">
              {filtered.map(ws => {
                const isSel = selectedWebsiteIds.includes(ws.id);
                const cfg = statusConfig[ws.status];
                const isRecommended = recommended.some(r => r.id === ws.id);
                return (
                  <div key={ws.id} onClick={() => toggle(ws.id)} className={cn('flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all', isSel ? 'border-teal-600 bg-teal-50' : 'border-border hover:bg-muted/30')}>
                    <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0', isSel ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/30')}>
                      {isSel && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium block">{ws.websiteName}</span>
                        {isRecommended && <span className="text-[9px] bg-amber-100 text-amber-600 px-1 py-0.5 rounded font-bold">推薦</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-teal-600">{ws.domainUrl}</span>
                        <span className="text-[11px] bg-teal-50 text-teal-700 px-1 py-0.5 rounded">{ws.brand}</span>
                      </div>
                    </div>
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-sm shrink-0', cfg.bgColor, cfg.color)}>{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700"
          >
            <Check size={13} className="inline mr-1" />建立文章記錄{selectedWebsiteIds.length > 0 ? `（關聯 ${selectedWebsiteIds.length} 個網站）` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function PendingContent() {
  const [entries, setEntries] = useState(mockPendingEntries);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitEntry, setSubmitEntry] = useState<typeof mockPendingEntries[0] | null>(null);
  const [showBatchStartConfirm, setShowBatchStartConfirm] = useState(false);
  const [showBatchCompleteModal, setShowBatchCompleteModal] = useState(false);

  const statusCfgMap = {
    planned: { label: '待跟進', color: 'text-amber-700', bgColor: 'bg-amber-50' },
    in_progress: { label: '撰寫中', color: 'text-blue-700', bgColor: 'bg-blue-50' },
    completed: { label: '已完成', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  };

  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(prev => prev.length === entries.length ? [] : entries.map(e => e.id));
  const allSelected = entries.length > 0 && selectedIds.length === entries.length;

  const handleStart = (id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'in_progress' as const } : e));
  };

  const handleComplete = (entry: typeof mockPendingEntries[0]) => {
    setSubmitEntry(entry);
  };

  const handleCompleted = (id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'completed' as const } : e));
  };

  const handleBatchStart = () => {
    setEntries(prev => prev.map(e => selectedIds.includes(e.id) && e.status === 'planned' ? { ...e, status: 'in_progress' as const } : e));
    setSelectedIds([]);
    setShowBatchStartConfirm(false);
  };

  const pendingCount = entries.filter(e => e.status === 'planned').length;
  const inProgressCount = entries.filter(e => e.status === 'in_progress').length;
  const completedCount = entries.filter(e => e.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">待跟進項目</h1>
          <p className="text-[14px] text-muted-foreground mt-1">AI 建議文章主題及待轉為正式文章的記錄。</p>
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBatchStartConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700"
            >
              <FileText size={13} />批量開始撰寫（{selectedIds.length}）
            </button>
            <button
              onClick={() => setShowBatchCompleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-teal-600 text-teal-700 rounded-md text-[12px] font-medium hover:bg-teal-50"
            >
              <Check size={13} />批量提交完成（{selectedIds.length}）
            </button>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-center">
          <span className="text-[22px] font-bold text-amber-700 block">{pendingCount}</span>
          <span className="text-[12px] text-amber-600">待跟進</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-center">
          <span className="text-[22px] font-bold text-blue-700 block">{inProgressCount}</span>
          <span className="text-[12px] text-blue-600">撰寫中</span>
        </div>
        <div className="bg-teal-50 border border-teal-200 rounded-md p-3 text-center">
          <span className="text-[22px] font-bold text-teal-700 block">{completedCount}</span>
          <span className="text-[12px] text-teal-600">已完成</span>
        </div>
      </div>

      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-md border border-teal-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-teal-600" />
          <span className="text-[13px] font-bold text-teal-800">AI 建議的文章主題</span>
        </div>
        <p className="text-[12px] text-teal-700">系統根據 SEO 關鍵字庫生成的文章建議。「開始撰寫」→ 更新狀態並跳轉新增文章表單；「提交完成」→ 建立文章記錄並關聯網站。</p>
      </div>

      {/* Select all bar */}
      <div className="flex items-center justify-between">
        <button onClick={toggleAll} className="flex items-center gap-2 text-[12px] text-teal-600 hover:underline">
          <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center', allSelected ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/40')}>
            {allSelected && <Check size={10} className="text-white" />}
          </div>
          {allSelected ? '取消全選' : '全選'}
        </button>
        {selectedIds.length > 0 && <span className="text-[12px] text-teal-600 font-medium">已選 {selectedIds.length} 項</span>}
      </div>

      <div className="space-y-3">
        {entries.map(entry => {
          const config = statusCfgMap[entry.status];
          const isSelected = selectedIds.includes(entry.id);
          return (
            <div
              key={entry.id}
              className={cn(
                'bg-white rounded-md border shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4 transition-all',
                isSelected ? 'border-teal-400 bg-teal-50/30' : 'border-[rgba(13,26,45,0.08)]'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <div
                  onClick={() => toggleSelect(entry.id)}
                  className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer mt-0.5', isSelected ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/40')}
                >
                  {isSelected && <Check size={12} className="text-white" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {entry.aiGenerated && <Sparkles size={12} className="text-teal-600 shrink-0" />}
                        <span className="text-[14px] font-semibold">{entry.title}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-medium">{entry.brand}</span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Calendar size={10} />計劃日期：{entry.plannedDate}
                        </span>
                        <span className={cn('text-[10px] px-1 py-0.5 rounded', entry.aiGenerated ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'bg-muted text-muted-foreground')}>
                          {entry.source}
                        </span>
                      </div>
                      {entry.notes && (
                        <p className="text-[11px] text-muted-foreground mt-1.5 italic">{entry.notes}</p>
                      )}
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('text-[11px] font-medium px-2 py-1 rounded-sm', config.bgColor, config.color)}>{config.label}</span>
                      {entry.status === 'planned' && (
                        <button
                          onClick={() => handleStart(entry.id)}
                          className="text-[12px] px-3 py-1.5 bg-teal-600 text-white rounded-md hover:bg-teal-700 font-medium transition-colors flex items-center gap-1"
                        >
                          <FileText size={12} />開始撰寫
                        </button>
                      )}
                      {entry.status === 'in_progress' && (
                        <button
                          onClick={() => handleComplete(entry)}
                          className="text-[12px] px-3 py-1.5 border-2 border-teal-600 text-teal-700 rounded-md hover:bg-teal-50 font-medium transition-colors flex items-center gap-1"
                        >
                          <Check size={12} />提交完成
                        </button>
                      )}
                      {entry.status === 'completed' && (
                        <span className="text-[12px] text-teal-600 flex items-center gap-1">
                          <Check size={12} />已建立
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Batch start confirm */}
      {showBatchStartConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-[380px]">
            <h3 className="text-[16px] font-bold mb-2">批量開始撰寫</h3>
            <p className="text-[13px] text-muted-foreground mb-4">將 {selectedIds.length} 個「待跟進」項目的狀態更新為「撰寫中」？</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowBatchStartConfirm(false)} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
              <button onClick={handleBatchStart} className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700">確認</button>
            </div>
          </div>
        </div>
      )}

      {/* Submit complete modal */}
      {submitEntry && (
        <SubmitCompleteModal
          entry={submitEntry}
          onClose={() => setSubmitEntry(null)}
          onDone={() => { handleCompleted(submitEntry.id); setSubmitEntry(null); }}
        />
      )}

      {/* Batch complete modal */}
      {showBatchCompleteModal && selectedIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-[420px]">
            <h3 className="text-[16px] font-bold mb-2">批量提交完成</h3>
            <p className="text-[13px] text-muted-foreground mb-3">將以下 {selectedIds.length} 個項目標記為已完成並建立文章記錄：</p>
            <div className="space-y-1 max-h-[180px] overflow-y-auto mb-4">
              {entries.filter(e => selectedIds.includes(e.id)).map(e => (
                <div key={e.id} className="flex items-center gap-2 text-[12px]">
                  <Check size={11} className="text-teal-600" />
                  <span className="truncate">{e.title}</span>
                  <span className="text-[10px] bg-teal-50 text-teal-700 px-1 py-0.5 rounded shrink-0">{e.brand}</span>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-amber-600 bg-amber-50 px-3 py-2 rounded mb-4">系統將根據各項目的品牌自動推薦並關聯到最相關的網站。</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowBatchCompleteModal(false)} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
              <button
                onClick={() => {
                  setEntries(prev => prev.map(e => selectedIds.includes(e.id) ? { ...e, status: 'completed' as const } : e));
                  setSelectedIds([]);
                  setShowBatchCompleteModal(false);
                }}
                className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700"
              >
                確認批量完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Main Export =====
export function WebsiteModule({ subModule }: { subModule?: string }) {
  const [selectedSite, setSelectedSite] = useState<WebsiteProfileFull | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  // Reset selections when sub-module changes (fixes sidebar nav bug)
  useEffect(() => {
    setSelectedSite(null);
    setSelectedArticle(null);
  }, [subModule]);

  // Article detail view (from articles-list)
  if (selectedArticle) {
    return <ArticleDetailView article={selectedArticle} onBack={() => setSelectedArticle(null)} />;
  }

  // Website detail view (from list or featured)
  if (selectedSite) {
    return <WebsiteDetail site={selectedSite} onBack={() => setSelectedSite(null)} />;
  }

  switch (subModule) {
    case 'system-list':
      return <WebsiteList onSelectSite={setSelectedSite} profileTypeFilter="system" />;
    case 'featured':
      return <FeaturedWebsites onSelectSite={setSelectedSite} />;
    case 'articles-list':
      return <GlobalArticleList onSelectArticle={setSelectedArticle} />;
    case 'pending':
      return <PendingContent />;
    default:
      return <WebsiteList onSelectSite={setSelectedSite} />;
  }
}
