import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { resolveDateRange } from '@/hooks/useGoogleAdsData';
import { useGscSiteDetail } from '@/hooks/useGscSiteDetail';
import { gscPermissionLabel, isGscAnalyticsReadable } from '@/lib/analyticsToolConnections';
import { setGscReportHash } from '@/lib/gscNavigation';
import { formatGscCtr, formatGscPosition, pctChange } from '@/lib/gscReport';
import { openWebsiteDetail } from '@/lib/websiteNavigation';
import type { DateRangePreset } from '@/types/googleAds';
import type { AdsKpiItem } from '@/components/marketing/campaign-detail/types';
import { AdsKpiCard } from '@/components/marketing/campaign-detail/AdsKpiCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GscTrendChart } from './GscTrendChart';
import type { GscBreakdownRow, GscDailyPoint, GscMetricTotals } from '@/lib/gscReport';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

function buildKpis(
  totals: GscMetricTotals,
  previous: GscMetricTotals,
  series: GscDailyPoint[],
): AdsKpiItem[] {
  return [
    {
      id: 'clicks',
      label: 'Clicks',
      value: totals.clicks.toLocaleString(),
      deltaPct: pctChange(totals.clicks, previous.clicks),
      sparkline: series.map((p) => p.clicks),
    },
    {
      id: 'impressions',
      label: 'Impressions',
      value: totals.impressions.toLocaleString(),
      deltaPct: pctChange(totals.impressions, previous.impressions),
      sparkline: series.map((p) => p.impressions),
    },
    {
      id: 'ctr',
      label: 'CTR',
      value: formatGscCtr(totals.ctr),
      deltaPct: pctChange(totals.ctr, previous.ctr),
      sparkline: series.map((p) => p.ctr * 100),
      hint: 'Clicks ÷ Impressions',
    },
    {
      id: 'position',
      label: 'Avg. position',
      value: formatGscPosition(totals.position),
      deltaPct: (() => {
        const raw = pctChange(totals.position, previous.position);
        return raw == null ? null : -raw;
      })(),
      sparkline: series.map((p) => p.position),
      hint: '曝光加權平均排名；數字愈低愈好',
    },
  ];
}

function BreakdownTable({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: GscBreakdownRow[];
}) {
  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-[14px] font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto max-h-[420px]">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-muted-foreground sticky top-0">
            <tr>
              <th className="text-left font-medium px-3 py-2">{title === 'Queries' ? 'Query' : 'Page'}</th>
              <th className="text-right font-medium px-3 py-2">Clicks</th>
              <th className="text-right font-medium px-3 py-2">Impressions</th>
              <th className="text-right font-medium px-3 py-2">CTR</th>
              <th className="text-right font-medium px-3 py-2">Position</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-[12px] break-all">{row.key}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.clicks.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.impressions.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatGscCtr(row.ctr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatGscPosition(row.position)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function GscReportDetail({
  siteUrl,
  initialPreset,
  initialFrom,
  initialTo,
  dataMinDate,
  dataMaxDate,
}: {
  siteUrl: string;
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
  }, [initialFrom, initialPreset, initialTo, siteUrl]);

  useEffect(() => {
    setRange(resolveDateRange(preset, customFrom, customTo, dataMinDate, dataMaxDate));
  }, [customFrom, customTo, dataMaxDate, dataMinDate, preset]);

  useEffect(() => {
    setGscReportHash({
      siteUrl,
      preset,
      from: range.from,
      to: range.to,
    });
  }, [preset, range.from, range.to, siteUrl]);

  const { detail, loading, error } = useGscSiteDetail(siteUrl, range.from, range.to);
  const kpis = useMemo(() => {
    if (!detail) return [];
    return buildKpis(detail.totals, detail.previousTotals, detail.series);
  }, [detail]);
  const site = detail?.site;
  const permission = gscPermissionLabel(site?.permissionLevel);
  const readable = isGscAnalyticsReadable(site?.permissionLevel);

  return (
    <div className="space-y-4">
      <div className="sticky top-[calc(48px+var(--app-banner-h))] z-30 -mx-6 px-6 pt-1 pb-3 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-1"
              onClick={() =>
                setGscReportHash({
                  siteUrl: null,
                  preset,
                  from: range.from,
                  to: range.to,
                })
              }
            >
              <ArrowLeft size={14} className="mr-1" />
              返回 GSC 列表
            </Button>
            <h1 className="text-[28px] font-bold tracking-tight">
              {site?.websiteName || site?.matchedDomain || siteUrl}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1 font-mono break-all">{siteUrl}</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              {permission ? `${permission}` : '權限未知'}
              {!readable ? ' · 無法讀取 Search Analytics' : ''}
              {site?.lastSyncedAt
                ? ` · 最近同步 ${new Date(site.lastSyncedAt).toLocaleString()}`
                : ''}
            </p>
          </div>
          {site?.websiteProfileId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWebsiteDetail(site.websiteProfileId as string, navigateTo)}
            >
              開啟網站資料
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as DateRangePreset)}>
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
          {preset === 'custom' ? (
            <>
              <Input
                type="date"
                className="w-[150px] h-9 text-[13px] bg-white"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-[12px] text-muted-foreground">至</span>
              <Input
                type="date"
                className="w-[150px] h-9 text-[13px] bg-white"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </>
          ) : (
            <span className="text-[12px] text-muted-foreground tabular-nums">
              {range.from} → {range.to}
            </span>
          )}
          {error ? <span className="text-[12px] text-red-600">{error}</span> : null}
        </div>
      </div>

      {loading && !detail ? (
        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-4 py-16 text-center text-muted-foreground text-[13px]">
          載入 Search Console 詳情…
        </div>
      ) : (
        <div className={loading ? 'space-y-4 opacity-70 pointer-events-none' : 'space-y-4'}>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {kpis.map((kpi) => (
              <AdsKpiCard key={kpi.id} item={kpi} />
            ))}
          </div>
          <GscTrendChart series={detail?.series || []} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <BreakdownTable
              title="Queries"
              empty="此期間沒有查詢資料。GSC 只回傳有曝光的 query。"
              rows={detail?.queries || []}
            />
            <BreakdownTable
              title="Pages"
              empty="此期間沒有頁面資料。再按一次「同步 GSC」會寫入 page × date。"
              rows={detail?.pages || []}
            />
          </div>
        </div>
      )}
    </div>
  );
}
