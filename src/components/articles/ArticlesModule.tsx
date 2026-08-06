import { useState } from 'react';
import { Search, Plus, ExternalLink, Sparkles, ArrowLeft, Globe, X, Check, Trash2, Clock, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Article, WebsiteProfileFull, WebsiteLevel } from '@/types/app';
import {
  allArticles,
  websiteProfiles,
  getWebsitesForArticle,
  addWebsiteToArticle,
  removeWebsiteFromArticle,
  addNewArticle,
} from '@/data/websiteData';
import { companies, brands } from '@/data/mockData';

const statusConfig = {
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

// Level badge config (same as WebsiteModule)
const levelConfig: Record<WebsiteLevel, { label: string; className: string }> = {
  1: { label: '主打', className: 'border-amber-500 bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-800' },
  2: { label: '重要', className: 'border-blue-500 bg-blue-50 text-blue-700' },
  3: { label: '定期推廣', className: 'border-green-500 bg-green-50 text-green-700' },
  4: { label: '不主動', className: 'border-slate-400 bg-slate-50 text-slate-600' },
  5: { label: '已關閉', className: 'border-rose-500 bg-rose-50 text-rose-600 line-through' },
};

function ArticleLevelBadge({ level }: { level: WebsiteLevel }) {
  const config = levelConfig[level];
  return (
    <span className={cn('text-[9px] font-bold px-1 py-0 rounded-sm border inline-flex items-center gap-0.5', config.className)}>
      {level === 1 && <Star size={8} className="fill-amber-400 text-amber-500" />}
      L{level}
    </span>
  );
}

interface ContentEntry {
  id: string;
  title: string;
  website: string;
  source: string;
  status: 'planned' | 'in_progress' | 'completed';
  aiGenerated: boolean;
}

const contentEntries: ContentEntry[] = [
  { id: '1', title: '電商網站轉換率優化 5 大秘訣', website: 'BW Design', source: 'AI 生成', status: 'planned', aiGenerated: true },
  { id: '2', title: '如何選擇適合的網站主機', website: 'BW Design', source: 'AI 生成', status: 'planned', aiGenerated: true },
  { id: '3', title: 'Google Ads vs Facebook Ads 比較分析', website: 'ACI Global', source: 'AI 生成', status: 'in_progress', aiGenerated: true },
  { id: '4', title: '品牌形象設計的重要性', website: 'FCC Media', source: '手動新增', status: 'planned', aiGenerated: false },
];

// ===== Add Website Modal =====
function AddWebsiteModal({
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const availableWebsites = websiteProfiles.filter(ws => !existingWebsiteIds.includes(ws.id));
  const filteredWebsites = availableWebsites.filter(ws =>
    !searchQuery || ws.websiteName.toLowerCase().includes(searchQuery.toLowerCase()) || (ws.brand || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSubmit = () => {
    onAdd(selectedIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[560px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">加入其他網站</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
              placeholder="搜尋網站名稱..."
            />
          </div>
          {selectedIds.length > 0 && (
            <div className="text-[12px] text-teal-600 font-medium">已選擇 {selectedIds.length} 個網站</div>
          )}
          <div className="space-y-1 max-h-[320px] overflow-y-auto">
            {filteredWebsites.length === 0 ? (
              <div className="text-center py-6 text-[13px] text-muted-foreground">沒有可加入的網站</div>
            ) : (
              filteredWebsites.map(ws => {
                const isSelected = selectedIds.includes(ws.id);
                return (
                  <div
                    key={ws.id}
                    onClick={() => toggleSelect(ws.id)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all',
                      isSelected ? 'border-teal-600 bg-teal-50' : 'border-border hover:bg-muted/30'
                    )}
                  >
                    <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0', isSelected ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/30')}>
                      {isSelected && <Check size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium block">{ws.websiteName}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Globe size={10} className="text-muted-foreground" />
                        <span className="text-[11px] text-teal-600">{ws.domainUrl}</span>
                        <span className="text-[11px] bg-teal-50 text-teal-700 px-1 py-0.5 rounded">{ws.brand}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
          <button
            onClick={handleSubmit}
            disabled={selectedIds.length === 0}
            className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            加入 {selectedIds.length} 個網站
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Article Detail =====
function ArticleDetail({ article, onBack }: { article: Article; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState('info');
  const [relatedWebsites, setRelatedWebsites] = useState<WebsiteProfileFull[]>(() => getWebsitesForArticle(article.id));
  const [showAddWebsiteModal, setShowAddWebsiteModal] = useState(false);

  const existingWebsiteIds = relatedWebsites.map(ws => ws.id);
  const statusCfg = statusConfig[article.contentStatus];

  const handleAddWebsites = (websiteIds: string[]) => {
    websiteIds.forEach(id => {
      addWebsiteToArticle(article.id, id);
    });
    setRelatedWebsites(getWebsitesForArticle(article.id));
  };

  const handleRemoveWebsite = (websiteId: string) => {
    removeWebsiteFromArticle(article.id, websiteId);
    setRelatedWebsites(getWebsitesForArticle(article.id));
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-teal-600 font-medium hover:underline">
        <ArrowLeft size={14} />返回文章列表
      </button>

      {/* Header */}
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

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        <button
          onClick={() => setActiveTab('info')}
          className={cn('px-3 py-2 text-[13px] font-medium border-b-2 transition-all', activeTab === 'info' ? 'border-teal-600 text-teal-600' : 'border-transparent text-muted-foreground hover:text-foreground')}
        >
          文章資訊
        </button>
        <button
          onClick={() => setActiveTab('websites')}
          className={cn('px-3 py-2 text-[13px] font-medium border-b-2 transition-all', activeTab === 'websites' ? 'border-teal-600 text-teal-600' : 'border-transparent text-muted-foreground hover:text-foreground')}
        >
          所屬網站 ({relatedWebsites.length})
        </button>
      </div>

      {/* Content */}
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
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium',
                        kw.level === 'S1' ? 'bg-rose-100 text-rose-700' : kw.level === 'S2' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      )}>{kw.level}</span>
                      <span className="text-[13px]">{kw.keyword}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">尚未設定關鍵字</p>
              )}

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
              <button
                onClick={() => setShowAddWebsiteModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
              >
                <Plus size={13} />加入其他網站
              </button>
            </div>

            {relatedWebsites.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-md">
                <Globe size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-[14px] font-medium text-muted-foreground">此文章尚未關聯任何網站</p>
                <p className="text-[12px] text-muted-foreground mt-1">點擊「加入其他網站」開始關聯</p>
              </div>
            ) : (
              <div className="space-y-2">
                {relatedWebsites.map(ws => (
                  <div key={ws.id} className="flex items-center justify-between p-4 bg-muted/20 rounded-md border border-border/50">
                    <div className="flex items-center gap-3">
                      <Globe size={16} className="text-teal-600" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium">{ws.websiteName}</span>
                          <ArticleLevelBadge level={ws.level} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-teal-600">{ws.domainUrl}</span>
                          <span className="text-[11px] bg-teal-50 text-teal-700 px-1 py-0.5 rounded">{ws.brand}</span>
                          <span className="text-[11px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded">{ws.company}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveWebsite(ws.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded transition-colors"
                      title="移除關聯"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showAddWebsiteModal && (
              <AddWebsiteModal
                articleId={article.id}
                existingWebsiteIds={existingWebsiteIds}
                onClose={() => setShowAddWebsiteModal(false)}
                onAdd={handleAddWebsites}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Article List =====
function ArticleList({ onSelectArticle }: { onSelectArticle: (article: Article) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');

  const filteredBrands = companyFilter === 'all' ? brands : brands.filter(b => b.companyId === companyFilter);

  const filtered = allArticles.filter(a => {
    if (brandFilter !== 'all' && a.brandId !== brandFilter) return false;
    if (companyFilter !== 'all' && a.companyId !== companyFilter) return false;
    if (statusFilter !== 'all' && a.contentStatus !== statusFilter) return false;
    if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[260px]">
          <Search size={14} className="text-muted-foreground" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" placeholder="搜尋文章..." />
        </div>
        <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setBrandFilter('all'); }} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          <option value="all">所有公司</option>
          {companies.filter(c => c.isActive).map(c => (
            <option key={c.id} value={c.id}>{c.companyCode}</option>
          ))}
        </select>
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          <option value="all">所有品牌</option>
          {filteredBrands.filter(b => b.isActive).map(b => (
            <option key={b.id} value={b.id}>{b.brandCode}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          <option value="all">所有狀態</option>
          <option value="draft">草稿</option>
          <option value="writing">撰寫中</option>
          <option value="review">審核中</option>
          <option value="published">已發佈</option>
        </select>
      </div>

      <div className="text-[12px] text-muted-foreground">顯示 {filtered.length} 篇文章</div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">標題</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">渠道</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">品牌</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">撰稿人</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">工時</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">SEO Tags</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">成果</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(article => {
              const config = statusConfig[article.contentStatus];
              return (
                <tr key={article.id} onClick={() => onSelectArticle(article)} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    <span className="text-[13px] font-medium max-w-[220px] truncate block">{article.title}</span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">{channelLabels[article.channel] || article.channel}</td>
                  <td className="px-4 py-3"><span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{article.brand}</span></td>
                  <td className="px-4 py-3 text-[13px]">{article.authorName || '—'}</td>
                  <td className="px-4 py-3 text-[13px] font-medium">{article.hoursSpent ? `${article.hoursSpent}h` : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {article.targetKeywords?.slice(0, 2).map((kw, i) => (
                        <span key={i} className={cn('text-[9px] px-1 py-0.5 rounded font-medium',
                          kw.level === 'S1' ? 'bg-rose-100 text-rose-700' : kw.level === 'S2' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                        )}>{kw.level} {kw.keyword}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', config.bgColor, config.color)}>{config.label}</span></td>
                  <td className="px-4 py-3">
                    {article.url ? (
                      <a href={article.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-0.5 text-[11px] text-teal-600 hover:underline">
                        <ExternalLink size={10} />查看
                      </a>
                    ) : <span className="text-[11px] text-muted-foreground">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Content Plan =====
function ContentPlan() {
  const entryStatusConfig = {
    planned: { label: '待跟進', color: 'text-amber-700', bgColor: 'bg-amber-50' },
    in_progress: { label: '撰寫中', color: 'text-blue-700', bgColor: 'bg-blue-50' },
    completed: { label: '已完成', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-md border border-teal-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-teal-600" />
          <span className="text-[13px] font-bold text-teal-800">AI 建議的文章主題</span>
        </div>
        <p className="text-[12px] text-teal-700">系統根據 SEO 關鍵字庫生成的文章建議。點擊「開始撰寫」轉為正式文章。</p>
      </div>

      <div className="space-y-3">
        {contentEntries.map(entry => {
          const config = entryStatusConfig[entry.status];
          return (
            <div key={entry.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {entry.aiGenerated && <Sparkles size={12} className="text-teal-600" />}
                <div>
                  <span className="text-[13px] font-medium">{entry.title}</span>
                  <span className="text-[11px] text-muted-foreground block">{entry.website} • {entry.source}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', config.bgColor, config.color)}>{config.label}</span>
                {entry.status === 'planned' && (
                  <button className="text-[12px] px-3 py-1 bg-teal-600 text-white rounded hover:bg-teal-700">開始撰寫</button>
                )}
                {entry.status === 'in_progress' && (
                  <button className="text-[12px] px-3 py-1 border border-teal-600 text-teal-600 rounded hover:bg-teal-50">提交完成</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Add Article Modal =====
function AddArticleModal({ onClose, onAdd }: { onClose: () => void; onAdd: (article: Article) => void }) {
  const [companyId, setCompanyId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState<Article['channel']>('website_article');
  const [contentStatus, setContentStatus] = useState<Article['contentStatus']>('draft');
  const [authorName, setAuthorName] = useState('');
  const [wordCount, setWordCount] = useState<number>(0);
  const [hoursSpent, setHoursSpent] = useState<number>(0);
  const [reportDate, setReportDate] = useState('');
  const [url, setUrl] = useState('');
  const [asanaLink, setAsanaLink] = useState('');
  const [keywords, setKeywords] = useState<{ keyword: string; level: string }[]>([]);
  const [kwInput, setKwInput] = useState('');
  const [kwLevel, setKwLevel] = useState('S1');

  // Social posts (2-3 per article entry)
  const [socialPosts, setSocialPosts] = useState<{ platform: string; content: string; hoursSpent: number }[]>([]);

  const filteredBrands = companyId ? brands.filter(b => b.companyId === companyId) : brands;

  const addKeyword = () => {
    if (kwInput.trim()) {
      setKeywords([...keywords, { keyword: kwInput.trim(), level: kwLevel }]);
      setKwInput('');
    }
  };

  const removeKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
  };

  const addSocialPost = () => {
    if (socialPosts.length < 3) {
      setSocialPosts([...socialPosts, { platform: 'facebook', content: '', hoursSpent: 0 }]);
    }
  };

  const updateSocialPost = (index: number, field: string, value: string | number) => {
    const updated = [...socialPosts];
    updated[index] = { ...updated[index], [field]: value };
    setSocialPosts(updated);
  };

  const removeSocialPost = (index: number) => {
    setSocialPosts(socialPosts.filter((_, i) => i !== index));
  };

  const totalManHours = hoursSpent + socialPosts.reduce((sum, p) => sum + (p.hoursSpent || 0), 0);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const selectedCompany = companies.find(c => c.id === companyId);
    const selectedBrand = brands.find(b => b.id === brandId);
    const newArticle: Article = {
      id: `a${Date.now()}`,
      companyId: companyId || undefined,
      brandId: brandId || undefined,
      title: title.trim(),
      slug: title.trim().toLowerCase().replace(/\s+/g, '-'),
      channel,
      contentStatus,
      authorName: authorName || undefined,
      wordCount: wordCount || undefined,
      hoursSpent: totalManHours || undefined,
      targetKeywords: keywords.length > 0 ? keywords : undefined,
      url: url || undefined,
      brand: selectedBrand?.brandCode || undefined,
      company: selectedCompany?.companyCode || undefined,
    };
    onAdd(newArticle);
    onClose();
  };

  return (
    <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[680px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">新增文章記錄</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Company & Brand */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">公司</label>
              <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setBrandId(''); }} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600">
                <option value="">選擇公司</option>
                {companies.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{c.companyCode} - {c.companyNameZh}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">品牌</label>
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600">
                <option value="">選擇品牌</option>
                {filteredBrands.filter(b => b.isActive).map(b => (
                  <option key={b.id} value={b.id}>{b.brandCode} - {b.brandNameZh}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">文章標題 *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" placeholder="輸入文章標題..." />
          </div>

          {/* Channel & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">渠道</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value as Article['channel'])} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600">
                <option value="website_article">網站文章</option>
                <option value="youtube">YouTube</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="xiaohongshu">小紅書</option>
                <option value="other_video">其他影片</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">狀態</label>
              <select value={contentStatus} onChange={(e) => setContentStatus(e.target.value as Article['contentStatus'])} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600">
                <option value="draft">草稿</option>
                <option value="writing">撰寫中</option>
                <option value="review">審核中</option>
                <option value="published">已發佈</option>
              </select>
            </div>
          </div>

          {/* Author, Word count, Hours */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">撰稿人</label>
              <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" placeholder="撰稿人名稱" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">字數</label>
              <input type="number" value={wordCount || ''} onChange={(e) => setWordCount(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" placeholder="0" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">文章工時 (h)</label>
              <input type="number" step="0.5" value={hoursSpent || ''} onChange={(e) => setHoursSpent(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" placeholder="0" />
            </div>
          </div>

          {/* Report Date */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">日報日期</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
          </div>

          {/* URL + Asana */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">文章連結 (Output Link)</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" placeholder="https://..." />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Asana 連結</label>
              <input value={asanaLink} onChange={(e) => setAsanaLink(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" placeholder="https://app.asana.com/..." />
            </div>
          </div>

          {/* Keywords */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">SEO 關鍵字</label>
            <div className="flex items-center gap-2">
              <select value={kwLevel} onChange={(e) => setKwLevel(e.target.value)} className="px-2 py-1.5 border border-border rounded-md text-[12px]">
                <option value="S1">S1</option>
                <option value="S2">S2</option>
                <option value="S3">S3</option>
              </select>
              <input value={kwInput} onChange={(e) => setKwInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); }}} className="flex-1 px-3 py-1.5 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" placeholder="輸入關鍵字，按 Enter 新增" />
              <button onClick={addKeyword} className="px-2.5 py-1.5 bg-teal-600 text-white rounded-md text-[12px] hover:bg-teal-700">
                <Plus size={12} />
              </button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {keywords.map((kw, i) => (
                  <span key={i} className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded',
                    kw.level === 'S1' ? 'bg-rose-100 text-rose-700' : kw.level === 'S2' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                  )}>
                    {kw.level} {kw.keyword}
                    <button onClick={() => removeKeyword(i)} className="hover:opacity-70"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Social Posts (2-3 per article) */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-[13px] font-bold block">關聯社交帖文</label>
                <span className="text-[11px] text-muted-foreground">每篇文章可新增 2-3 條帖文，各自記錄工時</span>
              </div>
              <button onClick={addSocialPost} disabled={socialPosts.length >= 3} className="flex items-center gap-1 px-2.5 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus size={12} />新增帖文 ({socialPosts.length}/3)
              </button>
            </div>
            {socialPosts.length > 0 && (
              <div className="space-y-3">
                {socialPosts.map((post, idx) => (
                  <div key={idx} className="bg-muted/20 border border-border/50 rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-muted-foreground">帖文 #{idx + 1}</span>
                      <button onClick={() => removeSocialPost(idx)} className="text-rose-500 hover:bg-rose-50 p-1 rounded">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <select value={post.platform} onChange={(e) => updateSocialPost(idx, 'platform', e.target.value)} className="px-2 py-1.5 border border-border rounded-md text-[12px]">
                        <option value="facebook">Facebook</option>
                        <option value="instagram">Instagram</option>
                        <option value="xiaohongshu">小紅書</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="youtube">YouTube</option>
                      </select>
                      <input value={post.content} onChange={(e) => updateSocialPost(idx, 'content', e.target.value)} className="col-span-1 px-2 py-1.5 border border-border rounded-md text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-600" placeholder="帖文摘要..." />
                      <div className="flex items-center gap-1">
                        <Clock size={11} className="text-muted-foreground" />
                        <input type="number" step="0.5" value={post.hoursSpent || ''} onChange={(e) => updateSocialPost(idx, 'hoursSpent', Number(e.target.value))} className="w-full px-2 py-1.5 border border-border rounded-md text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-600" placeholder="工時" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Man Hour Summary */}
          <div className="bg-teal-50 border border-teal-200 rounded-md p-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-teal-800">
              <Clock size={14} className="text-teal-600" />
              <span>總工時合計：{totalManHours}h</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-[11px] text-teal-700">
              <span>文章撰寫：{hoursSpent}h</span>
              {socialPosts.length > 0 && <span>社交帖文：{socialPosts.reduce((sum, p) => sum + (p.hoursSpent || 0), 0)}h</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted rounded-md">取消</button>
          <button onClick={handleSubmit} disabled={!title.trim()} className="px-4 py-2 text-[13px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed">
            新增文章
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Main Export =====
export function ArticlesModule({ subModule }: { subModule?: string }) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [, setRefresh] = useState(0);

  const handleAddArticle = (article: Article) => {
    addNewArticle(article);
    setRefresh(n => n + 1);
  };

  if (selectedArticle) {
    return (
      <div className="space-y-6">
        <ArticleDetail article={selectedArticle} onBack={() => setSelectedArticle(null)} />
      </div>
    );
  }

  const renderContent = () => {
    switch (subModule) {
      case 'content-plan': return <ContentPlan />;
      default: return <ArticleList onSelectArticle={setSelectedArticle} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">文章管理</h1>
          <p className="text-[14px] text-muted-foreground mt-1">管理 SEO 文章、內容發佈及 AI 待跟進計劃。</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]">
          <Plus size={14} />新增文章
        </button>
      </div>
      {renderContent()}
      {showAddModal && (
        <AddArticleModal onClose={() => setShowAddModal(false)} onAdd={handleAddArticle} />
      )}
    </div>
  );
}
