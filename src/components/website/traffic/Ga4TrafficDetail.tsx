import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { resolveDateRange } from '@/hooks/useGoogleAdsData';
import { useGa4PropertyDetail } from '@/hooks/useGa4PropertyDetail';
import { useGa4Breakdowns } from '@/hooks/useGa4Breakdowns';
import { setGa4TrafficHash } from '@/lib/ga4Navigation';
import { formatDurationSeconds, type Ga4MetricTotals } from '@/lib/ga4Traffic';
import { openWebsiteDetail } from '@/lib/websiteNavigation';
import type { DateRangePreset } from '@/types/googleAds';
import type { AdsKpiItem } from '@/components/marketing/campaign-detail/types';
import type { Ga4DailyMetricPoint } from '@/types/ga4';
import { Ga4TrafficDetailShell } from './Ga4TrafficDetailShell';

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
  totals: Ga4MetricTotals,
  previous: Ga4MetricTotals,
  series: Ga4DailyMetricPoint[],
): AdsKpiItem[] {
  return [
    {
      id: 'users',
      label: 'Users',
      value: totals.users.toLocaleString(),
      deltaPct: pctChange(totals.users, previous.users),
      sparkline: series.map((p) => p.users),
    },
    {
      id: 'sessions',
      label: 'Sessions',
      value: totals.sessions.toLocaleString(),
      deltaPct: pctChange(totals.sessions, previous.sessions),
      sparkline: series.map((p) => p.sessions),
    },
    {
      id: 'pageviews',
      label: 'Pageviews',
      value: totals.pageviews.toLocaleString(),
      deltaPct: pctChange(totals.pageviews, previous.pageviews),
      sparkline: series.map((p) => p.pageviews),
    },
    {
      id: 'bounce',
      label: 'Bounce rate',
      value: `${(totals.bounceRate * 100).toFixed(1)}%`,
      deltaPct: pctChange(totals.bounceRate, previous.bounceRate),
      sparkline: series.map((p) => p.bounceRate * 100),
      hint: '1 − 參與工作階段比率',
    },
    {
      id: 'engagement',
      label: 'Engagement',
      value: `${(totals.engagementRate * 100).toFixed(1)}%`,
      deltaPct: pctChange(totals.engagementRate, previous.engagementRate),
      sparkline: series.map((p) => p.engagementRate * 100),
    },
    {
      id: 'duration',
      label: 'Avg. duration',
      value: formatDurationSeconds(totals.avgSessionDuration),
      deltaPct: pctChange(totals.avgSessionDuration, previous.avgSessionDuration),
      sparkline: series.map((p) => p.avgSessionDuration),
    },
  ];
}

export function Ga4TrafficDetail({
  propertyId,
  initialPreset,
  initialFrom,
  initialTo,
  dataMinDate,
  dataMaxDate,
}: {
  propertyId: string;
  initialPreset?: DateRangePreset | null;
  initialFrom?: string | null;
  initialTo?: string | null;
  dataMinDate?: string | null;
  dataMaxDate?: string | null;
}) {
  const { navigateTo } = useApp();
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
  }, [initialPreset, initialFrom, initialTo, propertyId]);

  useEffect(() => {
    setRange(resolveDateRange(preset, customFrom, customTo, dataMinDate, dataMaxDate));
  }, [preset, customFrom, customTo, dataMinDate, dataMaxDate]);

  useEffect(() => {
    setGa4TrafficHash({
      propertyId,
      preset,
      from: range.from,
      to: range.to,
    });
  }, [propertyId, preset, range.from, range.to]);

  const { detail, loading, error } = useGa4PropertyDetail(propertyId, range.from, range.to);
  const breakdowns = useGa4Breakdowns(propertyId, range.from, range.to);

  const kpis = useMemo(() => {
    if (!detail) return [];
    return buildKpis(detail.totals, detail.previousTotals, detail.series);
  }, [detail]);

  const property = detail?.property;

  return (
    <Ga4TrafficDetailShell
      title={property?.websiteName || property?.displayName || `Property ${propertyId}`}
      statusLabel={property?.matchedDomain || undefined}
      accountLabel={property?.accountName || 'GA4'}
      accountId={property?.accountId || ''}
      propertyId={propertyId}
      websiteLabel={property?.matchedDomain || property?.websiteName}
      measurementId={property?.measurementId}
      kpis={kpis}
      series={detail?.series || []}
      channels={detail?.channels || []}
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
      loading={loading}
      error={error}
      breakdowns={breakdowns}
      onBack={() =>
        setGa4TrafficHash({
          propertyId: null,
          preset,
          from: range.from,
          to: range.to,
        })
      }
      onOpenWebsite={
        property?.websiteProfileId
          ? () => openWebsiteDetail(property.websiteProfileId as string, navigateTo)
          : undefined
      }
    />
  );
}
