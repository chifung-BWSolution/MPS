import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { projects as allProjectsData } from '@/data/mockData';
import { useAnalyticsToolConnections } from '@/hooks/useAnalyticsToolConnections';
import { useBrands } from '@/hooks/useBrands';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';
import { getProjectCategory } from '@/components/ui/project-category-badge';
import {
  ConnectionLinkFilterSelect,
  WebsiteListFilterBar,
  brandIdsByCodeMap,
  matchesConnectionLinkFilter,
  matchesWebsiteListFilters,
  type ConnectionLinkFilter,
  type WebsiteCategoryFilter,
  type WebsiteTypeFilter,
} from '@/components/website/WebsiteListFilterBar';
import { openWebsiteDetail } from '@/lib/websiteNavigation';
import { groupAnalyticsAccountsByName, type WebsiteToolCell } from '@/lib/analyticsToolConnections';
import type { WebsiteProfileFull } from '@/types/app';
import { cn } from '@/lib/utils';

function ConnectionCell({ cell }: { cell?: WebsiteToolCell }) {
  const groups = groupAnalyticsAccountsByName(cell?.accounts ?? []);
  if (groups.length === 0) {
    return <span className="text-[12px] text-muted-foreground">未連接</span>;
  }
  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.name}>
          <span className="text-[13px] font-medium block truncate max-w-[220px]">{group.name}</span>
          {group.descriptions.map((description) => (
            <span
              key={description}
              className="text-[11px] text-muted-foreground font-mono block truncate max-w-[220px]"
            >
              {description}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function resolveWebsiteProjectCategory(site: WebsiteProfileFull) {
  if (site.projectCategory === 'internal' || site.projectCategory === 'client') {
    return { category: site.projectCategory };
  }
  return getProjectCategory(site.projectId, allProjectsData);
}

export function AnalyticsConnectionsModule() {
  const { profiles, loading: profilesLoading } = useWebsiteProfiles();
  const { byWebsiteId, loading: connectionsLoading, error, refresh } = useAnalyticsToolConnections();
  const { brands } = useBrands();
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<WebsiteCategoryFilter>('all');
  const [typeFilter, setTypeFilter] = useState<WebsiteTypeFilter>('all');
  const [levelFilter, setLevelFilter] = useState<number[]>([]);
  const [ga4Filter, setGa4Filter] = useState<ConnectionLinkFilter>('all');
  const [gscFilter, setGscFilter] = useState<ConnectionLinkFilter>('all');
  const [googleAdsFilter, setGoogleAdsFilter] = useState<ConnectionLinkFilter>('all');
  const [facebookAdsFilter, setFacebookAdsFilter] = useState<ConnectionLinkFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const loading = profilesLoading || connectionsLoading;
  const brandIdsByCode = brandIdsByCodeMap(brands);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return profiles
      .filter((site) =>
        matchesWebsiteListFilters(
          site,
          { searchQuery: '', companyFilter, brandFilter, statusFilter, categoryFilter, typeFilter, levelFilter },
          brandIdsByCode,
          resolveWebsiteProjectCategory,
        ),
      )
      .filter((site) => {
        const cell = byWebsiteId.get(site.id);
        if (!matchesConnectionLinkFilter(ga4Filter, (cell?.ga4.accounts.length ?? 0) > 0)) return false;
        if (!matchesConnectionLinkFilter(gscFilter, (cell?.gsc.accounts.length ?? 0) > 0)) return false;
        if (!matchesConnectionLinkFilter(googleAdsFilter, (cell?.googleAds.accounts.length ?? 0) > 0)) return false;
        if (!matchesConnectionLinkFilter(facebookAdsFilter, (cell?.facebookAds.accounts.length ?? 0) > 0)) return false;
        if (!q) return true;
        const haystack = [
          site.websiteName,
          site.domainUrl,
          site.brand,
          site.company,
          ...(cell?.ga4.accounts ?? []).flatMap((a) => [a.name, a.description]),
          ...(cell?.gsc.accounts ?? []).flatMap((a) => [a.name, a.description]),
          ...(cell?.googleAds.accounts ?? []).flatMap((a) => [a.name, a.description]),
          ...(cell?.facebookAds.accounts ?? []).flatMap((a) => [a.name, a.description]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => (b.totalHours || 0) - (a.totalHours || 0));
  }, [
    brandFilter,
    brandIdsByCode,
    byWebsiteId,
    categoryFilter,
    companyFilter,
    facebookAdsFilter,
    ga4Filter,
    googleAdsFilter,
    gscFilter,
    levelFilter,
    profiles,
    searchQuery,
    statusFilter,
    typeFilter,
  ]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重新整理失敗');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">分析工具連接</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            各網站的 GA4、Search Console、Google Ads、Facebook Ads 連線。已連接時顯示帳戶名稱與識別碼。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading || refreshing}
          className="flex items-center gap-1.5 px-3 py-2 border border-border bg-white text-foreground rounded-md text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={cn((loading || refreshing) && 'animate-spin')} />
          重新整理
        </button>
      </div>

      <WebsiteListFilterBar
        profiles={profiles}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        companyFilter={companyFilter}
        onCompanyFilterChange={setCompanyFilter}
        brandFilter={brandFilter}
        onBrandFilterChange={setBrandFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        levelFilter={levelFilter}
        onLevelFilterChange={setLevelFilter}
        extraFilters={
          <>
            <ConnectionLinkFilterSelect label="GA4" value={ga4Filter} onChange={setGa4Filter} />
            <ConnectionLinkFilterSelect label="GSC" value={gscFilter} onChange={setGscFilter} />
            <ConnectionLinkFilterSelect label="Google Ads" value={googleAdsFilter} onChange={setGoogleAdsFilter} />
            <ConnectionLinkFilterSelect
              label="Facebook Ads"
              value={facebookAdsFilter}
              onChange={setFacebookAdsFilter}
            />
          </>
        }
      />

      <div className="text-[12px] text-muted-foreground">
        {loading ? '載入中…' : `顯示 ${filtered.length} 個${typeFilter === 'system' ? '系統' : typeFilter === 'website' ? '網站' : '項目'}`}
      </div>

      {error ? <div className="text-[13px] text-rose-600">{error}</div> : null}

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
            從資料庫載入中…
          </div>
        ) : null}
        <table className="w-full" style={{ display: loading ? 'none' : undefined }}>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                名稱
              </th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                GA4
              </th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                GSC
              </th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                Google Ads
              </th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                Facebook Ads
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((site) => {
              const cell = byWebsiteId.get(site.id);
              return (
                <tr
                  key={site.id}
                  onClick={() => openWebsiteDetail(site.id)}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-[13px] font-medium block">{site.websiteName}</span>
                      <span className="text-[11px] text-teal-600">{site.domainUrl}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ConnectionCell cell={cell?.ga4} />
                  </td>
                  <td className="px-4 py-3">
                    <ConnectionCell cell={cell?.gsc} />
                  </td>
                  <td className="px-4 py-3">
                    <ConnectionCell cell={cell?.googleAds} />
                  </td>
                  <td className="px-4 py-3">
                    <ConnectionCell cell={cell?.facebookAds} />
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
