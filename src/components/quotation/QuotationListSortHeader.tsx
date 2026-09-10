import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatQuotationListMoney,
  quotationListGpClass,
} from '@/lib/quotationListMoney';
import {
  nextQuotationListSort,
  sortQuotationListRecords,
  type QuotationListSortable,
  type QuotationListSortDir,
  type QuotationListSortKey,
} from '@/lib/quotationListSort';

const headerClass =
  'text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 whitespace-nowrap';

export type QuotationListMoneyColumns = 'estimated' | 'actual';

export const QUOTATION_LIST_MONEY_LABELS: Record<
  QuotationListMoneyColumns,
  { income: string; expense: string; gp: string }
> = {
  estimated: { income: '預計收入', expense: '預計支出', gp: '預計 GP' },
  actual: { income: '總收入', expense: '總支出', gp: '實際 GP' },
};

export function useQuotationListSort<T extends QuotationListSortable>(records: T[]) {
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
  align = 'left',
}: {
  label: string;
  sortKey: QuotationListSortKey;
  activeKey: QuotationListSortKey;
  sortDir: QuotationListSortDir;
  onSort: (key: QuotationListSortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th className={cn(headerClass, align === 'right' && 'text-right')} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors',
          align === 'right' && 'justify-end w-full',
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

export function QuotationListMoneyCells({
  income,
  expense,
  gp,
}: {
  income: number | null;
  expense: number | null;
  gp: number | null;
}) {
  return (
    <>
      <td className="px-4 py-3 text-[13px] text-right whitespace-nowrap">
        <MoneyValue value={income} />
      </td>
      <td className="px-4 py-3 text-[13px] text-right whitespace-nowrap">
        <MoneyValue value={expense} />
      </td>
      <td className="px-4 py-3 text-[13px] text-right whitespace-nowrap">
        <MoneyValue value={gp} tone="gp" />
      </td>
    </>
  );
}

function MoneyValue({
  value,
  tone,
}: {
  value: number | null;
  tone?: 'gp';
}) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('tabular-nums', tone === 'gp' && quotationListGpClass(value))}>
      {formatQuotationListMoney(value)}
    </span>
  );
}

export function QuotationClientProjectTableHeaders({
  sortKey,
  sortDir,
  onSort,
  moneyColumns,
  remainingDaysLabel = '剩餘天數',
}: {
  sortKey: QuotationListSortKey;
  sortDir: QuotationListSortDir;
  onSort: (key: QuotationListSortKey) => void;
  moneyColumns: QuotationListMoneyColumns;
  remainingDaysLabel?: string;
}) {
  const labels = QUOTATION_LIST_MONEY_LABELS[moneyColumns];

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
        label={remainingDaysLabel}
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
        label="相關客戶"
        sortKey="clientName"
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
        label={labels.income}
        sortKey="income"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        align="right"
      />
      <QuotationListSortableTh
        label={labels.expense}
        sortKey="expense"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        align="right"
      />
      <QuotationListSortableTh
        label={labels.gp}
        sortKey="gp"
        activeKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        align="right"
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
