import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyLocationHash, appHrefClickProps } from '@/lib/appNavigation';
import { financeRowHref } from '@/lib/financeLedgers';
import { openQuotationProjectDetail } from '@/lib/quotationProjectNavigation';
import { buildWebsiteDetailHash } from '@/lib/websiteNavigation';

export const financeHeaderClass =
  'text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3';

export function FinancePageFrame({
  title,
  description,
  lastSyncedAt,
  error,
  loading,
  children,
}: {
  title: string;
  description: string;
  lastSyncedAt?: string | null;
  error?: string | null;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold">{title}</h1>
          <p className="text-[13px] text-muted-foreground mt-1">{description}</p>
          {lastSyncedAt && (
            <p className="text-[11px] text-muted-foreground mt-1">
              最後更新：{new Date(lastSyncedAt).toLocaleString('zh-HK', { hour12: false })}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          載入失敗：{error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-muted-foreground py-12 text-center">載入中…</div>
      ) : (
        children
      )}
    </div>
  );
}

export function FinanceStatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <span className={cn('text-[22px] font-bold block mt-1', accent)}>{value}</span>
    </div>
  );
}

export function FinanceSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1 min-w-[200px] max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-9 pr-4 py-2 text-[13px] border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
      />
    </div>
  );
}

export function FinanceFilterSelect({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
    >
      {children}
    </select>
  );
}

export function FinanceSortableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  sortDir: 'asc' | 'desc';
  onSort: (key: K) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th className={financeHeaderClass} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        aria-label={`依${label}排序`}
      >
        <span>{label}</span>
        <Icon size={12} className={cn(active ? 'text-teal-600' : 'opacity-40')} />
      </button>
    </th>
  );
}

export function FinanceProjectLink({
  name,
  quotationClientProjectId,
  projectStatus,
  websiteId,
}: {
  name: string;
  quotationClientProjectId?: string;
  projectStatus?: string;
  websiteId?: string;
}) {
  const href = financeRowHref({ quotationClientProjectId, projectStatus, websiteId });
  if (!href) {
    return <span className="text-[14px] font-medium">{name}</span>;
  }

  return (
    <button
      type="button"
      className="text-[14px] font-medium text-left text-teal-700 hover:underline"
      {...appHrefClickProps(href, () => {
        if (quotationClientProjectId) {
          openQuotationProjectDetail(quotationClientProjectId, projectStatus);
          return;
        }
        if (websiteId) applyLocationHash(buildWebsiteDetailHash(websiteId));
      })}
    >
      {name}
    </button>
  );
}
