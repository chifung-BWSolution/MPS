import type { ReactNode } from 'react';
import { Globe, Search, Server } from 'lucide-react';
import { useCompanies } from '@/hooks/useCompanies';
import { useBrands } from '@/hooks/useBrands';
import type { WebsiteLevel, WebsiteProfileFull } from '@/types/app';
import { cn } from '@/lib/utils';
import type { ProjectCategoryType } from '@/components/ui/project-category-badge';

export type WebsiteTypeFilter = 'all' | 'website' | 'system';
export type WebsiteCategoryFilter = 'all' | 'internal' | 'client';
export type ConnectionLinkFilter = 'all' | 'connected' | 'unlinked';

export type WebsiteListFilterState = {
  searchQuery: string;
  companyFilter: string;
  brandFilter: string;
  statusFilter: string;
  categoryFilter: WebsiteCategoryFilter;
  typeFilter: WebsiteTypeFilter;
  levelFilter: number[];
};

const levelFilterClass: Record<WebsiteLevel, { label: string; className: string }> = {
  1: { label: '主打', className: 'border-amber-500 bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-800' },
  2: { label: '重要', className: 'border-blue-500 bg-blue-50 text-blue-700' },
  3: { label: '定期推廣', className: 'border-green-500 bg-green-50 text-green-700' },
  4: { label: '不主動', className: 'border-slate-400 bg-slate-50 text-slate-600' },
  5: { label: '已關閉', className: 'border-rose-500 bg-rose-50 text-rose-600 line-through' },
};

