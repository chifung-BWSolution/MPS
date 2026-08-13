import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { AdsKpiCard } from '@/components/marketing/campaign-detail/AdsKpiCard';
import { resolveDateRange } from '@/hooks/useGoogleAdsData';
import { useAdsComparisonSeries } from '@/hooks/useAdsComparisonSeries';
import {
  ADS_COMPARE_METRICS,
  daysAgoIso,
  isAdsCompareMetric,
  todayIso,
} from '@/lib/adsDailySeries';
import type { DateRangePreset } from '@/types/googleAds';
import type { AdsCompareCatalog, AdsCompareMetric, AdsComparePlatform } from '@/types/adsComparison';
import { AdsComparisonMetricChart } from './AdsComparisonMetricChart';

const DEFAULT_PLATFORMS: AdsComparePlatform[] = ['google', 'facebook', 'google'];

export function AdsComparisonColumn({
  index,
  catalog,
  catalogLoading,
}: {
  index: number;
  catalog: AdsCompareCatalog;
  catalogLoading: boolean;
}) {
  const [platform, setPlatform] = useState<AdsComparePlatform>(DEFAULT_PLATFORMS[index] ?? 'google');
  const [campaignKey, setCampaignKey] = useState('');
  const [metric, setMetric] = useState<AdsCompareMetric>('clicks');
  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());

  const dataMinDate = platform === 'google' ? catalog.googleMinDate : catalog.facebookMinDate;
  const dataMaxDate = platform === 'google' ? catalog.googleMaxDate : catalog.facebookMaxDate;

  const [range, setRange] = useState(() =>
    resolveDateRange('30d', daysAgoIso(30), todayIso()),
  );

  useEffect(() => {
    setRange(resolveDateRange(preset, customFrom, customTo, dataMinDate, dataMaxDate));
  }, [preset, customFrom, customTo, dataMinDate, dataMaxDate]);

  const campaigns = platform === 'google' ? catalog.google : catalog.facebook;

  const campaignOptions: SearchableSelectOption[] = useMemo(
    () =>
      campaigns.map((c) => ({
        value: c.key,
        label: `${c.campaignName} · ${c.accountName}`,
        keywords: `${c.accountId} ${c.campaignId} ${c.status} ${c.extra ?? ''}`,
      })),
    [campaigns],
  );

  const selectedCampaign = campaigns.find((c) => c.key === campaignKey) ?? null;

  const { series, kpis, loading, error } = useAdsComparisonSeries(
    selectedCampaign?.platform ?? null,
    selectedCampaign?.accountId ?? null,
    selectedCampaign?.campaignId ?? null,
    range.from,
    range.to,
  );

  const onPlatformChange = (next: AdsComparePlatform) => {
    setPlatform(next);
    setCampaignKey('');
  };

  return (
    <section className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-3 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-muted-foreground">欄位 {index + 1}</div>
        {selectedCampaign ? (
          <span
            className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-medium ${
              selectedCampaign.status.toUpperCase() === 'ENABLED'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {selectedCampaign.status}
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as DateRangePreset)}>
            <SelectTrigger className="w-full h-9 text-[13px] bg-white">
              <SelectValue placeholder="期間" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">近 7 日</SelectItem>
              <SelectItem value="14d">近 14 日</SelectItem>
              <SelectItem value="30d">近 30 日</SelectItem>
              <SelectItem value="90d">近 90 日</SelectItem>
              <SelectItem value="ytd">今年至今</SelectItem>
              <SelectItem value="all">全部已同步</SelectItem>
              <SelectItem value="custom">自訂</SelectItem>
            </SelectContent>
          </Select>
          {preset === 'custom' ? (
            <div className="flex items-center gap-1.5 w-full">
              <Input
                type="date"
                className="h-9 text-[13px] bg-white flex-1 min-w-0"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-[11px] text-muted-foreground shrink-0">至</span>
              <Input
                type="date"
                className="h-9 text-[13px] bg-white flex-1 min-w-0"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground tabular-nums w-full">
              {range.from} → {range.to}
            </div>
          )}
        </div>

        <Select value={platform} onValueChange={(v) => onPlatformChange(v as AdsComparePlatform)}>
          <SelectTrigger className="w-full h-9 text-[13px] bg-white">
            <SelectValue placeholder="平台" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="google">Google Ads</SelectItem>
            <SelectItem value="facebook">Facebook Ads</SelectItem>
          </SelectContent>
        </Select>

        <SearchableSelect
          value={campaignKey}
          onValueChange={setCampaignKey}
          options={campaignOptions}
          disabled={catalogLoading}
          placeholder={catalogLoading ? '載入 Campaign…' : '搜尋並選擇 Campaign'}
          searchPlaceholder="搜尋 campaign / 帳戶…"
          emptyText="找不到 Campaign"
        />
        {selectedCampaign ? (
          <div className="text-[11px] text-muted-foreground truncate" title={selectedCampaign.accountName}>
            {selectedCampaign.accountName}
            {selectedCampaign.extra ? ` · ${selectedCampaign.extra}` : ''}
          </div>
        ) : null}

        <Select value={metric} onValueChange={(v) => setMetric(v as AdsCompareMetric)}>
          <SelectTrigger className="w-full h-9 text-[13px] bg-white">
            <SelectValue placeholder="指標" />
          </SelectTrigger>
          <SelectContent>
            {ADS_COMPARE_METRICS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.shortLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? <div className="text-[12px] text-red-600">{error}</div> : null}

      <AdsComparisonMetricChart
        series={selectedCampaign ? series : []}
        metric={metric}
        loading={Boolean(selectedCampaign) && loading}
        emptyText={selectedCampaign ? '此期間尚無每日資料' : '請選擇 Campaign'}
      />

      <div className="grid grid-cols-2 gap-2">
        {!selectedCampaign ? (
          <div className="col-span-2 rounded-md border border-dashed border-[rgba(13,26,45,0.12)] px-3 py-6 text-center text-[12px] text-muted-foreground">
            選擇 Campaign 後顯示 Impressions / Clicks / CTR / Cost / Conversions / Avg. CPC
          </div>
        ) : loading ? (
          <div className="col-span-2 rounded-md border border-[rgba(13,26,45,0.08)] px-3 py-6 text-center text-[12px] text-muted-foreground">
            載入指標…
          </div>
        ) : (
          kpis.map((item) => {
            const metricId = isAdsCompareMetric(item.id) ? item.id : null;
            return (
              <AdsKpiCard
                key={item.id}
                item={item}
                selected={metricId !== null && metricId === metric}
                onClick={metricId ? () => setMetric(metricId) : undefined}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
