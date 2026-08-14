import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { formatMoneyFromMicros } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  GoogleAdsAdGroupRow,
  GoogleAdsAdRow,
  GoogleAdsAssetGroupRow,
  GoogleAdsAssetRow,
  GoogleAdsBreakdownChannel,
  GoogleAdsKeywordRow,
  GoogleAdsProductGroupRow,
  GoogleAdsProductRow,
  GoogleAdsSearchTermRow,
} from '@/types/googleAds';

type SortDir = 'asc' | 'desc';

function statusBadge(status?: string) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const s = status.toUpperCase();
  const color =
    s === 'ENABLED' || s === 'ACTIVE' || s === 'ELIGIBLE'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'PAUSED' || s === 'PENDING' || s === 'LEARNING'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : s === 'BEST' || s === 'GOOD' || s === 'EXCELLENT'
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : s === 'LOW'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium ${color}`}>
      {status}
    </span>
  );
}

function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  const aEmpty = a == null || a === '';
  const bEmpty = b == null || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function useSortedRows<T>(
  rows: T[],
  defaultKey: string,
  getValue: (row: T, key: string) => string | number | null | undefined,
  defaultDir: SortDir = 'desc',
) {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const onSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    const sample = rows.length ? getValue(rows[0], key) : null;
    setSortDir(typeof sample === 'number' ? 'desc' : 'asc');
  };

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareSortValues(getValue(a, sortKey), getValue(b, sortKey));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir, getValue]);

  return { sorted, sortKey, sortDir, onSort };
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = 'left',
  className,
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  dir: SortDir;
  onSort: (key: string) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        'font-medium px-2 py-2 whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSort(sortKey)}
            aria-label={`Sort by ${label}`}
            className={cn(
              'inline-flex items-center gap-0.5 max-w-full rounded px-0.5 -mx-0.5 hover:text-foreground transition-colors',
              align === 'right' && 'flex-row-reverse',
              active ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <span className="truncate">{label}</span>
            <Icon
              size={11}
              className={cn('shrink-0 opacity-70', active && 'opacity-100')}
              aria-hidden
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[11px] font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
    </th>
  );
}

function PanelShell({
  title,
  subtitle,
  count,
  loading,
  emptyHint,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  loading: boolean;
  emptyHint: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden flex flex-col min-h-[280px]">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className={cn('flex-1 overflow-auto max-h-[320px]', loading && 'opacity-60')}>
        {count === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
            {loading ? '載入中…' : emptyHint}
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        )}
      </div>
    </div>
  );
}

function adGroupSortValue(row: GoogleAdsAdGroupRow, key: string) {
  switch (key) {
    case 'name':
      return row.adGroupName;
    case 'status':
      return row.status || '';
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.costMicros;
    case 'conversions':
      return row.conversions;
    default:
      return row.costMicros;
  }
}

export function AdsAdGroupsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsAdGroupRow[];
  loading: boolean;
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(
    rows,
    'cost',
    adGroupSortValue,
  );
  return (
    <PanelShell
      title="Ad Groups"
      subtitle="即時從 Google Ads 拉取 · 各廣告群組成效"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Ad Group 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <SortableTh label="Ad Group" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-3" />
            <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Conv." sortKey="conversions" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" className="px-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.adGroupId} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium text-foreground line-clamp-2">{r.adGroupName}</div>
                {r.adGroupType ? (
                  <div className="text-[10px] text-muted-foreground">{r.adGroupType}</div>
                ) : null}
              </td>
              <td className="px-2 py-1.5">{statusBadge(r.status)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

function keywordSortValue(row: GoogleAdsKeywordRow, key: string) {
  switch (key) {
    case 'keyword':
      return row.keywordText;
    case 'match':
      return row.matchType || '';
    case 'qs':
      return row.qualityScore ?? null;
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.costMicros;
    default:
      return row.costMicros;
  }
}

export function AdsKeywordsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsKeywordRow[];
  loading: boolean;
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(
    rows,
    'cost',
    keywordSortValue,
  );
  return (
    <PanelShell
      title="Keywords"
      subtitle="即時從 Google Ads 拉取 · 關鍵字與品質分數"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Keyword 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <SortableTh label="Keyword" sortKey="keyword" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-3" />
            <SortableTh label="Match" sortKey="match" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableTh label="QS" sortKey="qs" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" className="px-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={`${r.adGroupId}:${r.criterionId}`} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">{r.keywordText}</div>
                <div className="text-[10px] text-muted-foreground">{statusBadge(r.status)}</div>
              </td>
              <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                {r.matchType || '—'}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {r.qualityScore != null ? r.qualityScore : '—'}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

function searchTermSortValue(row: GoogleAdsSearchTermRow, key: string) {
  switch (key) {
    case 'term':
      return row.searchTerm;
    case 'keyword':
      return row.keywordText || '';
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.costMicros;
    case 'conversions':
      return row.conversions;
    default:
      return row.costMicros;
  }
}

export function AdsSearchTermsTable({
  rows,
  loading,
  variant = 'search',
}: {
  rows: GoogleAdsSearchTermRow[];
  loading: boolean;
  variant?: 'search' | 'pmax';
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(
    rows,
    'cost',
    searchTermSortValue,
  );
  return (
    <PanelShell
      title="Search Terms"
      subtitle={
        variant === 'pmax'
          ? '即時從 Google Ads 拉取 · Performance Max 搜尋字詞 Top 100 by Cost'
          : '即時從 Google Ads 拉取 · Top 100 by Cost'
      }
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Search Term 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <SortableTh label="Search term" sortKey="term" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-3" />
            {variant === 'search' ? (
              <SortableTh label="Keyword" sortKey="keyword" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            ) : null}
            <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Conv." sortKey="conversions" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" className="px-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => (
            <tr
              key={`${r.adGroupId || 'pmax'}:${r.searchTerm}:${idx}`}
              className="border-t border-slate-100"
            >
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">{r.searchTerm}</div>
                {r.searchTermMatchType ? (
                  <div className="text-[10px] text-muted-foreground">
                    {r.searchTermMatchType}
                  </div>
                ) : null}
              </td>
              {variant === 'search' ? (
                <td className="px-2 py-1.5 text-muted-foreground">
                  <div className="line-clamp-2">{r.keywordText || '—'}</div>
                  {r.matchType ? (
                    <div className="text-[10px]">{r.matchType}</div>
                  ) : null}
                </td>
              ) : null}
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

function assetGroupSortValue(row: GoogleAdsAssetGroupRow, key: string) {
  switch (key) {
    case 'name':
      return row.assetGroupName;
    case 'strength':
      return row.adStrength || '';
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.costMicros;
    case 'conversions':
      return row.conversions;
    default:
      return row.costMicros;
  }
}

export function AdsAssetGroupsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsAssetGroupRow[];
  loading: boolean;
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(
    rows,
    'cost',
    assetGroupSortValue,
  );
  return (
    <PanelShell
      title="Asset Groups"
      subtitle="即時從 Google Ads 拉取 · Performance Max 資產群組"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Asset Group 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <SortableTh label="Asset Group" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-3" />
            <SortableTh label="Strength" sortKey="strength" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Conv." sortKey="conversions" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" className="px-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.assetGroupId} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">{r.assetGroupName}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {statusBadge(r.primaryStatus || r.status)}
                </div>
              </td>
              <td className="px-2 py-1.5">{statusBadge(r.adStrength)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

function adSortValue(row: GoogleAdsAdRow, key: string) {
  switch (key) {
    case 'name':
      return row.adName || row.adType || row.adId;
    case 'status':
      return row.status || '';
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.costMicros;
    case 'conversions':
      return row.conversions;
    default:
      return row.costMicros;
  }
}

export function AdsAdsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsAdRow[];
  loading: boolean;
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows, 'cost', adSortValue);
  return (
    <PanelShell
      title="Ads"
      subtitle="即時從 Google Ads 拉取 · Demand Gen 廣告"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Ad 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <SortableTh label="Ad" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-3" />
            <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Conv." sortKey="conversions" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" className="px-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={`${r.adGroupId}:${r.adId}`} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">
                  {r.adName || r.adType || r.adId}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {[r.adType, r.adGroupName].filter(Boolean).join(' · ') || r.adId}
                </div>
              </td>
              <td className="px-2 py-1.5">{statusBadge(r.status)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

function assetSortValue(row: GoogleAdsAssetRow, key: string) {
  switch (key) {
    case 'name':
      return row.assetName || row.fieldType || row.assetId;
    case 'label':
      return row.performanceLabel || row.status || '';
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.costMicros;
    case 'impressions':
      return row.impressions;
    default:
      return row.costMicros;
  }
}

export function AdsAssetsTable({
  rows,
  loading,
  variant = 'pmax',
}: {
  rows: GoogleAdsAssetRow[];
  loading: boolean;
  variant?: 'pmax' | 'demand_gen';
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(
    rows,
    'cost',
    assetSortValue,
  );
  return (
    <PanelShell
      title="Assets"
      subtitle={
        variant === 'demand_gen'
          ? '即時從 Google Ads 拉取 · Demand Gen 素材成效'
          : '即時從 Google Ads 拉取 · Performance Max 素材成效'
      }
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Asset 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <SortableTh label="Asset" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-3" />
            <SortableTh label="Label" sortKey="label" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Imp." sortKey="impressions" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" className="px-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => (
            <tr
              key={`${r.assetId}:${r.fieldType || ''}:${r.assetGroupId || r.adId || ''}:${idx}`}
              className="border-t border-slate-100"
            >
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">
                  {r.assetName || r.fieldType || r.assetId}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {[r.fieldType || r.assetType, r.assetGroupName]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </td>
              <td className="px-2 py-1.5">
                {statusBadge(r.performanceLabel || r.status)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.impressions.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

function productGroupSortValue(row: GoogleAdsProductGroupRow, key: string) {
  switch (key) {
    case 'name':
      return row.productGroupLabel;
    case 'status':
      return row.status || '';
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.costMicros;
    case 'conversions':
      return row.conversions;
    default:
      return row.costMicros;
  }
}

export function AdsProductGroupsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsProductGroupRow[];
  loading: boolean;
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(
    rows,
    'cost',
    productGroupSortValue,
  );
  return (
    <PanelShell
      title="Product Groups"
      subtitle="即時從 Google Ads 拉取 · Shopping 商品分組"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Product Group 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <SortableTh label="Product group" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-3" />
            <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Conv." sortKey="conversions" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" className="px-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={`${r.adGroupId}:${r.criterionId}`}
              className="border-t border-slate-100"
            >
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">{r.productGroupLabel}</div>
                <div className="text-[10px] text-muted-foreground">
                  {[r.listingGroupType, r.adGroupName].filter(Boolean).join(' · ')}
                </div>
              </td>
              <td className="px-2 py-1.5">{statusBadge(r.status)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

function productSortValue(row: GoogleAdsProductRow, key: string) {
  switch (key) {
    case 'name':
      return row.productTitle || row.productItemId;
    case 'brand':
      return row.productBrand || '';
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.costMicros;
    case 'conversions':
      return row.conversions;
    default:
      return row.costMicros;
  }
}

export function AdsProductsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsProductRow[];
  loading: boolean;
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(
    rows,
    'cost',
    productSortValue,
  );
  return (
    <PanelShell
      title="Products"
      subtitle="即時從 Google Ads 拉取 · Top 100 by Cost"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Product 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <SortableTh label="Product" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-3" />
            <SortableTh label="Brand" sortKey="brand" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Conv." sortKey="conversions" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" className="px-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.productItemId} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">
                  {r.productTitle || r.productItemId}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {r.productItemId}
                </div>
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                <div className="line-clamp-2">{r.productBrand || '—'}</div>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

export function AdsChannelBreakdownGrid({
  channel,
  loading,
  adGroups,
  keywords,
  searchTerms,
  assetGroups,
  ads,
  assets,
  productGroups,
  products,
}: {
  channel: GoogleAdsBreakdownChannel;
  loading: boolean;
  adGroups: GoogleAdsAdGroupRow[];
  keywords: GoogleAdsKeywordRow[];
  searchTerms: GoogleAdsSearchTermRow[];
  assetGroups: GoogleAdsAssetGroupRow[];
  ads: GoogleAdsAdRow[];
  assets: GoogleAdsAssetRow[];
  productGroups: GoogleAdsProductGroupRow[];
  products: GoogleAdsProductRow[];
}) {
  if (channel === 'SEARCH') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdsAdGroupsTable rows={adGroups} loading={loading} />
        <AdsKeywordsTable rows={keywords} loading={loading} />
        <AdsSearchTermsTable rows={searchTerms} loading={loading} variant="search" />
      </div>
    );
  }

  if (channel === 'DEMAND_GEN') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdsAdGroupsTable rows={adGroups} loading={loading} />
        <AdsAdsTable rows={ads} loading={loading} />
        <AdsAssetsTable rows={assets} loading={loading} variant="demand_gen" />
      </div>
    );
  }

  if (channel === 'SHOPPING') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdsAdGroupsTable rows={adGroups} loading={loading} />
        <AdsProductGroupsTable rows={productGroups} loading={loading} />
        <AdsProductsTable rows={products} loading={loading} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <AdsAssetGroupsTable rows={assetGroups} loading={loading} />
      <AdsAssetsTable rows={assets} loading={loading} variant="pmax" />
      <AdsSearchTermsTable rows={searchTerms} loading={loading} variant="pmax" />
    </div>
  );
}