export function brandIdsByCodeMap(brands: { id: string; brandCode: string }[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  brands.forEach((b) => {
    if (!map.has(b.brandCode)) map.set(b.brandCode, new Set());
    map.get(b.brandCode)!.add(b.id);
  });
  return map;
}

export function matchesConnectionLinkFilter(filter: ConnectionLinkFilter, connected: boolean): boolean {
  if (filter === 'connected') return connected;
  if (filter === 'unlinked') return !connected;
  return true;
}

export function matchesWebsiteListFilters(
  site: WebsiteProfileFull,
  filters: WebsiteListFilterState,
  brandIdsByCode: Map<string, Set<string>>,
  getCategory: (site: WebsiteProfileFull) => { category: ProjectCategoryType },
): boolean {
  if (filters.typeFilter !== 'all') {
    const wsType = site.profileType || 'website';
    if (wsType !== filters.typeFilter) return false;
  }
  if (filters.companyFilter !== 'all' && (site.company || '') !== filters.companyFilter) return false;
  if (filters.brandFilter !== 'all') {
    const matchingIds = brandIdsByCode.get(filters.brandFilter);
    if (!matchingIds || !matchingIds.has(site.brandId)) return false;
  }
  if (filters.statusFilter !== 'all' && site.status !== filters.statusFilter) return false;
  if (filters.levelFilter.length > 0 && !filters.levelFilter.includes(site.level)) return false;
  if (filters.categoryFilter !== 'all' && getCategory(site).category !== filters.categoryFilter) return false;
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    if (
      !site.websiteName.toLowerCase().includes(q) &&
      !(site.domainUrl || '').toLowerCase().includes(q) &&
      !(site.brand || '').toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  return true;
}

export function WebsiteListFilterBar({
  profiles,
  searchQuery,
  onSearchQueryChange,
  companyFilter,
  onCompanyFilterChange,
  brandFilter,
  onBrandFilterChange,
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  typeFilter,
  onTypeFilterChange,
  levelFilter,
  onLevelFilterChange,
  extraFilters,
  searchPlaceholder = '搜尋網站名稱...',
}: {
  profiles: WebsiteProfileFull[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  companyFilter: string;
  onCompanyFilterChange: (value: string) => void;
  brandFilter: string;
  onBrandFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  categoryFilter: WebsiteCategoryFilter;
  onCategoryFilterChange: (value: WebsiteCategoryFilter) => void;
  typeFilter: WebsiteTypeFilter;
  onTypeFilterChange: (value: WebsiteTypeFilter) => void;
  levelFilter: number[];
  onLevelFilterChange: (value: number[]) => void;
  extraFilters?: ReactNode;
  searchPlaceholder?: string;
}) {
  const { companies } = useCompanies();
  const { brands } = useBrands();

  const filteredBrands = companyFilter === 'all'
    ? brands
    : brands.filter((b) => {
        const co = companies.find((c) => c.uuid === b.companyId || c.id === b.companyId);
        return co?.companyCode === companyFilter;
      });
  const uniqueBrandCodes = Array.from(
    new Map(filteredBrands.filter((b) => b.isActive).map((b) => [b.brandCode, b])).values(),
  );

  const toggleLevelFilter = (lvl: number) => {
    onLevelFilterChange(
      levelFilter.includes(lvl) ? levelFilter.filter((l) => l !== lvl) : [...levelFilter, lvl],
    );
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        {(['all', 'website', 'system'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onTypeFilterChange(type)}
            className={cn(
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200 flex items-center gap-1.5',
              typeFilter === type
                ? type === 'system'
                  ? 'bg-purple-600 text-white'
                  : 'bg-teal-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {type === 'all' && '全部'}
            {type === 'website' && (
              <>
                <Globe size={11} />
                網站
              </>
            )}
            {type === 'system' && (
              <>
                <Server size={11} />
                系統
              </>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {(['all', 'internal', 'client'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onCategoryFilterChange(cat)}
            className={cn(
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
              categoryFilter === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {cat === 'all' ? '全部' : cat === 'internal' ? '內部項目' : '客戶項目'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[260px] bg-white">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
            placeholder={searchPlaceholder}
          />
        </div>
        <select
          value={companyFilter}
          onChange={(e) => {
            onCompanyFilterChange(e.target.value);
            onBrandFilterChange('all');
          }}
          className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
        >
          <option value="all">所有公司</option>
          {Array.from(new Set(profiles.map((p) => p.company || '').filter(Boolean)))
            .sort()
            .map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
        </select>
        <select
          value={brandFilter}
          onChange={(e) => onBrandFilterChange(e.target.value)}
          className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
        >
          <option value="all">所有品牌</option>
          {uniqueBrandCodes.map((b) => (
            <option key={b.brandCode} value={b.brandCode}>
              {b.brandCode}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
        >
          <option value="all">所有狀態</option>
          <option value="live">已上線</option>
          <option value="development">開發中</option>
          <option value="maintenance">維護中</option>
          <option value="archived">已封存</option>
        </select>
        {extraFilters}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-muted-foreground font-medium">Level 篩選：</span>
        {([1, 2, 3, 4, 5] as WebsiteLevel[]).map((lvl) => {
          const active = levelFilter.includes(lvl);
          return (
            <button
              key={lvl}
              type="button"
              onClick={() => toggleLevelFilter(lvl)}
              className={cn(
                'text-[11px] px-2 py-1 rounded-md border font-bold transition-all',
                active
                  ? `${levelFilterClass[lvl].className} shadow-sm`
                  : 'border-border bg-white text-muted-foreground hover:border-slate-400',
              )}
            >
              L{lvl} {levelFilterClass[lvl].label}
            </button>
          );
        })}
        {levelFilter.length > 0 && (
          <button
            type="button"
            onClick={() => onLevelFilterChange([])}
            className="text-[11px] text-rose-500 hover:underline ml-1"
          >
            清除篩選
          </button>
        )}
      </div>
    </>
  );
}

export function ConnectionLinkFilterSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ConnectionLinkFilter;
  onChange: (value: ConnectionLinkFilter) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ConnectionLinkFilter)}
      className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
    >
      <option value="all">{label}：全部</option>
      <option value="connected">已連接</option>
      <option value="unlinked">未連接</option>
    </select>
  );
}
