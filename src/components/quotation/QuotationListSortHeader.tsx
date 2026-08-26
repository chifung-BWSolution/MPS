import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PitchingRecord } from '@/data/pitchingData';
import {
  nextQuotationListSort,
  sortQuotationListRecords,
  type QuotationListSortDir,
  type QuotationListSortKey,
} from '@/lib/quotationListSort';

const headerClass =
  'text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3';

export function useQuotationListSort<T extends Pick<
  PitchingRecord,
  'inquiryDate' | 'status' | 'projectTypes' | 'displayName' | 'mainPmName'
>>(records: T[]) {
  const [sortKey, setSortKey] = useState<QuotationListSortKey>('inquiryDate');
  const [sortDir, setSortDir] = useState<QuotationListSortDir>('desc');

  const sorted = useMemo(
    () => sortQuotationListRecords(records, sortKey, sortDir),
    [records, sortKey, sortDir],
  );

  const onSort = (key: QuotationListSortKey) => {
    const next = nextQuotationListSort(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  return { sorted, sortKey, sortDir, onSort };
}

function QuotationListSortableTh({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKey: QuotationListSortKey;
  activeKey: QuotationListSortKey;
  sortDir: QuotationListSortDir;
  onSort: (key: QuotationListSortKey) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th className={headerClass} aria-sort={ariaSort}>
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

export function QuotationClientProjectTableHeaders({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: QuotationListSortKey;
  sortDir: QuotationListSortDir;
  onSort: (key: QuotationListSortKey) => void;
}) {
  return (
    <tr className="border-b border-border bg-muted/30">
      <QuotationListSortableTh
        label="查詢日期"
        sortKey="inquiryDate"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <QuotationListSortableTh
        label="剩餘天數"
        sortKey="remainingDays"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <QuotationListSortableTh
        label="項目類型"
        sortKey="projectTypes"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <QuotationListSortableTh
        label="提案顯示名稱"
        sortKey="displayName"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <QuotationListSortableTh
        label="負責 PM"
        sortKey="mainPm"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <QuotationListSortableTh
        label="狀態"
        sortKey="status"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <th className={headerClass}>操作</th>
    </tr>
  );
}
