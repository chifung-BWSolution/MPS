import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { fetchUserStaffIds } from '@/components/day-report/userStaffLookup';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { resolveDateRange, useGoogleAdsData } from '@/hooks/useGoogleAdsData';
import { useFacebookAdsData } from '@/hooks/useFacebookAdsData';
import { useBrands } from '@/hooks/useBrands';
import { useAdsCampaignTags } from '@/hooks/useAdsTags';
import { useActiveStaffOptions } from '@/hooks/useActiveStaffOptions';
import { useFacebookAdsChangeHistoryStaff } from '@/hooks/useFacebookAdsChangeHistoryStaff';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { invokeFacebookAdsCampaignChangeHistory } from '@/lib/facebookAdsApi';
import { invokeGoogleAdsCampaignChangeHistory } from '@/lib/googleAdsApi';
import { cn } from '@/lib/utils';
import type { Brand } from '@/types/app';
import type { AdsTag } from '@/types/adsTags';
import type { FacebookAdsAccount, FacebookAdsCampaign } from '@/types/facebookAds';
import type {
  DateRangePreset,
  GoogleAdsCampaign,
  GoogleAdsChangeHistoryCategory,
  GoogleAdsChangeHistorySession,
} from '@/types/googleAds';

type Platform = 'google' | 'facebook';
type PlatformFilter = 'all' | Platform;
type CategoryFilter = 'all' | GoogleAdsChangeHistoryCategory;

type HistoryCampaign = {
  key: string;
  platform: Platform;
  accountId: string;
  campaignId: string;
  accountName: string;
  campaignName: string;
  brandIds: string[];
  status: string;
  tagIds: string[];
  searchText: string;
};

type HistoryEntry = {
  rowKey: string;
  platform: Platform;
  activityKey: string;
  accountName: string;
  campaignName: string;
  userEmail: string;
  clientType: string;
  changeDateTime: string;
  adGroupName: string;
  assetGroupName: string;
  lines: GoogleAdsChangeHistorySession['lines'];
};

const CLEAR_STAFF = '__none__';
const FETCH_CONCURRENCY = 4;
const FETCH_DEBOUNCE_MS = 400;

const FILTERS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: '所有變更' },
  { id: 'budget', label: '廣告預算' },
  { id: 'bidding', label: '競價' },
  { id: 'audience', label: '目標對象' },
  { id: 'location', label: '位置' },
  { id: 'language', label: '語言' },
  { id: 'conversions', label: '轉換次數' },
  { id: 'ads', label: '廣告元素' },
  { id: 'status', label: '狀態' },
  { id: 'feeds', label: '資訊提供' },
  { id: 'other', label: '其他' },
];

const CLIENT_LABELS: Record<string, string> = {
  GOOGLE_ADS_WEB_CLIENT: '網絡用戶端（手動）',
  GOOGLE_ADS_AUTOMATED_RULE: '自動規則',
  GOOGLE_ADS_SCRIPTS: '指令碼',
  GOOGLE_ADS_BULK_UPLOAD: '大量上傳',
  GOOGLE_ADS_API: 'Google Ads API',
  GOOGLE_ADS_EDITOR: 'Google Ads 編輯器',
  GOOGLE_ADS_MOBILE_APP: '流動應用程式',
  GOOGLE_ADS_RECOMMENDATIONS: '自動套用建議',
  GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION: '自動套用建議',
  SEARCH_ADS_360_SYNC: 'Search Ads 360',
  SEARCH_ADS_360_POST: 'Search Ads 360',
  INTERNAL_TOOL: '內部工具',
  OTHER: '其他',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

function earliestDate(a: string | null, b: string | null) {
  if (a && b) return a < b ? a : b;
  return a || b;
}

function latestDate(a: string | null, b: string | null) {
  if (a && b) return a > b ? a : b;
  return a || b;
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, 'zh-Hant', { sensitivity: 'base', numeric: true });
}

function platformLabel(platform: Platform) {
  return platform === 'google' ? 'Google Ads' : 'Facebook Ads';
}

function toolLabel(platform: Platform, clientType: string) {
  if (!clientType) return '—';
  if (platform === 'google') return CLIENT_LABELS[clientType] || clientType.replace(/_/g, ' ');
  return clientType;
}

