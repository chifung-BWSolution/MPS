import { useEffect, useMemo, useState } from 'react';
import { resolveDateRange } from '@/hooks/useFacebookAdsData';
import { useFacebookAdsCampaignDetail } from '@/hooks/useFacebookAdsCampaignDetail';
import { useFacebookAdsCampaignBreakdowns } from '@/hooks/useFacebookAdsCampaignBreakdowns';
import {
  parseCampaignKey,
  setFacebookAdsCampaignHash,
} from '@/lib/adsCampaignNavigation';
import type { DateRangePreset, FacebookAdsMetricTotals } from '@/types/facebookAds';
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

function formatMoneyFromMicros(micros: number): string {
  return (micros / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  totals: FacebookAdsMetricTotals,
  previous: FacebookAdsMetricTotals,
  series: {
    impressions: number;
    clicks: number;
    spendMicros: number;
    conversions: number;
    ctr: number;
    averageCpcMicros: number;
  }[],
): AdsKpiItem[] {
  const costSpark = series.map((p) => p.spendMicros / 1_000_000);
  const cpaSpark = series.map((p) =>
    p.conversions > 0 ? p.spendMicros / p.conversions / 1_000_000 : 0,
  );

  return [
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
      value: formatMoneyFromMicros(totals.spendMicros),
      deltaPct: pctChange(totals.spendMicros, previous.spendMicros),
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
      sparkline:
        totals.cpaMicros != null
          ? cpaSpark
          : series.map((p) => p.averageCpcMicros / 1_000_000),
      hint: totals.cpaMicros != null ? 'Avg CPC / CPA' : 'Average CPC',
    },
  ];
}

const EMPTY_TOTALS: FacebookAdsMetricTotals = {
  impressions: 0,
  clicks: 0,
  spendMicros: 0,
  conversions: 0,
  ctr: 0,
  averageCpcMicros: 0,
  cpaMicros: null,
};

function brandLabel(
  code?: string,
  displayName?: string,
): string | undefined {
  if (!code) return undefined;
  if (displayName && displayName !== code) return `${code} · ${displayName}`;
  return code;
}

export function FacebookAdsCampaignDetail({
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
  const parsed = parseCampaignKey(campaignKey);
  const adAccountId = parsed?.customerId ?? null;
  const campaignId = parsed?.campaignId ?? null;

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

  useEffect(() => {
    setFacebookAdsCampaignHash({
      campaignKey,
      preset,
      from: range.from,
      to: range.to,
    });
  }, [campaignKey, preset, range.from, range.to]);

  const { detail, loading, error } = useFacebookAdsCampaignDetail(
    adAccountId,
    campaignId,
    range.from,
    range.to,
  );

  const {
    supported: breakdownsSupported,
    adSets,
    ads,
    placements,
    loading: breakdownsLoading,
    error: breakdownsError,
  } = useFacebookAdsCampaignBreakdowns(
    adAccountId,
    campaignId,
    range.from,
    range.to,
  );

  const model: AdsCampaignDetailViewModel = useMemo(() => {
    const facebookBreakdowns = {
      supported: breakdownsSupported,
      adSets,
      ads,
      placements,
      loading: breakdownsLoading,
      error: breakdownsError,
    };

    if (!detail) {
      return {
        platform: 'facebook' as const,
        platformLabel: 'Facebook Ads',
        campaignName: campaignId || campaignKey,
        status: '—',
        accountLabel: adAccountId || '—',
        accountId: adAccountId || '',
        websites: [],
        series: [],
        kpis: buildKpis(EMPTY_TOTALS, EMPTY_TOTALS, []),
        facebookBreakdowns,
      };
    }

    return {
      platform: 'facebook' as const,
      platformLabel: 'Facebook Ads',
      campaignName: detail.campaignName,
      status: detail.status,
      accountLabel: detail.accountName || detail.adAccountId,
      accountId: detail.adAccountId,
      channelOrObjective: detail.objective,
      businessLabel: detail.businessName,
      brandLabel: brandLabel(detail.brandCode, detail.brandDisplayName),
      websites: [],
      series: detail.series.map((p) => ({
        date: p.date,
        impressions: p.impressions,
        clicks: p.clicks,
        cost: p.spendMicros / 1_000_000,
        conversions: p.conversions,
        ctr: p.ctr,
        cpc: p.averageCpcMicros / 1_000_000,
      })),
      kpis: buildKpis(detail.totals, detail.previousTotals, detail.series),
      facebookBreakdowns,
    };
  }, [
    detail,
    adAccountId,
    campaignId,
    campaignKey,
    breakdownsSupported,
    adSets,
    ads,
    placements,
    breakdownsLoading,
    breakdownsError,
  ]);

  const onBack = () => {
    setFacebookAdsCampaignHash({
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
