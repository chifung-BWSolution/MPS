import { useMemo, useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DateRangePreset } from '@/types/googleAds';
import { cn } from '@/lib/utils';
import { useAdsCampaignTagNames } from '@/hooks/useAdsCampaignTagNames';
import type { AdsAdvisorSnapshot } from '@/types/adsAdvisor';
import { AdsKpiCard } from './AdsKpiCard';
import { AdsMetricTrendChart } from './AdsMetricTrendChart';
import { AdsDonutChart } from './AdsDonutChart';
import { AdsDayOfWeekChart } from './AdsDayOfWeekChart';
import { AdsDailyMetricsTable } from './AdsDailyMetricsTable';
import { AdsPlaceholderPanel } from './AdsPlaceholderPanel';
import { AdsChannelBreakdownGrid } from './AdsBreakdownTables';
import { FacebookAdsBreakdownGrid } from './FacebookAdsBreakdownTables';
import { AdsCampaignAdvisorDock } from './AdsCampaignAdvisorDock';
import { normalizeGoogleAdsBreakdownChannel } from '@/types/googleAds';
import type {
  AdsCampaignDetailShellProps,
  AdsCampaignDetailViewModel,
  AdsDateRangeControls,
} from './types';

function buildAdvisorSnapshot(
  model: AdsCampaignDetailViewModel,
  dateRange: AdsDateRangeControls,
  tags: string[],
): AdsAdvisorSnapshot | null {
  if (!model.accountId || !model.campaignId) return null;
  return {
    platform: model.platform,
    accountId: model.accountId,
    campaignId: model.campaignId,
    campaignName: model.campaignName,
    status: model.status,
    accountLabel: model.accountLabel,
    channelOrObjective: model.channelOrObjective,
    objectives: model.objectives,
    brandLabel: model.brandLabel,
    websites: model.websites.map((w) => ({ domain: w.domain })),
    tags,
    dateFrom: dateRange.rangeFrom,
    dateTo: dateRange.rangeTo,
    kpis: model.kpis.map((kpi) => ({
      id: kpi.id,
      label: kpi.label,
      value: kpi.value,
      deltaPct: kpi.deltaPct,
    })),
  };
}

