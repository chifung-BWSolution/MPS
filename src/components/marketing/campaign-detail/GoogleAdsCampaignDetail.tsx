import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { resolveDateRange } from '@/hooks/useGoogleAdsData';
import { useGoogleAdsCampaignDetail } from '@/hooks/useGoogleAdsCampaignDetail';
import { useGoogleAdsCampaignBreakdowns } from '@/hooks/useGoogleAdsCampaignBreakdowns';
import {
  parseCampaignKey,
  setGoogleAdsCampaignHash,
} from '@/lib/adsCampaignNavigation';
import { formatMoneyFromMicros } from '@/lib/formatMoney';
import { openWebsiteDetail } from '@/lib/websiteNavigation';
import type { DateRangePreset, GoogleAdsMetricTotals } from '@/types/googleAds';
import { AdsCampaignDetailShell } from './AdsCampaignDetailShell';
import type { AdsCampaignDetailViewModel, AdsKpiItem } from './types';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function buildKpis(
  totals: GoogleAdsMetricTotals,
  previous: GoogleAdsMetricTotals,
  series: { impressions: number; clicks: number; costMicros: number; conversions: number; ctr: number; averageCpcMicros: number }[],
): AdsKpiItem[] {
  const costSpark = series.map((p) => p.costMicros / 1_000_000);
  const cpaSpark = series.map((p) =>
    p.conversions > 0 ? p.costMicros / p.conversions / 1_000_000 : 0,
  );

  const items: AdsKpiItem[] = [
    {
      id: 'impressions',
      label: 'Impressions',
      value: totals.impressions.toLocaleString(),
      deltaPct: pctChange(totals.impressions, previous.impressions),
      sparkline: series.map((p) => p.impressions),
    },
    {
      id: 'clicks',
      label: 'Clicks',
      value: totals.clicks.toLocaleString(),
      deltaPct: pctChange(totals.clicks, previous.clicks),
      sparkline: series.map((p) => p.clicks),
    },
    {
      id: 'ctr',
      label: 'CTR',
      value: `${(totals.ctr * 100).toFixed(2)}%`,
      deltaPct: pctChange(totals.ctr, previous.ctr),
      sparkline: series.map((p) => p.ctr * 100),
    },
    {
      id: 'cost',
      label: 'Cost',
      value: formatMoneyFromMicros(totals.costMicros),
      deltaPct: pctChange(totals.costMicros, previous.costMicros),
      sparkline: costSpark,
    },
    {
      id: 'conversions',
      label: 'Conversions',
      value: totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      deltaPct: pctChange(totals.conversions, previous.conversions),
      sparkline: series.map((p) => p.conversions),
    },
    {
      id: 'cpc',
      label: totals.cpaMicros != null ? 'CPC / CPA' : 'Avg. CPC',
      value:
        totals.cpaMicros != null
          ? `${formatMoneyFromMicros(totals.averageCpcMicros)} / ${formatMoneyFromMicros(totals.cpaMicros)}`
          : formatMoneyFromMicros(totals.averageCpcMicros),
      deltaPct: pctChange(totals.averageCpcMicros, previous.averageCpcMicros),
      sparkline: totals.cpaMicros != null ? cpaSpark : series.map((p) => p.averageCpcMicros / 1_000_000),
      hint: totals.cpaMicros != null ? 'Avg CPC / CPA' : 'Average CPC',
    },
  ];
  return items;
}

