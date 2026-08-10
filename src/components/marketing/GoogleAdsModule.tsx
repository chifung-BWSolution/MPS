import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { resolveDateRange, useGoogleAdsData } from '@/hooks/useGoogleAdsData';
import type { DateRangePreset, GoogleAdsCampaign } from '@/types/googleAds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { openWebsiteDetail } from '@/lib/websiteNavigation';
import { cn } from '@/lib/utils';

type SortKey =
  | 'account'
  | 'campaign'
  | 'website'
  | 'type'
  | 'status'
  | 'impressions'
  | 'clicks'
  | 'cost'
  | 'conversions';
type SortDir = 'asc' | 'desc';

function formatMoneyFromMicros(micros: number): string {
  return (micros / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hant', { sensitivity: 'base', numeric: true });
}

function getSortValue(c: GoogleAdsCampaign, key: SortKey): string | number {
  switch (key) {
    case 'account':
      return c.accountName || c.customerId;
    case 'campaign':
      return c.campaignName;
    case 'website':
      return c.matchedWebsites.map((w) => w.domain).join(', ');
    case 'type':
      return c.advertisingChannelType || '';
    case 'status':
      return c.status;
    case 'impressions':
      return c.impressions;
    case 'clicks':
      return c.clicks;
    case 'cost':
      return c.costMicros;
    case 'conversions':
      return c.conversions;
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

function statusBadge(status: string) {
  const s = status.toUpperCase();
  const color =
    s === 'ENABLED'
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

export function GoogleAdsModule() {
  const { navigateTo } = useApp();
  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [range, setRange] = useState(() =>
    resolveDateRange('30d', daysAgoIso(30), todayIso()),
  );

  const {
    accounts,
    campaigns,
    lastSync,
    dataMinDate,
    dataMaxDate,
    loading,
    syncing,
    error,
    refresh,
    triggerSync,
  } = useGoogleAdsData(range.from, range.to);

  useEffect(() => {
    setRange(resolveDateRange(preset, customFrom, customTo, dataMinDate, dataMaxDate));
  }, [preset, customFrom, customTo, dataMinDate, dataMaxDate]);

  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [websiteFilter, setWebsiteFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('cost');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const clientAccounts = useMemo(
    () => accounts.filter((a) => !a.isManager),
    [accounts],
  );

  const websiteOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of campaigns) {
      for (const w of c.matchedWebsites) set.add(w.domain);
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = campaigns.filter((c) => {
      if (accountFilter !== 'all' && c.customerId !== accountFilter) return false;
      if (statusFilter !== 'all' && c.status.toUpperCase() !== statusFilter) return false;
      if (websiteFilter === 'none' && c.matchedWebsites.length > 0) return false;
      if (
        websiteFilter !== 'all' &&
        websiteFilter !== 'none' &&
        !c.matchedWebsites.some((w) => w.domain === websiteFilter)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        c.campaignName.toLowerCase().includes(q) ||
        (c.accountName || '').toLowerCase().includes(q) ||
        c.customerId.includes(q) ||
        c.matchedWebsites.some((w) => w.domain.toLowerCase().includes(q))
      );
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return compareText(String(av), String(bv)) * dir;
    });
  }, [campaigns, search, accountFilter, statusFilter, websiteFilter, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(
        key === 'impressions' || key === 'clicks' || key === 'cost' || key === 'conversions'
          ? 'desc'
          : 'asc',
      );
    }
  };

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, c) => {
        acc.impressions += c.impressions;
        acc.clicks += c.clicks;
        acc.costMicros += c.costMicros;
        acc.conversions += c.conversions;
        return acc;
      },
      { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 },
    );
  }, [filtered]);

  const onSync = async () => {
    const result = await triggerSync();
    if (result.ok) {
      const secs =
        typeof result.durationMs === 'number'
          ? `（${(result.durationMs / 1000).toFixed(1)}s）`
          : '';
      const rows =
        typeof result.dailyRows === 'number' ? ` · ${result.dailyRows} daily rows` : '';
      toast.success(`最近 7 日資料已更新${secs}${rows}`);
    } else toast.error(result.error || '同步失敗');
  };

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 min-w-[280px]">
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">帳戶</div>
              <div className="text-[18px] font-bold">{clientAccounts.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Campaigns</div>
              <div className="text-[18px] font-bold">{filtered.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Spend</div>
              <div className="text-[18px] font-bold">{formatMoneyFromMicros(totals.costMicros)}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Clicks / Conv</div>
              <div className="text-[18px] font-bold">
                {totals.clicks.toLocaleString()} /{' '}
                {totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </div>
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
              placeholder="搜尋 campaign / 帳戶 / 網站…"
              className="pl-8 h-9 text-[13px] bg-white"
            />
          </div>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[200px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="帳戶" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部帳戶</SelectItem>
              {clientAccounts.map((a) => (
                <SelectItem key={a.customerId} value={a.customerId}>
                  {a.descriptiveName || a.customerId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="ENABLED">ENABLED</SelectItem>
              <SelectItem value="PAUSED">PAUSED</SelectItem>
              <SelectItem value="REMOVED">REMOVED</SelectItem>
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
          MCC 564-140-4438 · 報表由每日指標彙總
          {dataMinDate && dataMaxDate
            ? ` · 已同步資料 ${dataMinDate} ~ ${dataMaxDate}`
            : ' · 尚無每日指標（請至「Google Ads 同步」執行歷史回填）'}
          {lastSync?.finishedAt
            ? ` · 最近增量 ${new Date(lastSync.finishedAt).toLocaleString()} (${lastSync.status})`
            : ''}
          {error ? <span className="text-red-600 ml-2">{error}</span> : null}
        </div>
      </div>

      <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-muted-foreground">
              <tr>
                <SortableTh label="帳戶" sortKey="account" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Campaign" sortKey="campaign" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="網站" sortKey="website" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="類型" sortKey="type" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="狀態" sortKey="status" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Impr." sortKey="impressions" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Conv." sortKey="conversions" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
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
                    此日期區間尚無資料。請先到「Google Ads 同步」執行完整歷史回填，或按 Refresh recent。
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">
                        {c.accountName || c.customerId}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{c.customerId}</div>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{c.campaignName}</td>
                    <td className="px-3 py-2.5">
                      {c.matchedWebsites.length > 0 ? (
                        <div className="space-y-0.5">
                          {c.matchedWebsites.map((w) => (
                            <button
                              key={`${w.websiteProfileId}:${w.domain}`}
                              type="button"
                              onClick={() => openWebsiteDetail(w.websiteProfileId, navigateTo)}
                              className="block text-left text-[12px] leading-snug text-teal-700 hover:text-teal-800 hover:underline"
                              title="開啟網站詳情"
                            >
                              {w.domain}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {c.advertisingChannelType || '—'}
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(c.status)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {c.impressions.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {c.clicks.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {formatMoneyFromMicros(c.costMicros)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {c.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
