import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useBrands } from '@/hooks/useBrands';
import { useAdsCostTrend } from '@/hooks/useAdsCostTrend';
import {
  ADS_CLICK_TREND_METRIC_OPTIONS,
  ADS_COST_TREND_MAX_MONTHS,
  aggregateClickTrendCampaignBuckets,
  buildCostTrendChartPoints,
  clampSelectedMonthRange,
  clickTrendBucketValue,
  clickTrendMetricNoun,
  collectCostTrendObjectives,
  currentMonthKey,
  defaultMonthlyRange,
  filterCostTrendCampaigns,
  formatClickTrendValue,
  formatCostTrendMoney,
  formatMonthLabel,
  groupCostTrendByBrand,
  isClickTrendMoneyMetric,
  isMonthKey,
  sortClickTrendBrandRows,
  sumUniqueCampaignMetrics,
  topBrandSeriesByMetric,
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
  AdsClickTrendMetric,
  AdsCostTrendBrandRow,
  AdsCostTrendBucketRange,
  AdsCostTrendCampaign,
  AdsCostTrendPeriodMode,
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

function campaignCostLine(costMicros: number) {
  return (
    <div className="text-[11px] font-normal text-muted-foreground">
      Cost {formatCostTrendMoney(costMicros)}
    </div>
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

function openCampaignDetail(
  campaign: AdsCostTrendCampaign,
  range: { preset: '30d' | 'custom'; from: string; to: string },
) {
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

export function AdsClickTrendModule() {
  const today = todayIso();
  const initialMonths = defaultMonthlyRange(today);
  const [periodMode, setPeriodMode] = useState<AdsCostTrendPeriodMode>('rolling30');
  const [monthFrom, setMonthFrom] = useState(initialMonths.from);
  const [monthTo, setMonthTo] = useState(initialMonths.to);

  const { campaigns, tags, asOf, ranges, loading, error, refresh } = useAdsCostTrend({
    mode: periodMode,
    monthFrom,
    monthTo,
  });
  const { brands } = useBrands();

  const [platform, setPlatform] = useState<AdsCostTrendPlatformFilter>('all');
  const [objective, setObjective] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [metric, setMetric] = useState<AdsClickTrendMetric>('clicks');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<AdsCostTrendSortKey>('total');
  const [sortDir, setSortDir] = useState<AdsCostTrendSortDir>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set(ranges.map((range) => range.id));
    if (sortKey !== 'brand' && sortKey !== 'total' && !ids.has(sortKey)) {
      setSortKey('total');
    }
  }, [ranges, sortKey]);

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
    return sortClickTrendBrandRows(grouped, sortKey, sortDir, metric);
  }, [filteredCampaigns, brands, search, sortKey, sortDir, metric]);

  const totals = useMemo(() => sumUniqueCampaignMetrics(brandRows), [brandRows]);

  const bucketIds = useMemo(() => ranges.map((range) => range.id), [ranges]);
  const latestBucket = periodMode === 'monthly' ? ranges[ranges.length - 1] : ranges[0];
  const maxMonth = currentMonthKey(asOf || today);
  const metricNoun = clickTrendMetricNoun(metric);
  const moneyMetric = isClickTrendMoneyMetric(metric);

  const chart = useMemo(() => {
    const totalBuckets = aggregateClickTrendCampaignBuckets(totals.campaigns, metric, bucketIds);
    const googleBuckets = aggregateClickTrendCampaignBuckets(totals.campaigns, metric, bucketIds, 'google');
    const facebookBuckets = aggregateClickTrendCampaignBuckets(totals.campaigns, metric, bucketIds, 'facebook');
    const brandSeries = topBrandSeriesByMetric(brandRows, metric, bucketIds, 5);
    return {
      data:
        totals.campaigns.length === 0
          ? []
          : buildCostTrendChartPoints(
              ranges,
              totalBuckets,
              googleBuckets,
              facebookBuckets,
              brandSeries,
              moneyMetric ? 1_000_000 : 1,
            ),
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
  }, [brandRows, totals, platform, bucketIds, ranges, metric, moneyMetric]);

  const onMonthChange = (changed: 'from' | 'to', value: string) => {
    if (!isMonthKey(value)) return;
    const next = clampSelectedMonthRange(
      changed === 'from' ? value : monthFrom,
      changed === 'to' ? value : monthTo,
      asOf || today,
      changed,
    );
    setMonthFrom(next.from);
    setMonthTo(next.to);
  };

  const campaignDetailRange =
    periodMode === 'monthly' && ranges.length > 0
      ? { preset: 'custom' as const, from: ranges[0].from, to: ranges[ranges.length - 1].to }
      : { preset: '30d' as const, from: daysAgoIso(30), to: todayIso() };

  const periodLabel =
    periodMode === 'monthly'
      ? `${formatMonthLabel(monthFrom)} 至 ${formatMonthLabel(monthTo)}`
      : '近 180 日每 30 日區間';
  const chartDescription =
    periodMode === 'monthly'
      ? `依目前篩選，顯示 ${periodLabel} 各月${metricNoun}（最多 ${ADS_COST_TREND_MAX_MONTHS} 個月）`
      : `依目前篩選，顯示近 180 日每 30 日區間的${metricNoun}（${ranges.map((bucket) => bucket.label).join(' / ')}）`;
  const latestMetricLabel =
    periodMode === 'monthly'
      ? `${latestBucket?.label || '本月'}${moneyMetric ? ' ' : ''}${metricNoun}`
      : `近 30 日${moneyMetric ? ' ' : ''}${metricNoun}`;
  const totalMetricLabel = moneyMetric
    ? periodMode === 'monthly'
      ? `期間 ${metricNoun}`
      : `180 日 ${metricNoun}`
    : periodMode === 'monthly'
      ? `期間總${metricNoun}`
      : `180 日總${metricNoun}`;
  const latestValue = latestBucket ? clickTrendBucketValue(totals, latestBucket.id, metric) : 0;
  const totalValue = clickTrendBucketValue(totals, 'total', metric);
  const colSpan = ranges.length + 2;

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
      <div className="sticky top-[calc(48px+var(--app-banner-h))] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">廣告點擊趨勢</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            以品牌檢視 Google Ads / Facebook Ads 曝光、點擊、轉換與 CPC/CPA。預設為 30 日區間，可切換按月檢視（最多選 6 個月）。點擊品牌列展開 Campaign，再點擊 Campaign 開啟詳情。
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
              <div className="text-[11px] text-muted-foreground">{latestMetricLabel}</div>
              <div className="text-[18px] font-bold">{formatClickTrendValue(latestValue, metric)}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">{totalMetricLabel}</div>
              <div className="text-[18px] font-bold">{formatClickTrendValue(totalValue, metric)}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            重新載入
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-white rounded-md p-1 border border-[rgba(13,26,45,0.08)]">
            <button
              type="button"
              onClick={() => setPeriodMode('rolling30')}
              className={cn(
                'px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
                periodMode === 'rolling30' ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              30 日區間
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('monthly')}
              className={cn(
                'px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
                periodMode === 'monthly' ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              按月
            </button>
          </div>
          {periodMode === 'monthly' && (
            <>
              <Input
                type="month"
                className="w-[150px] h-9 text-[13px] bg-white"
                value={monthFrom}
                max={maxMonth}
                onChange={(e) => onMonthChange('from', e.target.value)}
                aria-label="起始月份"
              />
              <span className="text-[12px] text-muted-foreground">至</span>
              <Input
                type="month"
                className="w-[150px] h-9 text-[13px] bg-white"
                value={monthTo}
                max={maxMonth}
                onChange={(e) => onMonthChange('to', e.target.value)}
                aria-label="結束月份"
              />
              <span className="text-[12px] text-muted-foreground">最多 {ADS_COST_TREND_MAX_MONTHS} 個月</span>
            </>
          )}
          <div className="flex gap-1 bg-white rounded-md p-1 border border-[rgba(13,26,45,0.08)]" role="group" aria-label="成效指標">
            {ADS_CLICK_TREND_METRIC_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMetric(option.id)}
                className={cn(
                  'px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
                  metric === option.id ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
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
          基準日 {asOf} · {periodMode === 'monthly' ? `顯示 ${periodLabel}` : '僅顯示近 180 日有成本的品牌'} · 點擊品牌列展開 Campaign
          {error ? <span className="text-red-600 ml-2">{error}</span> : null}
        </div>
      </div>

      <div className="space-y-4">
        <AdsCostTrendChart
          data={chart.data}
          seriesKeys={chart.seriesKeys}
          description={chartDescription}
          loading={loading}
          title="廣告點擊趨勢"
          emptyText="此篩選尚無點擊資料"
          formatTick={(value) =>
            moneyMetric
              ? `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : Number(value).toLocaleString(undefined, { maximumFractionDigits: metric === 'conv' ? 1 : 0 })
          }
          formatTooltip={(value) =>
            moneyMetric
              ? `$${Number(value).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : Number(value).toLocaleString(undefined, {
                  maximumFractionDigits: metric === 'conv' ? 2 : 0,
                })
          }
        />

        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-muted-foreground">
                <tr>
                  <SortableTh label="品牌 Brand" sortKey="brand" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  {ranges.map((bucket) => (
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
                    <td colSpan={colSpan} className="px-3 py-8 text-center text-muted-foreground">
                      載入中…
                    </td>
                  </tr>
                )}
                {!loading && brandRows.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className="px-3 py-8 text-center text-muted-foreground">
                      {periodMode === 'monthly'
                        ? '所選月份沒有符合篩選的廣告數據。請先到「廣告數據同步」執行歷史回填，或調整月份／篩選條件。'
                        : '近 180 日沒有符合篩選的廣告數據。請先到「廣告數據同步」執行歷史回填，或調整篩選條件。'}
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
                        buckets={ranges}
                        isOpen={isOpen}
                        onToggle={() => toggleBrand(row.brandId)}
                        metric={metric}
                        onOpenCampaign={(campaign) => openCampaignDetail(campaign, campaignDetailRange)}
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
  buckets,
  isOpen,
  metric,
  onToggle,
  onOpenCampaign,
}: {
  row: AdsCostTrendBrandRow;
  buckets: AdsCostTrendBucketRange[];
  isOpen: boolean;
  metric: AdsClickTrendMetric;
  onToggle: () => void;
  onOpenCampaign: (campaign: AdsCostTrendCampaign) => void;
}) {
  const brandLabel =
    row.displayName && row.displayName !== row.brandCode
      ? `${row.brandCode} — ${row.displayName}`
      : row.displayName || row.brandCode;
  const campaigns = [...row.campaigns].sort((a, b) => {
    const aVal = clickTrendBucketValue(a, 'total', metric) ?? -1;
    const bVal = clickTrendBucketValue(b, 'total', metric) ?? -1;
    return bVal - aVal;
  });

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
        {buckets.map((bucket) => (
          <td key={bucket.id} className="px-3 py-2.5 text-right tabular-nums">
            {formatClickTrendValue(clickTrendBucketValue(row, bucket.id, metric), metric)}
          </td>
        ))}
        <td className="px-3 py-2.5 text-right tabular-nums font-bold">
          {formatClickTrendValue(clickTrendBucketValue(row, 'total', metric), metric)}
        </td>
      </tr>
      {isOpen &&
        campaigns.map((campaign) => (
          <tr
            key={`${row.brandId}:${campaign.key}`}
            role="button"
            tabIndex={0}
            onClick={() => onOpenCampaign(campaign)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenCampaign(campaign);
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
            {buckets.map((bucket) => {
              const costMicros = campaign.buckets[bucket.id] ?? 0;
              return (
                <td key={bucket.id} className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  <div>{formatClickTrendValue(clickTrendBucketValue(campaign, bucket.id, metric), metric)}</div>
                  {campaignCostLine(costMicros)}
                </td>
              );
            })}
            <td className="px-3 py-2.5 text-right tabular-nums font-medium">
              <div>{formatClickTrendValue(clickTrendBucketValue(campaign, 'total', metric), metric)}</div>
              {campaignCostLine(campaign.totalMicros)}
            </td>
          </tr>
        ))}
    </>
  );
}
