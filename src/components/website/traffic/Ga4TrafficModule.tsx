import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { resolveDateRange } from '@/hooks/useGoogleAdsData';
import { useGa4Data } from '@/hooks/useGa4Data';
import { parseGa4TrafficHashQuery, setGa4TrafficHash } from '@/lib/ga4Navigation';
import { formatDurationSeconds } from '@/lib/ga4Traffic';
import { openWebsiteDetail } from '@/lib/websiteNavigation';
import type { DateRangePreset } from '@/types/googleAds';
import type { Ga4Property } from '@/types/ga4';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Ga4TrafficDetail } from './Ga4TrafficDetail';

type SortKey =
  | 'website'
  | 'property'
  | 'account'
  | 'users'
  | 'sessions'
  | 'pageviews'
  | 'bounce'
  | 'engagement'
  | 'duration';
type SortDir = 'asc' | 'desc';

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hant', { sensitivity: 'base', numeric: true });
}

function getSortValue(row: Ga4Property, key: SortKey): string | number {
  switch (key) {
    case 'website':
      return row.matchedDomain || row.websiteName || '';
    case 'property':
      return row.displayName;
    case 'account':
      return row.accountName || row.accountId;
    case 'users':
      return row.users;
    case 'sessions':
      return row.sessions;
    case 'pageviews':
      return row.pageviews;
    case 'bounce':
      return row.bounceRate;
    case 'engagement':
      return row.engagementRate;
    case 'duration':
      return row.avgSessionDuration;
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
  const q = parseGa4TrafficHashQuery();
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

export function Ga4TrafficModule() {
  const { navigateTo } = useApp();
  const [hashQuery, setHashQuery] = useState(() => parseGa4TrafficHashQuery());

  useEffect(() => {
    const onHashChange = () => setHashQuery(parseGa4TrafficHashQuery());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const initial = useMemo(() => readInitialListRange(), []);
  const [preset, setPreset] = useState<DateRangePreset>(initial.preset);
  const [customFrom, setCustomFrom] = useState(initial.customFrom);
  const [customTo, setCustomTo] = useState(initial.customTo);
  const [range, setRange] = useState(() => initial.range);

  const {
    properties,
    lastSync,
    dataMinDate,
    dataMaxDate,
    loading,
    syncing,
    error,
    refresh,
    triggerSync,
  } = useGa4Data(range.from, range.to);

  useEffect(() => {
    setRange(resolveDateRange(preset, customFrom, customTo, dataMinDate, dataMaxDate));
  }, [preset, customFrom, customTo, dataMinDate, dataMaxDate]);

  useEffect(() => {
    if (hashQuery.property) return;
    if (hashQuery.preset) setPreset(hashQuery.preset);
    if (hashQuery.from) setCustomFrom(hashQuery.from);
    if (hashQuery.to) setCustomTo(hashQuery.to);
  }, [hashQuery.property, hashQuery.preset, hashQuery.from, hashQuery.to]);

  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [websiteFilter, setWebsiteFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('sessions');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const accounts = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of properties) {
      if (row.accountId) map.set(row.accountId, row.accountName || row.accountId);
    }
    return [...map.entries()].sort((a, b) => compareText(a[1], b[1]));
  }, [properties]);

  const websiteOptions = useMemo(() => {
    return [...new Set(properties.map((p) => p.matchedDomain).filter((d): d is string => !!d))].sort(
      compareText,
    );
  }, [properties]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = properties.filter((row) => {
      if (accountFilter !== 'all' && row.accountId !== accountFilter) return false;
      if (websiteFilter === 'none' && row.matchedDomain) return false;
      if (websiteFilter !== 'all' && websiteFilter !== 'none' && row.matchedDomain !== websiteFilter) {
        return false;
      }
      if (!q) return true;
      return [
        row.displayName,
        row.accountName,
        row.accountId,
        row.propertyId,
        row.matchedDomain,
        row.websiteName,
        row.measurementId,
      ]
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
  }, [accountFilter, properties, search, sortDir, sortKey, websiteFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, row) => {
        acc.users += row.users;
        acc.sessions += row.sessions;
        acc.pageviews += row.pageviews;
        acc.engaged += row.engagedSessions;
        return acc;
      },
      { users: 0, sessions: 0, pageviews: 0, engaged: 0 },
    );
  }, [filtered]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(typeof getSortValue(filtered[0] || properties[0] || { sessions: 0 } as Ga4Property, key) === 'number' ? 'desc' : 'asc');
  };

  const openProperty = (row: Ga4Property) => {
    setGa4TrafficHash({
      propertyId: row.propertyId,
      preset,
      from: range.from,
      to: range.to,
    });
  };

  const onSync = async () => {
    try {
      await triggerSync();
      toast.success('最近 7 日 GA4 資料已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GA4 同步失敗');
    }
  };

  if (hashQuery.property) {
    return (
      <Ga4TrafficDetail
        propertyId={hashQuery.property}
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
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight">網站流量</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              依日期區間檢視各網站 GA4 成效（每日指標彙總）。點擊列開啟詳情。
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 min-w-[280px] max-w-3xl">
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Properties</div>
              <div className="text-[18px] font-bold">{filtered.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Users</div>
              <div className="text-[18px] font-bold">{totals.users.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Sessions</div>
              <div className="text-[18px] font-bold">{totals.sessions.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Pageviews</div>
              <div className="text-[18px] font-bold">{totals.pageviews.toLocaleString()}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              重新載入
            </Button>
            <Button size="sm" onClick={() => void onSync()} disabled={syncing}>
              <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '更新中…' : 'Refresh recent (7d)'}
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
              placeholder="搜尋網站 / property / 帳戶…"
              className="pl-8 h-9 text-[13px] bg-white"
            />
          </div>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[200px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="帳戶" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部帳戶</SelectItem>
              {accounts.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          授權帳號 chifung.login@gmail.com · 報表由每日指標彙總 · 點擊列可開啟流量詳情
          {dataMinDate && dataMaxDate
            ? ` · 已同步資料 ${dataMinDate} ~ ${dataMaxDate}`
            : ' · 尚無每日指標（請用 Google Ads OAuth + Playground 設好 token，見 docs/ga4-setup.md）'}
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
                <SortableTh label="Property" sortKey="property" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="帳戶" sortKey="account" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Users" sortKey="users" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Sessions" sortKey="sessions" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Pageviews" sortKey="pageviews" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Bounce" sortKey="bounce" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Eng." sortKey="engagement" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Duration" sortKey="duration" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    載入中…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    此日期區間尚無資料。請先到「廣告數據同步」執行 GA4 完整歷史回填，或按 Refresh recent (7d)。
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((row) => (
                  <tr
                    key={row.propertyId}
                    role="button"
                    tabIndex={0}
                    onClick={() => openProperty(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openProperty(row);
                      }
                    }}
                    className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-2.5">
                      {row.matchedDomain || row.websiteName ? (
                        row.websiteProfileId ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openWebsiteDetail(row.websiteProfileId as string, navigateTo);
                            }}
                            className="text-left text-teal-700 hover:text-teal-800 hover:underline"
                          >
                            {row.matchedDomain || row.websiteName}
                          </button>
                        ) : (
                          <span>{row.matchedDomain || row.websiteName}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">未關聯</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-teal-800">{row.displayName}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{row.propertyId}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{row.accountName || row.accountId}</div>
                      <div className="text-[11px] text-muted-foreground">{row.accountId}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.users.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {row.sessions.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.pageviews.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {(row.bounceRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {(row.engagementRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatDurationSeconds(row.avgSessionDuration)}
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
