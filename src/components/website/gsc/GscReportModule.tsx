import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { resolveDateRange } from '@/hooks/useGoogleAdsData';
import { useGscReport } from '@/hooks/useGscReport';
import { gscPermissionLabel, isGscAnalyticsReadable } from '@/lib/analyticsToolConnections';
import { buildGscReportHref, parseGscReportHashQuery, setGscReportHash } from '@/lib/gscNavigation';
import { appHrefClickProps } from '@/lib/appNavigation';
import { formatGscCtr, formatGscPosition } from '@/lib/gscReport';
import { buildWebsiteDetailHref } from '@/lib/websiteNavigation';
import type { DateRangePreset } from '@/types/googleAds';
import type { GscSiteRow } from '@/types/gsc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { GscReportDetail } from './GscReportDetail';

type SortKey = 'website' | 'property' | 'permission' | 'clicks' | 'impressions' | 'ctr' | 'position' | 'synced';
type SortDir = 'asc' | 'desc';

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hant', { sensitivity: 'base', numeric: true });
}

function getSortValue(row: GscSiteRow, key: SortKey): string | number {
  switch (key) {
    case 'website':
      return row.matchedDomain || row.websiteName || '';
    case 'property':
      return row.siteUrl;
    case 'permission':
      return gscPermissionLabel(row.permissionLevel) || row.permissionLevel || '';
    case 'clicks':
      return row.clicks;
    case 'impressions':
      return row.impressions;
    case 'ctr':
      return row.ctr;
    case 'position':
      return row.position || 999;
    case 'synced':
      return row.lastSyncedAt || '';
  }
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  sortDir,
  align = 'left',
  onSort,
}: {
  label: ReactNode;
  sortKey: SortKey;
  activeKey: SortKey;
  sortDir: SortDir;
  align?: 'left' | 'right';
  onSort: (key: SortKey) => void;
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

function readInitialListRange() {
  const q = parseGscReportHashQuery();
  const preset = q.preset || '30d';
  const customFrom = q.from || daysAgoIso(30);
  const customTo = q.to || todayIso();
  return {
    preset: preset as DateRangePreset,
    customFrom,
    customTo,
    range: resolveDateRange(preset, customFrom, customTo),
  };
}

export function GscReportModule() {
  const [hashQuery, setHashQuery] = useState(() => parseGscReportHashQuery());

  useEffect(() => {
    const onHashChange = () => setHashQuery(parseGscReportHashQuery());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const initial = useMemo(() => readInitialListRange(), []);
  const [preset, setPreset] = useState<DateRangePreset>(initial.preset);
  const [customFrom, setCustomFrom] = useState(initial.customFrom);
  const [customTo, setCustomTo] = useState(initial.customTo);
  const [range, setRange] = useState(() => initial.range);

  const {
    sites,
    lastSync,
    dataMinDate,
    dataMaxDate,
    loading,
    syncing,
    error,
    refresh,
    triggerSync,
  } = useGscReport(range.from, range.to);

  useEffect(() => {
    setRange(resolveDateRange(preset, customFrom, customTo, dataMinDate, dataMaxDate));
  }, [customFrom, customTo, dataMaxDate, dataMinDate, preset]);

  useEffect(() => {
    if (hashQuery.site) return;
    if (hashQuery.preset) setPreset(hashQuery.preset);
    if (hashQuery.from) setCustomFrom(hashQuery.from);
    if (hashQuery.to) setCustomTo(hashQuery.to);
  }, [hashQuery.from, hashQuery.preset, hashQuery.site, hashQuery.to]);

  const [search, setSearch] = useState('');
  const [websiteFilter, setWebsiteFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const websiteOptions = useMemo(() => {
    return [...new Set(sites.map((p) => p.matchedDomain).filter((d): d is string => !!d))].sort(compareText);
  }, [sites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = sites.filter((row) => {
      if (websiteFilter === 'none' && row.matchedDomain) return false;
      if (websiteFilter !== 'all' && websiteFilter !== 'none' && row.matchedDomain !== websiteFilter) {
        return false;
      }
      if (!q) return true;
      return [row.siteUrl, row.matchedDomain, row.websiteName, row.permissionLevel]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    rows.sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      const cmp =
        typeof av === 'number' && typeof bv === 'number' ? av - bv : compareText(String(av), String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [search, sites, sortDir, sortKey, websiteFilter]);

  const totals = useMemo(() => {
    const clicks = filtered.reduce((n, row) => n + row.clicks, 0);
    const impressions = filtered.reduce((n, row) => n + row.impressions, 0);
    const positionWeighted = filtered.reduce((n, row) => n + row.position * row.impressions, 0);
    return {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: impressions > 0 ? positionWeighted / impressions : 0,
    };
  }, [filtered]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(typeof getSortValue(filtered[0] || sites[0] || { clicks: 0 } as GscSiteRow, key) === 'number' ? 'desc' : 'asc');
  };

  const openSite = (row: GscSiteRow) => {
    setGscReportHash({
      siteUrl: row.siteUrl,
      preset,
      from: range.from,
      to: range.to,
    });
  };

  const onSync = async () => {
    try {
      await triggerSync();
      toast.success('GSC 同步已完成或寫入目前進度');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GSC 同步失敗');
    }
  };

  if (hashQuery.site) {
    return (
      <GscReportDetail
        siteUrl={hashQuery.site}
        initialPreset={hashQuery.preset || preset}
        initialFrom={hashQuery.from || range.from}
        initialTo={hashQuery.to || range.to}
        dataMinDate={dataMinDate}
        dataMaxDate={dataMaxDate}
      />
    );
  }

  return (
    <div className="space-y-0">
      <div className="sticky top-[calc(48px+var(--app-banner-h))] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight">Search Console</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              依日期區間檢視各 GSC 資源的搜尋成效（Clicks、Impressions、CTR、Position）。點擊列開啟詳情。
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 min-w-[280px] max-w-3xl">
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Properties</div>
              <div className="text-[18px] font-bold">{filtered.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Clicks</div>
              <div className="text-[18px] font-bold">{totals.clicks.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Impressions</div>
              <div className="text-[18px] font-bold">{totals.impressions.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">CTR / Pos.</div>
              <div className="text-[18px] font-bold">
                {formatGscCtr(totals.ctr)}
                <span className="text-[12px] font-medium text-muted-foreground ml-2">
                  {formatGscPosition(totals.position)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              重新載入
            </Button>
            <Button size="sm" onClick={() => void onSync()} disabled={syncing}>
              <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '同步中…' : '同步 GSC'}
            </Button>
          </div>
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
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋網站 / GSC 資源…"
              className="pl-8 h-9 text-[13px] bg-white"
            />
          </div>
          <Select value={websiteFilter} onValueChange={setWebsiteFilter}>
            <SelectTrigger className="w-[200px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="網站" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部網站</SelectItem>
              <SelectItem value="none">未關聯</SelectItem>
              {websiteOptions.map((domain) => (
                <SelectItem key={domain} value={domain}>
                  {domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-[12px] text-muted-foreground">
          授權帳號 chifung.login@gmail.com · 報表由 Search Analytics 彙總 · 點擊列可開啟 GSC 詳情
          {dataMinDate && dataMaxDate
            ? ` · 已同步資料 ${dataMinDate} ~ ${dataMaxDate}`
            : ' · 尚無查詢指標（請先同步 GSC）'}
          {lastSync?.finishedAt
            ? ` · 最近同步 ${new Date(lastSync.finishedAt).toLocaleString()} (${lastSync.status})`
            : ''}
          {error ? <span className="text-red-600 ml-2">{error}</span> : null}
        </div>
      </div>

      <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-muted-foreground">
              <tr>
                <SortableTh label="網站" sortKey="website" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="GSC 資源" sortKey="property" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="權限" sortKey="permission" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Impressions" sortKey="impressions" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="CTR" sortKey="ctr" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Position" sortKey="position" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="同步" sortKey="synced" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
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
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    此日期區間尚無 GSC 資料。請先到「廣告數據同步」授權，或按「同步 GSC」。
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((row) => (
                  <tr
                    key={row.siteUrl}
                    role="button"
                    tabIndex={0}
                    {...appHrefClickProps(
                      buildGscReportHref({
                        siteUrl: row.siteUrl,
                        preset,
                        from: range.from,
                        to: range.to,
                      }),
                      () => openSite(row),
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openSite(row);
                      }
                    }}
                    className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-2.5">
                      {row.matchedDomain || row.websiteName ? (
                        row.websiteProfileId ? (
                          <a
                            href={buildWebsiteDetailHref(row.websiteProfileId as string)}
                            onClick={(e) => e.stopPropagation()}
                            className="text-left text-teal-700 hover:text-teal-800 hover:underline"
                          >
                            {row.matchedDomain || row.websiteName}
                          </a>
                        ) : (
                          <span>{row.matchedDomain || row.websiteName}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">未關聯</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-teal-800 font-mono text-[12px] break-all">{row.siteUrl}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {gscPermissionLabel(row.permissionLevel) || '—'}
                      {!isGscAnalyticsReadable(row.permissionLevel) ? (
                        <div className="text-[11px] text-muted-foreground">無法讀取查詢</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {row.clicks.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.impressions.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatGscCtr(row.ctr)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatGscPosition(row.position)}</td>
                    <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                      {row.lastSyncedAt ? new Date(row.lastSyncedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
