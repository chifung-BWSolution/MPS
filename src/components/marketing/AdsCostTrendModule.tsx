import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useBrands } from '@/hooks/useBrands';
import { useAdsCostTrend } from '@/hooks/useAdsCostTrend';
import {
  ADS_COST_TREND_BUCKETS,
  buildCostTrendChartPoints,
  collectCostTrendObjectives,
  emptyCostTrendBuckets,
  filterCostTrendCampaigns,
  formatCostTrendMoney,
  groupCostTrendByBrand,
  sortCostTrendBrandRows,
  sumUniqueCampaignMetrics,
  topBrandSeries,
} from '@/lib/adsCostTrend';
import {
  setFacebookAdsCampaignHash,
  setGoogleAdsCampaignHash,
} from '@/lib/adsCampaignNavigation';
import { daysAgoIso, todayIso } from '@/lib/adsDailySeries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdsTagPills } from './ads-tags/AdsTagPills';
import { AdsCostTrendChart } from './ads-cost-trend/AdsCostTrendChart';
import { cn } from '@/lib/utils';
import type {
  AdsCostTrendCampaign,
  AdsCostTrendPlatformFilter,
  AdsCostTrendSortDir,
  AdsCostTrendSortKey,
} from '@/types/adsCostTrend';

function SortableTh({
  label,
  sortKey,
  activeKey,
  sortDir,
  align = 'left',
  onSort,
}: {
  label: ReactNode;
  sortKey: AdsCostTrendSortKey;
  activeKey: AdsCostTrendSortKey;
  sortDir: AdsCostTrendSortDir;
  align?: 'left' | 'right';
  onSort: (key: AdsCostTrendSortKey) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={cn('font-medium px-3 py-2.5', align === 'right' ? 'text-right' : 'text-left')}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          align === 'right' && 'flex-row-reverse',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span>{label}</span>
        <Icon size={12} className={cn(active ? 'text-teal-600' : 'opacity-40')} />
      </button>
    </th>
  );
}

function platformBadge(platform: AdsCostTrendCampaign['platform']) {
  const isGoogle = platform === 'google';
  return (
    <span
      className={cn(
        'inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium',
        isGoogle
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : 'bg-indigo-50 text-indigo-700 border-indigo-200',
      )}
    >
      {isGoogle ? 'Google' : 'Facebook'}
    </span>
  );
}

function openCampaignDetail(campaign: AdsCostTrendCampaign) {
  const range = { preset: '30d' as const, from: daysAgoIso(30), to: todayIso() };
  if (campaign.platform === 'google') {
    setGoogleAdsCampaignHash({
      campaignKey: `${campaign.accountId}:${campaign.campaignId}`,
      ...range,
    });
    return;
  }
  setFacebookAdsCampaignHash({
    campaignKey: `${campaign.accountId}:${campaign.campaignId}`,
    ...range,
  });
}