function formatWhen(value: string) {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value.replace('T', ' ').slice(0, 19);
  return d.toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toEntry(campaign: HistoryCampaign, session: GoogleAdsChangeHistorySession): HistoryEntry {
  return {
    rowKey: `${campaign.key}:${session.id}`,
    platform: campaign.platform,
    activityKey: session.id,
    accountName: campaign.accountName,
    campaignName: campaign.campaignName,
    userEmail: session.userEmail,
    clientType: session.clientType,
    changeDateTime: session.changeDateTime,
    adGroupName: session.adGroupName,
    assetGroupName: session.assetGroupName,
    lines: session.lines,
  };
}

async function loadCampaignHistory(
  campaign: HistoryCampaign,
  from: string,
  to: string,
  signal: AbortSignal,
): Promise<HistoryEntry[]> {
  if (campaign.platform === 'google') {
    const res = await invokeGoogleAdsCampaignChangeHistory(
      {
        customerId: campaign.accountId,
        campaignId: campaign.campaignId,
        from,
        to,
      },
      signal,
    );
    return (res.sessions ?? []).map((session) => toEntry(campaign, session));
  }
  const res = await invokeFacebookAdsCampaignChangeHistory(
    {
      adAccountId: campaign.accountId,
      campaignId: campaign.campaignId,
      from,
      to,
    },
    signal,
  );
  return (res.sessions ?? []).map((session) => toEntry(campaign, session));
}

function sortEntries(entries: HistoryEntry[]) {
  return [...entries].sort((a, b) => b.changeDateTime.localeCompare(a.changeDateTime));
}

function DateRangeFields({
  preset,
  customFrom,
  customTo,
  rangeFrom,
  rangeTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}: {
  preset: DateRangePreset;
  customFrom: string;
  customTo: string;
  rangeFrom: string;
  rangeTo: string;
  onPresetChange: (preset: DateRangePreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
}) {
  return (
    <>
      <Select value={preset} onValueChange={(value) => onPresetChange(value as DateRangePreset)}>
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
            onChange={(e) => onCustomFromChange(e.target.value)}
          />
          <span className="text-[12px] text-muted-foreground">至</span>
          <Input
            type="date"
            className="w-[150px] h-9 text-[13px] bg-white"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
          />
        </>
      ) : (
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {rangeFrom} → {rangeTo}
        </span>
      )}
    </>
  );
}

