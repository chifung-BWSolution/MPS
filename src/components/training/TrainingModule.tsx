import { Star, ExternalLink, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MutedFieldBadge } from '@/components/ui/nullable-badge';
import { useState } from 'react';

const categories = ['全部', 'Shopify', 'Figma', 'WordPress', 'Google Ads', 'SEO Tools', 'Social Media', 'Video Editing'];

const resources = [
  { id: '1', title: 'Figma 基礎教學', category: 'Figma', type: 'video', url: 'https://figma.com', roles: ['designer'], recommended: true, description: 'Figma 界面設計入門到進階' },
  { id: '2', title: 'WordPress 完整指南', category: 'WordPress', type: 'document', url: 'https://wordpress.org', roles: ['designer', 'project_manager'], recommended: true, description: '從安裝到主題開發的完整教學' },
  { id: '3', title: 'Google Ads 投放策略', category: 'Google Ads', type: 'website_link', url: 'https://ads.google.com', roles: ['marketing'], recommended: true, description: '廣告投放最佳實踐及預算管理' },
  { id: '4', title: 'Shopify 店舖設定', category: 'Shopify', type: 'video', url: 'https://shopify.com', roles: ['designer', 'project_manager'], recommended: false, description: '從零開始建立 Shopify 網店' },
  { id: '5', title: 'SEO 關鍵字研究工具', category: 'SEO Tools', type: 'website_link', url: 'https://ahrefs.com', roles: ['marketing', 'copywriter'], recommended: false, description: 'Ahrefs / Semrush 使用教學' },
  { id: '6', title: 'Premiere Pro 剪輯入門', category: 'Video Editing', type: 'video', url: 'https://adobe.com', roles: ['video_editor'], recommended: true, description: '影片剪輯軟件基礎操作' },
  { id: '7', title: 'IG / FB 排程工具', category: 'Social Media', type: 'website_link', url: 'https://business.facebook.com', roles: ['marketing', 'copywriter'], recommended: false, description: 'Meta Business Suite 使用方法' },
  { id: '8', title: '公司內部流程文件', category: 'WordPress', type: 'internal_doc', url: '#', roles: ['management', 'project_manager'], recommended: false, description: '內部工作流程及審批規則' },
];

const typeLabels: Record<string, { label: string; color: string; bg: string }> = {
  video: { label: '影片', color: 'text-purple-700', bg: 'bg-purple-100' },
  document: { label: '文件', color: 'text-blue-700', bg: 'bg-blue-100' },
  website_link: { label: '網站', color: 'text-teal-700', bg: 'bg-teal-100' },
  internal_doc: { label: '內部文件', color: 'text-amber-700', bg: 'bg-amber-100' },
};

export function TrainingModule({ subModule }: { subModule?: string }) {
  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = resources.filter((r) => {
    if (activeCategory !== '全部' && r.category !== activeCategory) return false;
    if (searchQuery && !r.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const recommended = resources.filter((r) => r.recommended);

  return (
    <div className="space-y-6">
      {/* Recommended */}
      {subModule !== 'progress' && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-md border border-amber-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Star size={16} className="text-amber-500 fill-amber-500" />
            <h3 className="text-[15px] font-bold">推薦資源</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {recommended.map((r) => {
              const tConfig = typeLabels[r.type];
              return (
                <a
                  key={r.id}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white rounded-md border border-amber-100 p-3 hover:shadow-md transition-all duration-200 block"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', tConfig.bg, tConfig.color)}>{tConfig.label}</span>
                    <ExternalLink size={10} className="text-muted-foreground" />
                  </div>
                  <h4 className="text-[13px] font-medium mb-0.5">{r.title}</h4>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{r.description}</p>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[250px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋資源..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200 shrink-0',
                activeCategory === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Resources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((r) => {
          const tConfig = typeLabels[r.type];
          return (
            <a
              key={r.id}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 hover:shadow-card-hover transition-all duration-200 block"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', tConfig.bg, tConfig.color)}>{tConfig.label}</span>
                <div className="flex items-center gap-1.5">
                  {r.recommended && <Star size={10} className="text-amber-500 fill-amber-500" />}
                  <ExternalLink size={11} className="text-muted-foreground" />
                </div>
              </div>
              <h4 className="text-[14px] font-medium mb-1">{r.title}</h4>
              <p className="text-[12px] text-muted-foreground mb-2">{r.description}</p>
              <div className="flex items-center gap-1.5">
                <MutedFieldBadge value={r.category} className="text-[10px]" />
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
