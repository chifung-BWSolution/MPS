import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  FacebookAdsAdRow,
  FacebookAdsAdSetRow,
  FacebookAdsPlacementRow,
} from '@/types/facebookAds';

type SortDir = 'asc' | 'desc';

function formatMoneyFromMicros(micros: number): string {
  return (micros / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusBadge(status?: string) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const s = status.toUpperCase();
  const color =
    s === 'ENABLED' || s === 'ACTIVE' || s === 'ELIGIBLE'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'PAUSED' || s === 'PENDING' || s === 'LEARNING'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
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

function adSetSortValue(row: FacebookAdsAdSetRow, key: string) {
  switch (key) {
    case 'name':
      return row.adSetName;
    case 'status':
      return row.status || '';
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.spendMicros;
    case 'conversions':
      return row.conversions;
    default:
      return row.spendMicros;
  }
}

export function FacebookAdSetsTable({
  rows,
  loading,
}: {
  rows: FacebookAdsAdSetRow[];
  loading: boolean;
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows, 'cost', adSetSortValue);
  return (
    <PanelShell
      title="Ad Sets"
      subtitle="即時從 Meta Marketing API 拉取 · 各廣告組合成效"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Ad Set 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <SortableTh label="Ad Set" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-3" />
            <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
            <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Conv." sortKey="conversions" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" className="px-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.adSetId} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium text-foreground line-clamp-2">{r.adSetName}</div>
                {r.optimizationGoal ? (
                  <div className="text-[10px] text-muted-foreground">{r.optimizationGoal}</div>
                ) : null}
              </td>
              <td className="px-2 py-1.5">{statusBadge(r.status)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.spendMicros)}
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

function adSortValue(row: FacebookAdsAdRow, key: string) {
  switch (key) {
    case 'name':
      return row.adName || row.adId;
    case 'status':
      return row.status || '';
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.spendMicros;
    case 'conversions':
      return row.conversions;
    default:
      return row.spendMicros;
  }
}

export function FacebookAdsTable({
  rows,
  loading,
}: {
  rows: FacebookAdsAdRow[];
  loading: boolean;
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows, 'cost', adSortValue);
  return (
    <PanelShell
      title="Ads"
      subtitle="即時從 Meta Marketing API 拉取 · Top 150 by Cost"
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
            <tr key={r.adId} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">{r.adName || r.adId}</div>
                <div className="text-[10px] text-muted-foreground">
                  {r.adSetName || r.adId}
                </div>
              </td>
              <td className="px-2 py-1.5">{statusBadge(r.status)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.spendMicros)}
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

function placementSortValue(row: FacebookAdsPlacementRow, key: string) {
  switch (key) {
    case 'name':
      return row.publisherPlatformLabel || row.publisherPlatform;
    case 'clicks':
      return row.clicks;
    case 'cost':
      return row.spendMicros;
    case 'conversions':
      return row.conversions;
    case 'impressions':
      return row.impressions;
    default:
      return row.spendMicros;
  }
}

export function FacebookPlacementsTable({
  rows,
  loading,
}: {
  rows: FacebookAdsPlacementRow[];
  loading: boolean;
}) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(
    rows,
    'cost',
    placementSortValue,
  );
  return (
    <PanelShell
      title="Placements"
      subtitle="即時從 Meta Marketing API 拉取 · Publisher platform"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Placement 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <SortableTh label="Platform" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} className="px-3" />
            <SortableTh label="Imp." sortKey="impressions" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Clicks" sortKey="clicks" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Cost" sortKey="cost" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
            <SortableTh label="Conv." sortKey="conversions" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" className="px-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.publisherPlatform} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium">{r.publisherPlatformLabel}</div>
                <div className="text-[10px] text-muted-foreground">{r.publisherPlatform}</div>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {r.impressions.toLocaleString()}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.spendMicros)}
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

export function FacebookAdsBreakdownGrid({
  loading,
  adSets,
  ads,
  placements,
}: {
  loading: boolean;
  adSets: FacebookAdsAdSetRow[];
  ads: FacebookAdsAdRow[];
  placements: FacebookAdsPlacementRow[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <FacebookAdSetsTable rows={adSets} loading={loading} />
      <FacebookAdsTable rows={ads} loading={loading} />
      <FacebookPlacementsTable rows={placements} loading={loading} />
    </div>
  );
}
