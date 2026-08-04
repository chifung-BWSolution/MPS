import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useGoogleAdsData } from '@/hooks/useGoogleAdsData';
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

export function GoogleAdsModule() {
  const {
    accounts,
    campaigns,
    lastSync,
    loading,
    syncing,
    error,
    refresh,
    triggerSync,
  } = useGoogleAdsData();

  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const clientAccounts = useMemo(
    () => accounts.filter((a) => !a.isManager),
    [accounts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (accountFilter !== 'all' && c.customerId !== accountFilter) return false;
      if (statusFilter !== 'all' && c.status.toUpperCase() !== statusFilter) return false;
      if (!q) return true;
      return (
        c.campaignName.toLowerCase().includes(q) ||
        (c.accountName || '').toLowerCase().includes(q) ||
        c.customerId.includes(q)
      );
    });
  }, [campaigns, search, accountFilter, statusFilter]);

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
      const camps =
        typeof result.campaignsSynced === 'number'
          ? ` · ${result.campaignsSynced} campaigns`
          : '';
      toast.success(`Google Ads 同步完成${secs}${camps}`);
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
              <div className="text-[11px] text-muted-foreground">Spend (30d)</div>
              <div className="text-[18px] font-bold">{formatMoneyFromMicros(totals.costMicros)}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Clicks / Conv</div>
              <div className="text-[18px] font-bold">
                {totals.clicks.toLocaleString()} / {totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              重新載入
            </Button>
            <Button size="sm" onClick={() => void onSync()} disabled={syncing}>
              <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '同步中…' : '同步 Google Ads'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 campaign / 帳戶…"
              className="pl-8 h-9 text-[13px]"
            />
          </div>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[220px] h-9 text-[13px]">
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
            <SelectTrigger className="w-[140px] h-9 text-[13px]">
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
          MCC 564-140-4438 · 指標為近 30 日彙總
          {lastSync?.finishedAt
            ? ` · 上次同步 ${new Date(lastSync.finishedAt).toLocaleString()} (${lastSync.status})`
            : ' · 尚未同步'}
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
                <th className="text-left font-medium px-3 py-2.5">類型</th>
                <th className="text-left font-medium px-3 py-2.5">狀態</th>
                <th className="text-right font-medium px-3 py-2.5">Impr.</th>
                <th className="text-right font-medium px-3 py-2.5">Clicks</th>
                <th className="text-right font-medium px-3 py-2.5">Cost</th>
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
                    尚無資料。請先部署 Edge Function 並設定 Google Ads secrets，再按「同步 Google Ads」。
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