export function GoogleAdsCampaignDetail({
  campaignKey,
  initialPreset,
  initialFrom,
  initialTo,
  dataMinDate,
  dataMaxDate,
}: {
  campaignKey: string;
  initialPreset?: DateRangePreset | null;
  initialFrom?: string | null;
  initialTo?: string | null;
  dataMinDate?: string | null;
  dataMaxDate?: string | null;
}) {
  const { navigateTo } = useApp();
  const parsed = parseCampaignKey(campaignKey);

  const [preset, setPreset] = useState<DateRangePreset>(initialPreset || '30d');
  const [customFrom, setCustomFrom] = useState(initialFrom || daysAgoIso(30));
  const [customTo, setCustomTo] = useState(initialTo || todayIso());
  const [range, setRange] = useState(() =>
    resolveDateRange(
      initialPreset || '30d',
      initialFrom || daysAgoIso(30),
      initialTo || todayIso(),
      dataMinDate,
      dataMaxDate,
    ),
  );

  useEffect(() => {
    if (initialPreset) setPreset(initialPreset);
    if (initialFrom) setCustomFrom(initialFrom);
    if (initialTo) setCustomTo(initialTo);
  }, [initialPreset, initialFrom, initialTo, campaignKey]);

  useEffect(() => {
    setRange(resolveDateRange(preset, customFrom, customTo, dataMinDate, dataMaxDate));
  }, [preset, customFrom, customTo, dataMinDate, dataMaxDate]);

  // Keep hash in sync when range changes on the detail page.
  useEffect(() => {
    setGoogleAdsCampaignHash({
      campaignKey,
      preset,
      from: range.from,
      to: range.to,
    });
  }, [campaignKey, preset, range.from, range.to]);

  const { detail, loading, error } = useGoogleAdsCampaignDetail(
    parsed?.customerId ?? null,
    parsed?.campaignId ?? null,
    range.from,
    range.to,
  );

  const {
    channelType: breakdownChannelType,
    supported: breakdownsSupported,
    adGroups,
    keywords,
    searchTerms,
    assetGroups,
    ads,
    assets,
    productGroups,
    products,
    loading: breakdownsLoading,
    error: breakdownsError,
  } = useGoogleAdsCampaignBreakdowns(
    parsed?.customerId ?? null,
    parsed?.campaignId ?? null,
    range.from,
    range.to,
    detail?.advertisingChannelType ?? null,
  );

  const model: AdsCampaignDetailViewModel = useMemo(() => {
    const breakdowns = {
      channelType: breakdownChannelType ?? detail?.advertisingChannelType ?? null,
      supported: breakdownsSupported,
      adGroups,
      keywords,
      searchTerms,
      assetGroups,
      ads,
      assets,
      productGroups,
      products,
      loading: breakdownsLoading,
      error: breakdownsError,
    };

    if (!detail) {
      return {
        platform: 'google' as const,
        platformLabel: 'Google Ads',
        campaignName: parsed?.campaignId || campaignKey,
        status: '—',
        accountLabel: parsed?.customerId || '—',
        accountId: parsed?.customerId || '',
        websites: [],
        series: [],
        kpis: buildKpis(
          {
            impressions: 0,
            clicks: 0,
            costMicros: 0,
            conversions: 0,
            ctr: 0,
            averageCpcMicros: 0,
            cpaMicros: null,
          },
          {
            impressions: 0,
            clicks: 0,
            costMicros: 0,
            conversions: 0,
            ctr: 0,
            averageCpcMicros: 0,
            cpaMicros: null,
          },
          [],
        ),
        breakdowns,
      };
    }

    return {
      platform: 'google' as const,
      platformLabel: 'Google Ads',
      campaignName: detail.campaignName,
      status: detail.status,
      accountLabel: detail.accountName || detail.customerId,
      accountId: detail.customerId,
      channelOrObjective: detail.advertisingChannelType,
      objectives: detail.objectives,
      websites: detail.matchedWebsites,
      series: detail.series.map((p) => ({
        date: p.date,
        impressions: p.impressions,
        clicks: p.clicks,
        cost: p.costMicros / 1_000_000,
        conversions: p.conversions,
        ctr: p.ctr,
        cpc: p.averageCpcMicros / 1_000_000,
      })),
      kpis: buildKpis(detail.totals, detail.previousTotals, detail.series),
      breakdowns,
    };
  }, [
    detail,
    parsed,
    campaignKey,
    breakdownChannelType,
    breakdownsSupported,
    adGroups,
    keywords,
    searchTerms,
    assetGroups,
    ads,
    assets,
    productGroups,
    products,
    breakdownsLoading,
    breakdownsError,
  ]);

  const onBack = () => {
    setGoogleAdsCampaignHash({
      campaignKey: null,
      preset,
      from: range.from,
      to: range.to,
    });
  };

  if (!parsed) {
    return (
      <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-4 py-10 text-center space-y-3">
        <p className="text-[13px] text-muted-foreground">無效的 campaign 參數。</p>
        <button
          type="button"
          className="text-[13px] text-teal-700 hover:underline"
          onClick={onBack}
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <AdsCampaignDetailShell
      model={model}
      loading={loading}
      error={error}
      onBack={onBack}
      onOpenWebsite={(id) => openWebsiteDetail(id, navigateTo)}
      dateRange={{
        preset,
        customFrom,
        customTo,
        rangeFrom: range.from,
        rangeTo: range.to,
        dataMinDate,
        dataMaxDate,
        onPresetChange: setPreset,
        onCustomFromChange: setCustomFrom,
        onCustomToChange: setCustomTo,
      }}
    />
  );
}
