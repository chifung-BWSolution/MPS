import { useState, useMemo } from 'react';
import { Plus, Search, TrendingUp, DollarSign, MousePointerClick, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/context/DataStore';
import { usePaidAds } from '@/hooks/usePaidAds';

const platformLabels: Record<string, string> = {
  google_ads: 'Google Ads',
  facebook: 'Facebook',
  instagram: 'Instagram',
  xiaohongshu: '小紅書',
  other: '其他',
};

const statusConfig = {
  planning: { label: '規劃中', color: 'text-slate-700', bg: 'bg-slate-100' },
  active: { label: '進行中', color: 'text-teal-700', bg: 'bg-teal-100' },
  paused: { label: '已暫停', color: 'text-amber-700', bg: 'bg-amber-100' },
  completed: { label: '已完成', color: 'text-gray-600', bg: 'bg-gray-100' },
};

export function PaidAdsList() {
  const { websites } = useDataStore();
  const { ads } = usePaidAds();
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const siteMap = useMemo(() => new Map(websites.map(w => [w.id, w])), [websites]);
  const allAds = useMemo(() => ads.map(a => {
    const site = a.websiteProfileId ? siteMap.get(a.websiteProfileId) : undefined;
    return {
      ...a,
      websiteName: site?.websiteName || a.websiteProfileId || '',
      company: site?.company || '',
      brand: site?.brand || '',
    };
  }), [ads, siteMap]);

  const filteredAds = allAds.filter((ad) => {
    if (filterPlatform !== 'all' && ad.platform !== filterPlatform) return false;
    if (searchQuery && !ad.campaignName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const totalSpendHKD = filteredAds
    .filter(a => a.currency === 'HKD')
    .reduce((sum, a) => sum + a.actualSpend, 0);

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-teal-600" />
            <span className="text-[11px] text-muted-foreground">HKD 總支出</span>
          </div>
          <p className="text-[20px] font-bold">${totalSpendHKD.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye size={14} className="text-blue-600" />
            <span className="text-[11px] text-muted-foreground">總曝光</span>
          </div>
          <p className="text-[20px] font-bold">{filteredAds.reduce((s, a) => s + (a.impressions || 0), 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <MousePointerClick size={14} className="text-amber-600" />
            <span className="text-[11px] text-muted-foreground">總點擊</span>
          </div>
          <p className="text-[20px] font-bold">{filteredAds.reduce((s, a) => s + (a.clicks || 0), 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-emerald-600" />
            <span className="text-[11px] text-muted-foreground">平均 ROAS</span>
          </div>
          <p className="text-[20px] font-bold">
            {(filteredAds.filter(a => a.roas).reduce((s, a) => s + (a.roas || 0), 0) / (filteredAds.filter(a => a.roas).length || 1)).toFixed(1)}x
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋廣告標題..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilterPlatform('all')}
            className={cn(
              'px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
              filterPlatform === 'all' ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            全部
          </button>
          {Object.entries(platformLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilterPlatform(key)}
              className={cn(
                'px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
                filterPlatform === key ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
          <Plus size={12} />
          新增廣告
        </button>
      </div>

      {/* Ads Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-[13px] min-w-[900px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">廣告名稱</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">網站</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">平台</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">類型標籤</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">預算</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">已花費</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">CPC</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">CTR</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">ROAS</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">日期</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
            </tr>
          </thead>
          <tbody>
            {filteredAds.map((ad) => {
              const sConfig = statusConfig[ad.status];
              const budgetPercent = ad.budget > 0 ? Math.round((ad.actualSpend / ad.budget) * 100) : 0;
              return (
                <tr key={ad.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                  <td className="px-4 py-3 font-medium">{ad.campaignName}</td>
                  <td className="px-4 py-3">
                    <div className="text-[11px] text-teal-600">{ad.websiteName}</div>
                    <div className="text-[10px] text-muted-foreground">{ad.company} / {ad.brand}</div>
                  </td>
                  <td className="px-4 py-3">{platformLabels[ad.platform]}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] bg-muted px-2 py-0.5 rounded">{ad.projectTypeLabel}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <span>{ad.currency} ${ad.budget.toLocaleString()}</span>
                      <div className="w-16 h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', budgetPercent > 80 ? 'bg-amber-500' : 'bg-teal-600')}
                          style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">${ad.actualSpend.toLocaleString()}</td>
                  <td className="px-4 py-3">{ad.cpc ? `$${ad.cpc.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3">{ad.ctr ? `${ad.ctr.toFixed(2)}%` : '—'}</td>
                  <td className="px-4 py-3 font-medium">{ad.roas ? `${ad.roas.toFixed(1)}x` : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-[12px]">
                    {ad.startDate}{ad.endDate ? ` → ${ad.endDate}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>
                      {sConfig.label}
                    </span>
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