export function AdsCostTrendModule() {
  const { campaigns, tags, asOf, loading, error, refresh } = useAdsCostTrend();
  const { brands } = useBrands();

  const [platform, setPlatform] = useState<AdsCostTrendPlatformFilter>('all');
  const [objective, setObjective] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<AdsCostTrendSortKey>('total');
  const [sortDir, setSortDir] = useState<AdsCostTrendSortDir>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const activeAdsTags = useMemo(() => tags.filter((tag) => tag.isActive), [tags]);

  const objectiveOptions = useMemo(
    () => collectCostTrendObjectives(campaigns, platform),
    [campaigns, platform],
  );

  const filteredCampaigns = useMemo(
    () =>
      filterCostTrendCampaigns(campaigns, {
        platform,
        objective: platform === 'all' ? 'all' : objective,
        tag: tagFilter,
        search,
      }),
    [campaigns, platform, objective, tagFilter, search],
  );

  const brandRows = useMemo(() => {
    const grouped = groupCostTrendByBrand(filteredCampaigns, brands, search);
    return sortCostTrendBrandRows(grouped, sortKey, sortDir);
  }, [filteredCampaigns, brands, search, sortKey, sortDir]);

  const totals = useMemo(() => sumUniqueCampaignMetrics(brandRows), [brandRows]);

  const chart = useMemo(() => {
    const googleBuckets = emptyCostTrendBuckets();
    const facebookBuckets = emptyCostTrendBuckets();
    for (const campaign of totals.campaigns) {
      if (campaign.platform === 'google') {
        for (const id of Object.keys(googleBuckets) as (keyof typeof googleBuckets)[]) {
          googleBuckets[id] += campaign.buckets[id];
        }
      } else {
        for (const id of Object.keys(facebookBuckets) as (keyof typeof facebookBuckets)[]) {
          facebookBuckets[id] += campaign.buckets[id];
        }
      }
    }
    const brandSeries = topBrandSeries(brandRows, 5);
    return {
      data:
        totals.campaigns.length === 0
          ? []
          : buildCostTrendChartPoints(totals.buckets, googleBuckets, facebookBuckets, brandSeries),
      seriesKeys: [
        { key: 'total', label: '總計' },
        ...(platform === 'all'
          ? [
              { key: 'google', label: 'Google Ads' },
              { key: 'facebook', label: 'Facebook Ads' },
            ]
          : []),
        ...brandSeries.map((series) => ({ key: series.key, label: series.name })),
      ],
    };
  }, [brandRows, totals, platform]);

  const onSort = (key: AdsCostTrendSortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'brand' ? 'asc' : 'desc');
    }
  };

  const toggleBrand = (brandId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
  };

  const onPlatformChange = (value: AdsCostTrendPlatformFilter) => {
    setPlatform(value);
    setObjective('all');
  };

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">廣告成本趨勢</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            以品牌檢視近 180 日 Google Ads / Facebook Ads 成本，按每 30 日區間彙總。點擊品牌列展開 Campaign，再點擊 Campaign 開啟詳情。
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 min-w-[280px]">
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">品牌</div>
              <div className="text-[18px] font-bold">{brandRows.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Campaigns</div>
              <div className="text-[18px] font-bold">{totals.campaigns.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">近 30 日成本</div>
              <div className="text-[18px] font-bold">{formatCostTrendMoney(totals.buckets.d0_30)}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">180 日總成本</div>
              <div className="text-[18px] font-bold">{formatCostTrendMoney(totals.totalMicros)}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            重新載入
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={platform} onValueChange={(value) => onPlatformChange(value as AdsCostTrendPlatformFilter)}>
            <SelectTrigger className="w-[170px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="廣告平台" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平台</SelectItem>
              <SelectItem value="google">Google Ads</SelectItem>
              <SelectItem value="facebook">Facebook Ads</SelectItem>
            </SelectContent>
          </Select>
          {platform !== 'all' && (
            <Select value={objective} onValueChange={setObjective}>
              <SelectTrigger className="w-[220px] h-9 text-[13px] bg-white">
                <SelectValue placeholder="目標" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部目標</SelectItem>
                {objectiveOptions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-[160px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="標籤" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部標籤</SelectItem>
              <SelectItem value="none">未設定標籤</SelectItem>
              {activeAdsTags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋品牌 / campaign / 帳戶 / 標籤…"
              className="pl-8 h-9 text-[13px] bg-white"
            />
          </div>
        </div>

        <div className="text-[12px] text-muted-foreground">
          基準日 {asOf} · 僅顯示近 180 日有成本的品牌 · 點擊品牌列展開 Campaign
          {error ? <span className="text-red-600 ml-2">{error}</span> : null}
        </div>
      </div>

      <div className="space-y-4">
        <AdsCostTrendChart data={chart.data} seriesKeys={chart.seriesKeys} loading={loading} />

        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-muted-foreground">
                <tr>
                  <SortableTh label="品牌 Brand" sortKey="brand" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  {ADS_COST_TREND_BUCKETS.map((bucket) => (
                    <SortableTh
                      key={bucket.id}
                      label={bucket.label}
                      sortKey={bucket.id}
                      activeKey={sortKey}
                      sortDir={sortDir}
                      align="right"
                      onSort={onSort}
                    />
                  ))}
                  <SortableTh
                    label={<span className="font-semibold text-foreground">總計 Total</span>}
                    sortKey="total"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    align="right"
                    onSort={onSort}
                  />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      載入中…
                    </td>
                  </tr>
                )}
                {!loading && brandRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      近 180 日沒有符合篩選的廣告成本。請先到「廣告數據同步」執行歷史回填，或調整篩選條件。
                    </td>
                  </tr>
                )}
                {!loading &&
                  brandRows.map((row) => {
                    const isOpen = expanded.has(row.brandId);
                    return (
                      <BrandBlock
                        key={row.brandId}
                        row={row}
                        isOpen={isOpen}
                        onToggle={() => toggleBrand(row.brandId)}
                      />
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandBlock({
  row,
  isOpen,
  onToggle,
}: {
  row: {
    brandId: string;
    brandCode: string;
    displayName: string;
    campaigns: AdsCostTrendCampaign[];
    buckets: AdsCostTrendCampaign['buckets'];
    totalMicros: number;
  };
  isOpen: boolean;
  onToggle: () => void;
}) {
  const brandLabel =
    row.displayName && row.displayName !== row.brandCode
      ? `${row.brandCode} — ${row.displayName}`
      : row.displayName || row.brandCode;

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer"
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {isOpen ? (
              <ChevronDown size={14} className="text-teal-600 shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-muted-foreground shrink-0" />
            )}
            <div>
              <div className="font-medium text-foreground">{brandLabel}</div>
              <div className="text-[11px] text-muted-foreground">
                {row.campaigns.length} campaigns
              </div>
            </div>
          </div>
        </td>
        {ADS_COST_TREND_BUCKETS.map((bucket) => (
          <td key={bucket.id} className="px-3 py-2.5 text-right tabular-nums">
            {formatCostTrendMoney(row.buckets[bucket.id])}
          </td>
        ))}
        <td className="px-3 py-2.5 text-right tabular-nums font-bold">
          {formatCostTrendMoney(row.totalMicros)}
        </td>
      </tr>
      {isOpen &&
        row.campaigns.map((campaign) => (
          <tr
            key={`${row.brandId}:${campaign.key}`}
            role="button"
            tabIndex={0}
            onClick={() => openCampaignDetail(campaign)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openCampaignDetail(campaign);
              }
            }}
            className="border-b border-slate-100 bg-slate-50/40 hover:bg-teal-50/50 transition-colors cursor-pointer"
          >
            <td className="px-3 py-2.5 pl-10">
              <div className="flex items-start gap-2">
                {platformBadge(campaign.platform)}
                <div className="min-w-0">
                  <div className="font-medium text-teal-800">{campaign.campaignName}</div>
                  <div className="text-[11px] text-muted-foreground">{campaign.accountName}</div>
                  <div className="mt-1">
                    <AdsTagPills tags={campaign.tags} empty="" />
                  </div>
                </div>
              </div>
            </td>
            {ADS_COST_TREND_BUCKETS.map((bucket) => (
              <td key={bucket.id} className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {formatCostTrendMoney(campaign.buckets[bucket.id])}
              </td>
            ))}
            <td className="px-3 py-2.5 text-right tabular-nums font-medium">
              {formatCostTrendMoney(campaign.totalMicros)}
            </td>
          </tr>
        ))}
    </>
  );
}