function statusBadge(status: string) {
  const s = status.toUpperCase();
  const color =
    s === 'ENABLED' || s === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'PAUSED'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded border text-[11px] font-medium ${color}`}>
      {status}
    </span>
  );
}

export function AdsCampaignDetailShell({
  model,
  dateRange,
  loading,
  error,
  onBack,
  onOpenWebsite,
  headerExtra,
}: AdsCampaignDetailShellProps) {
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const campaignRowId =
    model.accountId && model.campaignId ? `${model.accountId}:${model.campaignId}` : null;
  const { tagNames } = useAdsCampaignTagNames(model.platform, campaignRowId);
  const advisorSnapshot = useMemo(
    () => buildAdvisorSnapshot(model, dateRange, tagNames),
    [
      model,
      dateRange.rangeFrom,
      dateRange.rangeTo,
      tagNames,
    ],
  );
  const conversationKey = `${model.platform}:${model.accountId}:${model.campaignId}`;
  const advisorDisabled = loading && !model.series.length;

  return (
    <div className={cn('space-y-0', advisorOpen && 'pr-[400px]')}>
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5"
                onClick={onBack}
              >
                <ArrowLeft size={14} className="mr-1" />
                返回列表
              </Button>
              <span className="text-[12px] text-muted-foreground">
                {model.platformLabel}
                <span className="mx-1.5 text-slate-300">/</span>
                Campaign
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[22px] font-bold tracking-tight truncate">
                {model.campaignName}
              </h2>
              {statusBadge(model.status)}
              {model.channelOrObjective ? (
                <span className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white text-muted-foreground">
                  {model.channelOrObjective}
                </span>
              ) : null}
              {(model.objectives ?? []).map((objective) => (
                <span
                  key={objective}
                  className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white text-muted-foreground"
                >
                  {objective}
                </span>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span>
                {model.accountLabel}
                <span className="ml-1 font-mono text-[11px]">{model.accountId}</span>
              </span>
              {model.platform === 'facebook' ? (
                <>
                  {model.businessLabel ? <span>{model.businessLabel}</span> : null}
                  {model.brandLabel ? (
                    <span className="text-teal-700">{model.brandLabel}</span>
                  ) : (
                    <span>未設定品牌</span>
                  )}
                </>
              ) : model.websites.length > 0 ? (
                <span className="flex flex-wrap items-center gap-2">
                  {model.websites.map((w) =>
                    onOpenWebsite ? (
                      <button
                        key={`${w.websiteProfileId}:${w.domain}`}
                        type="button"
                        onClick={() => onOpenWebsite(w.websiteProfileId)}
                        className="text-teal-700 hover:text-teal-800 hover:underline"
                      >
                        {w.domain}
                      </button>
                    ) : (
                      <span key={`${w.websiteProfileId}:${w.domain}`}>{w.domain}</span>
                    ),
                  )}
                </span>
              ) : (
                <span>未關聯網站</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {headerExtra}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-teal-700 border-teal-200 bg-white hover:bg-teal-50"
              onClick={() => setAdvisorOpen((open) => !open)}
            >
              <Sparkles size={14} className="mr-1" />
              AI 顧問
            </Button>
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

      {loading && !model.series.length ? (
        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-4 py-16 text-center text-muted-foreground text-[13px]">
          載入 campaign 詳情…
        </div>
      ) : (
        <div className={cn('space-y-4', loading && 'opacity-70 pointer-events-none')}>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {model.kpis.map((kpi) => (
              <AdsKpiCard key={kpi.id} item={kpi} />
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 min-h-[340px]">
              <AdsMetricTrendChart series={model.series} />
            </div>
            <div className="min-h-[340px]">
              <AdsDonutChart series={model.series} />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <AdsDayOfWeekChart series={model.series} />
            <AdsDailyMetricsTable series={model.series} />
          </div>

          {(() => {
            const fb = model.facebookBreakdowns;
            if (model.platform === 'facebook' && fb) {
              return (
                <div className="space-y-2">
                  {fb.error ? (
                    <div className="text-[12px] text-red-600">{fb.error}</div>
                  ) : null}
                  <FacebookAdsBreakdownGrid
                    loading={fb.loading}
                    adSets={fb.adSets}
                    ads={fb.ads}
                    placements={fb.placements}
                  />
                </div>
              );
            }
            const breakdowns = model.breakdowns;
            const channel = normalizeGoogleAdsBreakdownChannel(
              breakdowns?.channelType || model.channelOrObjective,
            );
            if (breakdowns && breakdowns.supported && channel) {
              return (
                <div className="space-y-2">
                  {breakdowns.error ? (
                    <div className="text-[12px] text-red-600">{breakdowns.error}</div>
                  ) : null}
                  <AdsChannelBreakdownGrid
                    channel={channel}
                    loading={breakdowns.loading}
                    adGroups={breakdowns.adGroups}
                    keywords={breakdowns.keywords}
                    searchTerms={breakdowns.searchTerms}
                    assetGroups={breakdowns.assetGroups}
                    ads={breakdowns.ads}
                    assets={breakdowns.assets}
                    productGroups={breakdowns.productGroups}
                    products={breakdowns.products}
                  />
                </div>
              );
            }
            if ((model.placeholders ?? []).length > 0) {
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(model.placeholders ?? []).map((section) => (
                    <AdsPlaceholderPanel key={section.id} section={section} />
                  ))}
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      <AdsCampaignAdvisorDock
        open={advisorOpen}
        onOpenChange={setAdvisorOpen}
        snapshot={advisorSnapshot}
        disabled={advisorDisabled}
        conversationKey={conversationKey}
      />
    </div>
  );
}
