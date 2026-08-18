import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DateRangePreset } from '@/types/googleAds';
import { cn } from '@/lib/utils';
import { AdsKpiCard } from '@/components/marketing/campaign-detail/AdsKpiCard';
import type { AdsDateRangeControls, AdsKpiItem } from '@/components/marketing/campaign-detail/types';
import type { Ga4ChannelPoint, Ga4CountryRow, Ga4DailyMetricPoint, Ga4DeviceRow, Ga4PageRow, Ga4SourceRow } from '@/types/ga4';
import { Ga4MetricTrendChart } from './Ga4MetricTrendChart';
import { Ga4DonutChart } from './Ga4DonutChart';
import { Ga4DayOfWeekChart } from './Ga4DayOfWeekChart';
import { Ga4DailyMetricsTable } from './Ga4DailyMetricsTable';
import { Ga4BreakdownGrid } from './Ga4BreakdownTables';

export function Ga4TrafficDetailShell({
  title,
  statusLabel,
  accountLabel,
  accountId,
  propertyId,
  websiteLabel,
  measurementId,
  kpis,
  series,
  channels,
  dateRange,
  loading,
  error,
  breakdowns,
  onBack,
  onOpenWebsite,
}: {
  title: string;
  statusLabel?: string;
  accountLabel: string;
  accountId: string;
  propertyId: string;
  websiteLabel?: string | null;
  measurementId?: string | null;
  kpis: AdsKpiItem[];
  series: Ga4DailyMetricPoint[];
  channels: Ga4ChannelPoint[];
  dateRange: AdsDateRangeControls;
  loading: boolean;
  error: string | null;
  breakdowns: {
    loading: boolean;
    error?: string | null;
    pages: Ga4PageRow[];
    devices: Ga4DeviceRow[];
    countries: Ga4CountryRow[];
    sources: Ga4SourceRow[];
  };
  onBack: () => void;
  onOpenWebsite?: () => void;
}) {
  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <Button type="button" variant="outline" size="sm" className="h-8 px-2.5" onClick={onBack}>
                <ArrowLeft size={14} className="mr-1" />
                返回列表
              </Button>
              <span className="text-[12px] text-muted-foreground">
                Google Analytics 4
                <span className="mx-1.5 text-slate-300">/</span>
                網站流量
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[22px] font-bold tracking-tight truncate">{title}</h2>
              {statusLabel ? (
                <span className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white text-muted-foreground">
                  {statusLabel}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span>
                {accountLabel}
                <span className="ml-1 font-mono text-[11px]">{accountId}</span>
              </span>
              <span className="font-mono text-[11px]">property {propertyId}</span>
              {measurementId ? <span className="font-mono text-[11px]">{measurementId}</span> : null}
              {websiteLabel ? (
                onOpenWebsite ? (
                  <button
                    type="button"
                    onClick={onOpenWebsite}
                    className="text-teal-700 hover:text-teal-800 hover:underline"
                  >
                    {websiteLabel}
                  </button>
                ) : (
                  <span className="text-teal-700">{websiteLabel}</span>
                )
              ) : (
                <span>未關聯網站</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={dateRange.preset}
            onValueChange={(v) => dateRange.onPresetChange(v as DateRangePreset)}
          >
            <SelectTrigger className="w-[140px] h-9 text-[13px] bg-white">
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
          {dateRange.preset === 'custom' ? (
            <>
              <Input
                type="date"
                className="w-[150px] h-9 text-[13px] bg-white"
                value={dateRange.customFrom}
                onChange={(e) => dateRange.onCustomFromChange(e.target.value)}
              />
              <span className="text-[12px] text-muted-foreground">至</span>
              <Input
                type="date"
                className="w-[150px] h-9 text-[13px] bg-white"
                value={dateRange.customTo}
                onChange={(e) => dateRange.onCustomToChange(e.target.value)}
              />
            </>
          ) : (
            <span className="text-[12px] text-muted-foreground tabular-nums">
              {dateRange.rangeFrom} → {dateRange.rangeTo}
            </span>
          )}
          {error ? <span className="text-[12px] text-red-600">{error}</span> : null}
        </div>
      </div>

      {loading && !series.length ? (
        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-4 py-16 text-center text-muted-foreground text-[13px]">
          載入網站流量詳情…
        </div>
      ) : (
        <div className={cn('space-y-4', loading && 'opacity-70 pointer-events-none')}>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {kpis.map((kpi) => (
              <AdsKpiCard key={kpi.id} item={kpi} />
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 min-h-[340px]">
              <Ga4MetricTrendChart series={series} />
            </div>
            <div className="min-h-[340px]">
              <Ga4DonutChart channels={channels} />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Ga4DayOfWeekChart series={series} />
            <Ga4DailyMetricsTable series={series} />
          </div>

          <div className="space-y-2">
            {breakdowns.error ? (
              <div className="text-[12px] text-red-600">{breakdowns.error}</div>
            ) : null}
            <Ga4BreakdownGrid
              loading={breakdowns.loading}
              pages={breakdowns.pages}
              devices={breakdowns.devices}
              countries={breakdowns.countries}
              sources={breakdowns.sources}
            />
          </div>
        </div>
      )}
    </div>
  );
}
