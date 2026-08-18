import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDurationSeconds } from '@/lib/ga4Traffic';
import type { Ga4CountryRow, Ga4DeviceRow, Ga4PageRow, Ga4SourceRow } from '@/types/ga4';

type SortDir = 'asc' | 'desc';

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
) {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
    return [...rows].sort((a, b) => {
      const cmp = compareSortValues(getValue(a, sortKey), getValue(b, sortKey));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [getValue, rows, sortDir, sortKey]);

  return { sorted, sortKey, sortDir, onSort };
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  sortDir,
  align = 'left',
  onSort,
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  sortDir: SortDir;
  align?: 'left' | 'right';
  onSort: (key: string) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={cn('font-medium px-3 py-2', align === 'right' ? 'text-right' : 'text-left')}>
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

function BreakdownCard({
  title,
  subtitle,
  loading,
  children,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="overflow-auto max-h-[320px]">
        {loading ? (
          <div className="px-3 py-10 text-center text-[12px] text-muted-foreground">載入細項…</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function PagesTable({ rows }: { rows: Ga4PageRow[] }) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows, 'sessions', (row, key) => {
    switch (key) {
      case 'page':
        return row.pageTitle || row.pagePath;
      case 'sessions':
        return row.sessions;
      case 'users':
        return row.users;
      case 'pageviews':
        return row.pageviews;
      case 'bounce':
        return row.bounceRate;
      case 'duration':
        return row.avgSessionDuration;
      default:
        return row.sessions;
    }
  });
  return (
    <table className="w-full text-[12px]">
      <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
        <tr>
          <SortableTh label="Page" sortKey="page" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
          <SortableTh label="Sessions" sortKey="sessions" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
          <SortableTh label="Users" sortKey="users" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
          <SortableTh label="Views" sortKey="pageviews" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
          <SortableTh label="Bounce" sortKey="bounce" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
          <SortableTh label="Duration" sortKey="duration" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 && (
          <tr>
            <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">此期間尚無資料</td>
          </tr>
        )}
        {sorted.map((row) => (
          <tr key={`${row.pagePath}:${row.pageTitle}`} className="border-t border-slate-100">
            <td className="px-3 py-1.5">
              <div className="font-medium truncate max-w-[360px]" title={row.pageTitle}>
                {row.pageTitle || row.pagePath || '(not set)'}
              </div>
              <div className="text-[11px] text-muted-foreground truncate max-w-[360px]">{row.pagePath}</div>
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.sessions.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.users.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.pageviews.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{(row.bounceRate * 100).toFixed(1)}%</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{formatDurationSeconds(row.avgSessionDuration)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DevicesTable({ rows }: { rows: Ga4DeviceRow[] }) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows, 'sessions', (row, key) => {
    if (key === 'device') return row.device;
    if (key === 'users') return row.users;
    if (key === 'pageviews') return row.pageviews;
    return row.sessions;
  });
  return (
    <table className="w-full text-[12px]">
      <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
        <tr>
          <SortableTh label="Device" sortKey="device" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
          <SortableTh label="Sessions" sortKey="sessions" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
          <SortableTh label="Users" sortKey="users" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
          <SortableTh label="Views" sortKey="pageviews" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 && (
          <tr>
            <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">此期間尚無資料</td>
          </tr>
        )}
        {sorted.map((row) => (
          <tr key={row.device} className="border-t border-slate-100">
            <td className="px-3 py-1.5">{row.device}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.sessions.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.users.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.pageviews.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CountriesTable({ rows }: { rows: Ga4CountryRow[] }) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows, 'sessions', (row, key) => {
    if (key === 'country') return row.country;
    if (key === 'users') return row.users;
    if (key === 'pageviews') return row.pageviews;
    return row.sessions;
  });
  return (
    <table className="w-full text-[12px]">
      <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
        <tr>
          <SortableTh label="Country" sortKey="country" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
          <SortableTh label="Sessions" sortKey="sessions" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
          <SortableTh label="Users" sortKey="users" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
          <SortableTh label="Views" sortKey="pageviews" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 && (
          <tr>
            <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">此期間尚無資料</td>
          </tr>
        )}
        {sorted.map((row) => (
          <tr key={row.country} className="border-t border-slate-100">
            <td className="px-3 py-1.5">{row.country}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.sessions.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.users.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.pageviews.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SourcesTable({ rows }: { rows: Ga4SourceRow[] }) {
  const { sorted, sortKey, sortDir, onSort } = useSortedRows(rows, 'sessions', (row, key) => {
    if (key === 'source') return `${row.source} / ${row.medium}`;
    if (key === 'users') return row.users;
    if (key === 'pageviews') return row.pageviews;
    return row.sessions;
  });
  return (
    <table className="w-full text-[12px]">
      <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
        <tr>
          <SortableTh label="Source / Medium" sortKey="source" activeKey={sortKey} sortDir={sortDir} onSort={onSort} />
          <SortableTh label="Sessions" sortKey="sessions" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
          <SortableTh label="Users" sortKey="users" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
          <SortableTh label="Views" sortKey="pageviews" activeKey={sortKey} sortDir={sortDir} align="right" onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 && (
          <tr>
            <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">此期間尚無資料</td>
          </tr>
        )}
        {sorted.map((row) => (
          <tr key={`${row.source}:${row.medium}`} className="border-t border-slate-100">
            <td className="px-3 py-1.5">
              {row.source} <span className="text-muted-foreground">/ {row.medium}</span>
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.sessions.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.users.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.pageviews.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Ga4BreakdownGrid({
  loading,
  pages,
  devices,
  countries,
  sources,
}: {
  loading: boolean;
  pages: Ga4PageRow[];
  devices: Ga4DeviceRow[];
  countries: Ga4CountryRow[];
  sources: Ga4SourceRow[];
}) {
  return (
    <div className="space-y-4">
      <BreakdownCard title="Top pages" subtitle="即時從 GA4 拉取 · 依 Sessions" loading={loading}>
        <PagesTable rows={pages} />
      </BreakdownCard>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <BreakdownCard title="Devices" subtitle="即時從 GA4 拉取" loading={loading}>
          <DevicesTable rows={devices} />
        </BreakdownCard>
        <BreakdownCard title="Countries" subtitle="即時從 GA4 拉取" loading={loading}>
          <CountriesTable rows={countries} />
        </BreakdownCard>
        <BreakdownCard title="Sources" subtitle="即時從 GA4 拉取 · Source / Medium" loading={loading}>
          <SourcesTable rows={sources} />
        </BreakdownCard>
      </div>
    </div>
  );
}