export function AdsChangeHistoryModule() {
  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const [customFrom, setCustomFrom] = useState(() => daysAgoIso(30));
  const [customTo, setCustomTo] = useState(() => todayIso());
  const [range, setRange] = useState(() => resolveDateRange('30d', daysAgoIso(30), todayIso()));
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [reloadToken, setReloadToken] = useState(0);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [historyErrors, setHistoryErrors] = useState<string[]>([]);
  const requestIdRef = useRef(0);

  const google = useGoogleAdsData(range.from, range.to);
  const facebook = useFacebookAdsData(range.from, range.to);
  const { brands } = useBrands();
  const googleTags = useAdsCampaignTags('google');
  const facebookTags = useAdsCampaignTags('facebook');

  const dataMinDate = earliestDate(google.dataMinDate, facebook.dataMinDate);
  const dataMaxDate = latestDate(google.dataMaxDate, facebook.dataMaxDate);

  useEffect(() => {
    setRange(resolveDateRange(preset, customFrom, customTo, dataMinDate, dataMaxDate));
  }, [preset, customFrom, customTo, dataMinDate, dataMaxDate]);

  const activeBrands = useMemo(
    () => brands.filter((brand) => brand.isActive).sort((a, b) => a.brandCode.localeCompare(b.brandCode)),
    [brands],
  );
  const brandById = useMemo(() => new Map(brands.map((brand) => [brand.id, brand])), [brands]);
  const activeAdsTags = useMemo(
    () => googleTags.tags.filter((tag) => tag.isActive),
    [googleTags.tags],
  );
  const facebookAccountById = useMemo(
    () => new Map(facebook.accounts.map((account) => [account.adAccountId, account])),
    [facebook.accounts],
  );

  const campaigns = useMemo(
    () => [
      ...google.campaigns.map((campaign) => toGoogleCampaign(campaign, brandById, googleTags.tagsByCampaignId)),
      ...facebook.campaigns.map((campaign) =>
        toFacebookCampaign(campaign, facebookAccountById, facebookTags.tagsByCampaignId),
      ),
    ],
    [
      google.campaigns,
      facebook.campaigns,
      brandById,
      facebookAccountById,
      googleTags.tagsByCampaignId,
      facebookTags.tagsByCampaignId,
    ],
  );

  const accountOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    if (platformFilter !== 'facebook') {
      for (const account of google.accounts.filter((item) => !item.isManager)) {
        const name = account.descriptiveName || account.customerId;
        options.push({
          value: `google:${account.customerId}`,
          label: platformFilter === 'all' ? `Google · ${name}` : name,
        });
      }
    }
    if (platformFilter !== 'google') {
      for (const account of facebook.accounts) {
        const name = account.accountName || account.adAccountId;
        options.push({
          value: `facebook:${account.adAccountId}`,
          label: platformFilter === 'all' ? `Facebook · ${name}` : name,
        });
      }
    }
    return options.sort((a, b) => compareText(a.label, b.label));
  }, [platformFilter, google.accounts, facebook.accounts]);

  useEffect(() => {
    if (accountFilter === 'all') return;
    if (!accountOptions.some((option) => option.value === accountFilter)) setAccountFilter('all');
  }, [accountFilter, accountOptions]);

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      if (platformFilter !== 'all' && campaign.platform !== platformFilter) return false;
      if (brandFilter === 'none' && campaign.brandIds.length > 0) return false;
      if (brandFilter !== 'all' && brandFilter !== 'none' && !campaign.brandIds.includes(brandFilter)) return false;
      if (accountFilter !== 'all' && `${campaign.platform}:${campaign.accountId}` !== accountFilter) return false;
      if (statusFilter !== 'all' && campaign.status.toUpperCase() !== statusFilter) return false;
      if (tagFilter === 'none' && campaign.tagIds.length > 0) return false;
      if (tagFilter !== 'all' && tagFilter !== 'none' && !campaign.tagIds.includes(tagFilter)) return false;
      if (!q) return true;
      return campaign.searchText.includes(q);
    });
  }, [campaigns, search, platformFilter, brandFilter, accountFilter, statusFilter, tagFilter]);

  const targetSignature = useMemo(
    () => filteredCampaigns.map((campaign) => campaign.key).sort().join('\n'),
    [filteredCampaigns],
  );

  useEffect(() => {
    const targets = filteredCampaigns;
    const requestId = ++requestIdRef.current;
    if (!targets.length) {
      setEntries([]);
      setHistoryErrors([]);
      setHistoryLoading(false);
      setProgress({ done: 0, total: 0 });
      return;
    }

    setHistoryLoading(true);
    setProgress({ done: 0, total: targets.length });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        const collected: HistoryEntry[] = [];
        const failed: string[] = [];
        let done = 0;
        const queue = [...targets];
        setEntries([]);
        setHistoryErrors([]);

        const worker = async () => {
          while (!controller.signal.aborted) {
            const campaign = queue.shift();
            if (!campaign) return;
            try {
              const rows = await loadCampaignHistory(campaign, range.from, range.to, controller.signal);
              collected.push(...rows);
            } catch (error) {
              if (error instanceof DOMException && error.name === 'AbortError') return;
              failed.push(
                `${platformLabel(campaign.platform)} · ${campaign.campaignName}：${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
            done += 1;
            if (requestId !== requestIdRef.current) return;
            setProgress({ done, total: targets.length });
            setEntries(sortEntries(collected));
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(FETCH_CONCURRENCY, queue.length) }, () => worker()),
        );
        if (requestId !== requestIdRef.current) return;
        setHistoryErrors(failed);
        setEntries(sortEntries(collected));
        setHistoryLoading(false);
      })();
    }, FETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [targetSignature, range.from, range.to, reloadToken, filteredCampaigns]);

  const visible = useMemo(
    () =>
      categoryFilter === 'all'
        ? entries
        : entries.filter((entry) => entry.lines.some((line) => line.category === categoryFilter)),
    [entries, categoryFilter],
  );
  const facebookActivityKeys = useMemo(
    () => entries.filter((entry) => entry.platform === 'facebook').map((entry) => entry.activityKey),
    [entries],
  );
  const staffAssignments = useFacebookAdsChangeHistoryStaff(facebookActivityKeys);
  const assignedIds = useMemo(() => Object.values(staffAssignments.byKey), [staffAssignments.byKey]);
  const { options: activeStaff } = useActiveStaffOptions(assignedIds);
  const [systemStaffIds, setSystemStaffIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchUserStaffIds().then((ids) => {
      if (!cancelled) setSystemStaffIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const staffOptions = useMemo(() => {
    const assigned = new Set(assignedIds);
    return [...activeStaff]
      .filter((row) => systemStaffIds?.has(row.value) || assigned.has(row.value))
      .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }))
      .map(({ value, label, keywords }) => ({ value, label, keywords }));
  }, [activeStaff, assignedIds, systemStaffIds]);
  const staffSelectOptions = useMemo(
    () => [{ value: CLEAR_STAFF, label: '—' }, ...staffOptions],
    [staffOptions],
  );

  const googleChangeCount = visible.filter((entry) => entry.platform === 'google').length;
  const facebookChangeCount = visible.filter((entry) => entry.platform === 'facebook').length;
  const catalogsLoading = (google.loading || facebook.loading) && campaigns.length === 0;
  const listError = [google.error, facebook.error].filter(Boolean).join(' · ');

  return (
    <div className="space-y-0">
      <div className="sticky top-[calc(48px+var(--app-banner-h))] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 min-w-[280px]">
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">變更記錄</div>
              <div className="text-[18px] font-bold">{visible.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Campaigns</div>
              <div className="text-[18px] font-bold">{filteredCampaigns.length}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Google Ads</div>
              <div className="text-[18px] font-bold">{googleChangeCount}</div>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Facebook Ads</div>
              <div className="text-[18px] font-bold">{facebookChangeCount}</div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void google.refresh();
              void facebook.refresh();
              setReloadToken((token) => token + 1);
            }}
            disabled={catalogsLoading || historyLoading}
          >
            重新載入
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFields
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            rangeFrom={range.from}
            rangeTo={range.to}
            onPresetChange={setPreset}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 campaign / 帳戶 / 品牌…"
              className="pl-8 h-9 text-[13px] bg-white"
            />
          </div>
          <Select value={platformFilter} onValueChange={(value) => setPlatformFilter(value as PlatformFilter)}>
            <SelectTrigger className="w-[150px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="平台" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平台</SelectItem>
              <SelectItem value="google">Google Ads</SelectItem>
              <SelectItem value="facebook">Facebook Ads</SelectItem>
            </SelectContent>
          </Select>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[170px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="品牌" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部品牌</SelectItem>
              <SelectItem value="none">未設定品牌</SelectItem>
              {activeBrands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.brandCode}
                  {brand.displayName !== brand.brandCode ? ` — ${brand.displayName}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[220px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="帳戶" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部帳戶</SelectItem>
              {accountOptions.map((account) => (
                <SelectItem key={account.value} value={account.value}>
                  {account.label}
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
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-[160px] h-9 text-[13px] bg-white">
              <SelectValue placeholder="標籤" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部標籤</SelectItem>
              <SelectItem value="none">未設定標籤</SelectItem>
              {activeAdsTags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-[12px] text-muted-foreground">
          變更記錄與 Campaign 詳情同一來源。Google Ads 欄位明細只保留近 30 日，Facebook Ads 活動近 90 日。
          {dataMinDate && dataMaxDate ? ` 已同步資料 ${dataMinDate} ~ ${dataMaxDate}。` : ''}
          {historyLoading && progress.total > 0 ? (
            <span className="ml-1 tabular-nums">
              載入中 {progress.done}/{progress.total} 個 Campaign
            </span>
          ) : null}
          {listError ? <span className="text-red-600 ml-2">{listError}</span> : null}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setCategoryFilter(chip.id)}
              className={cn(
                'px-2.5 py-1 rounded-full border text-[12px]',
                categoryFilter === chip.id
                  ? 'border-teal-600 bg-teal-50 text-teal-800'
                  : 'border-slate-200 bg-white text-muted-foreground hover:text-foreground',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        {historyErrors.length > 0 ? (
          <div className="text-[12px] text-red-600 space-y-1">
            {historyErrors.slice(0, 3).map((message) => (
              <div key={message}>{message}</div>
            ))}
            {historyErrors.length > 3 ? <div>另有 {historyErrors.length - 3} 個 Campaign 載入失敗</div> : null}
          </div>
        ) : null}
        {staffAssignments.error ? <div className="text-[12px] text-red-600">{staffAssignments.error}</div> : null}
        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[rgba(13,26,45,0.08)] bg-slate-50/80 text-left text-[12px] text-muted-foreground">
                  <th className="px-3 py-2 font-medium whitespace-nowrap">平台</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">用戶 / 日期和時間</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">負責同事</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">工具</th>
                  <th className="px-3 py-2 font-medium min-w-[240px]">變更</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">帳戶</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">廣告系列</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">廣告群組</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">廣告元素群組</th>
                </tr>
              </thead>
              <tbody>
                {catalogsLoading || (historyLoading && visible.length === 0) ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                      {catalogsLoading
                        ? '載入 Campaign…'
                        : `載入變更記錄… ${progress.done}/${progress.total}`}
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                      {filteredCampaigns.length === 0 ? '沒有符合篩選的 Campaign' : '此區間沒有變更記錄'}
                    </td>
                  </tr>
                ) : (
                  visible.map((entry) => {
                    const lines =
                      categoryFilter === 'all'
                        ? entry.lines
                        : entry.lines.filter((line) => line.category === categoryFilter);
                    return (
                      <tr key={entry.rowKey} className="border-b border-[rgba(13,26,45,0.06)] align-top last:border-0">
                        <td className="px-3 py-2.5 whitespace-nowrap">{platformLabel(entry.platform)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div>{entry.userEmail || '—'}</div>
                          <div className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
                            {formatWhen(entry.changeDateTime)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 min-w-[160px]">
                          {entry.platform === 'facebook' ? (
                            <SearchableSelect
                              value={staffAssignments.byKey[entry.activityKey] || ''}
                              onValueChange={(value) => {
                                void staffAssignments.setStaff(
                                  entry.activityKey,
                                  value === CLEAR_STAFF ? '' : value,
                                );
                              }}
                              options={staffSelectOptions}
                              placeholder="選擇同事"
                              searchPlaceholder="搜尋同事"
                              emptyText="沒有在職員工"
                              disabled={staffAssignments.savingKey === entry.activityKey}
                              className="h-8 min-w-[148px] text-[12px]"
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{toolLabel(entry.platform, entry.clientType)}</td>
                        <td className="px-3 py-2.5">
                          <ul className="space-y-1">
                            {lines.map((line, index) => (
                              <li key={`${entry.rowKey}:${index}`} className="flex items-start gap-1.5 leading-snug">
                                <Check size={14} className="mt-0.5 shrink-0 text-slate-500" />
                                <span>{line.text}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-3 py-2.5">{entry.accountName || '—'}</td>
                        <td className="px-3 py-2.5 text-teal-700">{entry.campaignName || '—'}</td>
                        <td className="px-3 py-2.5">{entry.adGroupName || '—'}</td>
                        <td className="px-3 py-2.5">{entry.assetGroupName || '—'}</td>
                      </tr>
                    );
                  })
                )}
                {historyLoading && visible.length > 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-3 text-center text-[12px] text-muted-foreground tabular-nums">
                      載入中 {progress.done}/{progress.total} 個 Campaign
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function toGoogleCampaign(
  campaign: GoogleAdsCampaign,
  brandById: Map<string, Brand>,
  tagsByCampaignId: Map<string, AdsTag[]>,
): HistoryCampaign {
  const tags = tagsByCampaignId.get(campaign.id) ?? [];
  const searchText = [
    campaign.campaignName,
    campaign.accountName,
    campaign.customerId,
    campaign.advertisingChannelType,
    ...(campaign.objectives ?? []),
    ...tags.map((tag) => tag.name),
    ...campaign.brandListIds.flatMap((id) => {
      const brand = brandById.get(id);
      return brand ? [brand.brandCode, brand.displayName] : [];
    }),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return {
    key: `google:${campaign.customerId}:${campaign.campaignId}`,
    platform: 'google',
    accountId: campaign.customerId,
    campaignId: campaign.campaignId,
    accountName: campaign.accountName || campaign.customerId,
    campaignName: campaign.campaignName,
    brandIds: campaign.brandListIds,
    status: campaign.status,
    tagIds: tags.map((tag) => tag.id),
    searchText,
  };
}

function toFacebookCampaign(
  campaign: FacebookAdsCampaign,
  accountById: Map<string, FacebookAdsAccount>,
  tagsByCampaignId: Map<string, AdsTag[]>,
): HistoryCampaign {
  const tags = tagsByCampaignId.get(campaign.id) ?? [];
  const account = accountById.get(campaign.adAccountId);
  const searchText = [
    campaign.campaignName,
    campaign.accountName || account?.accountName,
    campaign.adAccountId,
    campaign.brandCode,
    campaign.brandDisplayName,
    campaign.objective,
    ...tags.map((tag) => tag.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return {
    key: `facebook:${campaign.adAccountId}:${campaign.campaignId}`,
    platform: 'facebook',
    accountId: campaign.adAccountId,
    campaignId: campaign.campaignId,
    accountName: campaign.accountName || account?.accountName || campaign.adAccountId,
    campaignName: campaign.campaignName,
    brandIds: campaign.brandListId ? [campaign.brandListId] : [],
    status: campaign.status,
    tagIds: tags.map((tag) => tag.id),
    searchText,
  };
}
