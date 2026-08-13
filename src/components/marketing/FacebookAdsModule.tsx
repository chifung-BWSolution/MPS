import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { resolveDateRange, useFacebookAdsData } from '@/hooks/useFacebookAdsData';
import { useBrands } from '@/hooks/useBrands';
import type { DateRangePreset, FacebookAdsCampaign } from '@/types/facebookAds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CrudModal } from '@/components/ui/crud-modal';
import { cn } from '@/lib/utils';
import {
  parseAdsCampaignHashQuery,
  setFacebookAdsCampaignHash,
} from '@/lib/adsCampaignNavigation';
import { FacebookAdsCampaignDetail } from './campaign-detail/FacebookAdsCampaignDetail';

type SortKey =
  | 'account'
  | 'campaign'
  | 'brand'
  | 'objective'
  | 'status'
  | 'impressions'
  | 'clicks'
  | 'spend'
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

function getSortValue(c: FacebookAdsCampaign, key: SortKey): string | number {
  switch (key) {
    case 'account':
      return c.accountName || c.adAccountId;
    case 'campaign':
      return c.campaignName;
    case 'brand':
      return c.brandCode || c.brandDisplayName || '';
    case 'objective':
      return c.objective || '';
    case 'status':
      return c.status;
    case 'impressions':
      return c.impressions;
    case 'clicks':
      return c.clicks;
    case 'spend':
      return c.spendMicros;
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

function readInitialListRange() {
  const q = parseAdsCampaignHashQuery();
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

export function FacebookAdsModule() {
  const [hashQuery, setHashQuery] = useState(() => parseAdsCampaignHashQuery());

  useEffect(() => {
    const onHashChange = () => setHashQuery(parseAdsCampaignHashQuery());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const initial = useMemo(() => readInitialListRange(), []);
  const [preset, setPreset] = useState<DateRangePreset>(initial.preset);
  const [customFrom, setCustomFrom] = useState(initial.customFrom);
  const [customTo, setCustomTo] = useState(initial.customTo);
  const [range, setRange] = useState(() => initial.range);

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
    updateCampaignBrand,
  } = useFacebookAdsData(range.from, range.to);
  const { brands } = useBrands();

  useEffect(() => {
    setRange(resolveDateRange(preset, customFrom, customTo, dataMinDate, dataMaxDate));
  }, [preset, customFrom, customTo, dataMinDate, dataMaxDate]);

  // When returning from detail (campaign cleared), restore range from hash if present.
  useEffect(() => {
    if (hashQuery.campaign) return;
    if (hashQuery.preset) setPreset(hashQuery.preset);
    if (hashQuery.from) setCustomFrom(hashQuery.from);
    if (hashQuery.to) setCustomTo(hashQuery.to);
  }, [hashQuery.campaign, hashQuery.preset, hashQuery.from, hashQuery.to]);

  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [businessFilter, setBusinessFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [brandEditCampaign, setBrandEditCampaign] = useState<FacebookAdsCampaign | null>(null);
  const [brandDraft, setBrandDraft] = useState<string>('__none__');
  const [savingBrand, setSavingBrand] = useState(false);

  const activeBrands = useMemo(
    () => brands.filter((b) => b.isActive).sort((a, b) => a.brandCode.localeCompare(b.brandCode)),
    [brands],
  );

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
    const rows = campaigns.filter((c) => {
      if (accountFilter !== 'all' && c.adAccountId !== accountFilter) return false;
      if (businessFilter !== 'all') {
        const biz = accounts.find((a) => a.adAccountId === c.adAccountId);
        if (!biz || biz.businessKey !== businessFilter) return false;
      }
      if (statusFilter !== 'all' && c.status.toUpperCase() !== statusFilter) return false;
      if (brandFilter === 'none' && c.brandListId) return false;
      if (brandFilter !== 'all' && brandFilter !== 'none' && c.brandListId !== brandFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.campaignName.toLowerCase().includes(q) ||
        (c.accountName || '').toLowerCase().includes(q) ||
        (c.businessName || '').toLowerCase().includes(q) ||
        (c.brandCode || '').toLowerCase().includes(q) ||
        (c.brandDisplayName || '').toLowerCase().includes(q) ||
        c.adAccountId.includes(q)
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
  }, [
    campaigns,
    search,
    accountFilter,
    statusFilter,
    businessFilter,
    brandFilter,
    accounts,
    sortKey,
    sortDir,
  ]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(
        key === 'impressions' || key === 'clicks' || key === 'spend' || key === 'conversions'
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
      const credentialCount =
        typeof result.credentialsCount === 'number' ? result.credentialsCount : undefined;
      const businessCount = result.businesses?.length;
      const biz =
        credentialCount != null
          ? ` · ${credentialCount} Business`
          : businessCount
            ? ` · ${businessCount} Business`
            : '';
      toast.success(`最近 7 日資料已更新${secs}${rows}${biz}`);
    } else toast.error(result.error || '同步失敗');
  };

  const openBrandDialog = (campaign: FacebookAdsCampaign) => {
    setBrandEditCampaign(campaign);
    setBrandDraft(campaign.brandListId || '__none__');
  };

  const saveBrandAssignment = async () => {
    if (!brandEditCampaign) return;
    setSavingBrand(true);
    const nextId = brandDraft === '__none__' ? null : brandDraft;
    const result = await updateCampaignBrand(brandEditCampaign.id, nextId);
    setSavingBrand(false);
    if (!result.ok) {
      toast.error('更新品牌失敗', { description: result.error });
      return;
    }
    toast.success('已更新 Campaign 品牌');
    setBrandEditCampaign(null);
  };

  const openCampaign = (c: FacebookAdsCampaign) => {
    setFacebookAdsCampaignHash({
      campaignKey: c.id,
      preset,
      from: range.from,
      to: range.to,
    });
  };

  if (hashQuery.campaign) {
    return (
      <FacebookAdsCampaignDetail
        campaignKey={hashQuery.campaign}
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
              placeholder="搜尋 campaign / 帳戶…"
              className="pl-8 h-9 text-[13px] bg-white"
            />
          </div>
          <Select value={businessFilter} onValueChange={setBusinessFilter}>
            <SelectTrigger className="w-[180px] h-9 text-[13px] bg-white">
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
            <SelectTrigger className="w-[200px] h-9 text-[13px] bg-white">
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
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[170px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="品牌" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部品牌</SelectItem>
              <SelectItem value="none">未設定品牌</SelectItem>
              {activeBrands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.brandCode}
                  {b.displayName !== b.brandCode ? ` — ${b.displayName}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-[12px] text-muted-foreground">
          Meta Marketing API · {businesses.length || lastSync?.credentialsCount || '—'} Business 憑證
          {businesses.length
            ? `（${businesses.map((b) => b.name).join('、')}）`
            : ''}
          {' · '}報表由每日指標彙總 · 點擊列可開啟 Campaign 詳情
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
                <SortableTh label="帳戶" sortKey="account" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Campaign" sortKey="campaign" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="品牌" sortKey="brand" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Objective" sortKey="objective" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="狀態" sortKey="status" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Impr." sortKey="impressions" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
                <SortableTh label="Spend" sortKey="spend" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
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
                    此日期區間尚無資料。請先到「Facebook Ads 同步」執行完整歷史回填，或按 Refresh recent。
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openCampaign(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openCampaign(c);
                      }
                    }}
                    className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer"
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
                    <td className="px-3 py-2.5 font-medium text-teal-800">{c.campaignName}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openBrandDialog(c);
                        }}
                        className={cn(
                          'text-left text-[12px] rounded px-1.5 py-0.5 -mx-1.5 transition-colors',
                          c.brandListId
                            ? 'text-teal-700 hover:bg-teal-50 font-medium'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                      >
                        {c.brandCode
                          ? `${c.brandCode}${
                              c.brandDisplayName && c.brandDisplayName !== c.brandCode
                                ? ` · ${c.brandDisplayName}`
                                : ''
                            }`
                          : '設定品牌'}
                      </button>
                    </td>
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

      <CrudModal
        isOpen={!!brandEditCampaign}
        onClose={() => !savingBrand && setBrandEditCampaign(null)}
        title="設定 Campaign 品牌"
        size="sm"
      >
        {brandEditCampaign ? (
          <div className="space-y-4">
            <div>
              <div className="text-[12px] text-muted-foreground mb-1">Campaign</div>
              <div className="text-[14px] font-medium">{brandEditCampaign.campaignName}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {brandEditCampaign.accountName || brandEditCampaign.adAccountId}
                {' · '}
                {brandEditCampaign.campaignId}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">
                品牌（brand_list）
              </label>
              <Select value={brandDraft} onValueChange={setBrandDraft}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="選擇品牌" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">未設定</SelectItem>
                  {activeBrands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.brandCode}
                      {b.displayName !== b.brandCode ? ` — ${b.displayName}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="secondary"
                disabled={savingBrand}
                onClick={() => setBrandEditCampaign(null)}
              >
                取消
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={savingBrand}
                onClick={() => void saveBrandAssignment()}
              >
                {savingBrand ? '儲存中…' : '儲存'}
              </Button>
            </div>
          </div>
        ) : null}
      </CrudModal>
    </div>
  );
}
