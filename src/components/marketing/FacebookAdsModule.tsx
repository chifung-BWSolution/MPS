import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { resolveDateRange, useFacebookAdsData } from '@/hooks/useFacebookAdsData';
import type { DateRangePreset } from '@/types/facebookAds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function formatMoneyFromMicros(micros: number): string {
  return (micros / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

export function FacebookAdsModule() {
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
  } = useFacebookAdsData(range.from, range.to);

  useEffect(() => {
    setRange(resolveDateRange(preset, customFrom, customTo, dataMinDate, dataMaxDate));
  }, [preset, customFrom, customTo, dataMinDate, dataMaxDate]);

  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [businessFilter, setBusinessFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const businesses = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) {
      if (a.businessKey) map.set(a.businessKey, a.businessName || a.businessKey);
    }
    return [...map.entries()].map(([key, name]) => ({ key, name }));
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (businessFilter !== 'all' && a.businessKey !== businessFilter) return false;
      return true;
    });
  }, [accounts, businessFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (accountFilter !== 'all' && c.adAccountId !== accountFilter) return false;
      if (businessFilter !== 'all') {
        const biz = accounts.find((a) => a.adAccountId === c.adAccountId);
        if (!biz || biz.businessKey !== businessFilter) return false;
      }
      if (statusFilter !== 'all' && c.status.toUpperCase() !== statusFilter) return false;
      if (!q) return true;
      return (
        c.campaignName.toLowerCase().includes(q) ||
        (c.accountName || '').toLowerCase().includes(q) ||
        (c.businessName || '').toLowerCase().includes(q) ||
        c.adAccountId.includes(q)
      );
    });
  }, [campaigns, search, accountFilter, statusFilter, businessFilter, accounts]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, c) => {
        acc.impressions += c.impressions;
        acc.clicks += c.clicks;
        acc.spendMicros += c.spendMicros;
        acc.conversions += c.conversions;
        return acc;
      },
      { impressions: 0, clicks: 0, spendMicros: 0, conversions: 0 },
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
      const biz =
        typeof result.credentialsCount === 'number'
          ? ` · ${result.credentialsCount} Business`
          : result.businesses?.length
            ? ` · ${result.businesses.length} Business`
            : '';
      toast.success(`最近 7 日資料已更新${secs}${rows}${biz}`);
    } else toast.error(result.error || '同步失敗');
  };

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 flex-1 min-w-[280px]">
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Business</div>
              <div className="text-[18px] font-bold">{businesses.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">帳戶</div>
              <div className="text-[18px] font-bold">{filteredAccounts.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Campaigns</div>
              <div className="text-[18px] font-bold">{filtered.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Spend</div>
              <div className="text-[18px] font-bold">{formatMoneyFromMicros(totals.spendMicros)}</div>
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
            <SelectTrigger className="w-[140px] h-9 text-[13px]">
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
                className="w-[150px] h-9 text-[13px]"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-[12px] text-muted-foreground">至</span>
              <Input
                type="date"
                className="w-[150px] h-9 text-[13px]"
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
              placeholder="搜尋 campaign / 帳戶…"
              className="pl-8 h-9 text-[13px]"
            />
          </div>
          <Select value={businessFilter} onValueChange={setBusinessFilter}>
            <SelectTrigger className="w-[180px] h-9 text-[13px]">
              <SelectValue placeholder="Business" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部 Business</SelectItem>
              {businesses.map((b) => (
                <SelectItem key={b.key} value={b.key}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[200px] h-9 text-[13px]">
              <SelectValue placeholder="帳戶" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部帳戶</SelectItem>
              {filteredAccounts.map((a) => (
                <SelectItem key={a.adAccountId} value={a.adAccountId}>
                  {a.accountName || a.adAccountId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-9 text-[13px]">
              <SelectValue placeholder="狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="ENABLED">ENABLED</SelectItem>
              <SelectItem value="PAUSED">PAUSED</SelectItem>
              <SelectItem value="REMOVED">REMOVED</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-[12px] text-muted-foreground">
          Meta Marketing API · {businesses.length || lastSync?.credentialsCount || '—'} Business 憑證
          {businesses.length
            ? `（${businesses.map((b) => b.name).join('、')}）`
            : ''}
          {' · '}報表由每日指標彙總
          {dataMinDate && dataMaxDate
            ? ` · 已同步資料 ${dataMinDate} ~ ${dataMaxDate}`
            : ' · 尚無每日指標（請至「Facebook Ads 同步」執行歷史回填）'}
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
                <th className="text-left font-medium px-3 py-2.5">帳戶</th>
                <th className="text-left font-medium px-3 py-2.5">Campaign</th>
                <th className="text-left font-medium px-3 py-2.5">Objective</th>
                <th className="text-left font-medium px-3 py-2.5">狀態</th>
                <th className="text-right font-medium px-3 py-2.5">Impr.</th>
                <th className="text-right font-medium px-3 py-2.5">Clicks</th>
                <th className="text-right font-medium px-3 py-2.5">Spend</th>
                <th className="text-right font-medium px-3 py-2.5">Conv.</th>
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
                    此日期區間尚無資料。請先到「Facebook Ads 同步」執行完整歷史回填，或按 Refresh recent。
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
                        {c.accountName || c.adAccountId}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.businessName ? `${c.businessName} · ` : ''}
                        {c.adAccountId}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{c.campaignName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {c.objective || '—'}
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(c.status)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {c.impressions.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {c.clicks.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {formatMoneyFromMicros(c.spendMicros)}
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
