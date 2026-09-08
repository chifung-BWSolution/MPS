import { compareQuotationListValues, type QuotationListSortDir } from '@/lib/quotationListSort';
import {
  RECURRING_EXPENSE_FREQUENCIES,
  formatExpenseMoney,
  optionalIsoDate,
  type RecurringExpenseFrequency,
  type RecurringExpenseStatus,
} from '@/lib/quotationExpenses';
import { formatLocalIsoDate, parseLocalIsoDate } from '@/lib/quotationIncomes';

export type RecurringExpenseListRow = {
  id: string;
  relatedType: string;
  relatedId: string;
  projectName: string;
  supplierTypesId: string;
  supplierId: string;
  typeLabel: string;
  supplierLabel: string;
  creditCardId: string;
  creditCardLabel: string;
  billedAmount: number;
  remarks?: string;
  frequency: RecurringExpenseFrequency;
  anchorDate?: string;
  nextOccurrenceDate?: string;
  automationRunCount: number;
  lastGeneratedAt?: string;
  lastGeneratedDueDate?: string;
  status: RecurringExpenseStatus;
  createdAt: string;
  updatedAt: string;
};

export type RecurringExpenseSortKey =
  | 'nextOccurrenceDate'
  | 'projectName'
  | 'typeLabel'
  | 'supplierLabel'
  | 'creditCardLabel'
  | 'billedAmount'
  | 'frequency'
  | 'status'
  | 'automationRunCount'
  | 'remarks';

export type RecurringExpenseSortDir = QuotationListSortDir;

export const RECURRING_EXPENSE_SORT_KEYS: RecurringExpenseSortKey[] = [
  'nextOccurrenceDate',
  'projectName',
  'typeLabel',
  'supplierLabel',
  'creditCardLabel',
  'billedAmount',
  'frequency',
  'status',
  'automationRunCount',
  'remarks',
];

export const DEFAULT_RECURRING_EXPENSE_SORT_KEY: RecurringExpenseSortKey = 'nextOccurrenceDate';
export const DEFAULT_RECURRING_EXPENSE_SORT_DIR: RecurringExpenseSortDir = 'asc';

const STATUS_ORDER: RecurringExpenseStatus[] = ['active', 'paused'];

export function defaultRecurringExpenseSortDir(key: RecurringExpenseSortKey): RecurringExpenseSortDir {
  if (key === 'nextOccurrenceDate') return 'asc';
  if (key === 'billedAmount' || key === 'automationRunCount') return 'desc';
  return 'asc';
}

export function nextRecurringExpenseSort(
  currentKey: RecurringExpenseSortKey,
  currentDir: RecurringExpenseSortDir,
  clickedKey: RecurringExpenseSortKey,
): { key: RecurringExpenseSortKey; dir: RecurringExpenseSortDir } {
  if (clickedKey === currentKey) {
    return { key: currentKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: clickedKey, dir: defaultRecurringExpenseSortDir(clickedKey) };
}

export function getRecurringExpenseSortValue(
  row: RecurringExpenseListRow,
  key: RecurringExpenseSortKey,
): string | number | null {
  switch (key) {
    case 'nextOccurrenceDate':
      return optionalIsoDate(row.nextOccurrenceDate) ?? null;
    case 'projectName':
      return row.projectName.trim() || null;
    case 'typeLabel':
      return row.typeLabel.trim() || null;
    case 'supplierLabel':
      return row.supplierLabel.trim() || null;
    case 'creditCardLabel':
      return row.creditCardLabel.trim() || null;
    case 'billedAmount':
      return row.billedAmount;
    case 'frequency': {
      const index = RECURRING_EXPENSE_FREQUENCIES.indexOf(row.frequency);
      return index < 0 ? null : index;
    }
    case 'status': {
      const index = STATUS_ORDER.indexOf(row.status);
      return index < 0 ? null : index;
    }
    case 'automationRunCount':
      return row.automationRunCount;
    case 'remarks':
      return row.remarks?.trim() || null;
  }
}

export function sortRecurringExpenseRows(
  rows: RecurringExpenseListRow[],
  key: RecurringExpenseSortKey = DEFAULT_RECURRING_EXPENSE_SORT_KEY,
  dir: RecurringExpenseSortDir = DEFAULT_RECURRING_EXPENSE_SORT_DIR,
): RecurringExpenseListRow[] {
  return [...rows].sort((a, b) =>
    compareQuotationListValues(
      getRecurringExpenseSortValue(a, key),
      getRecurringExpenseSortValue(b, key),
      dir,
    ),
  );
}

export function matchesRecurringExpenseSearch(row: RecurringExpenseListRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    row.projectName,
    row.typeLabel,
    row.supplierLabel,
    row.creditCardLabel,
    row.remarks,
    formatExpenseMoney(row.billedAmount),
  ].some((value) => (value ?? '').toLowerCase().includes(q));
}

export function filterRecurringExpenses(
  rows: RecurringExpenseListRow[],
  opts: { search?: string; status?: string; frequency?: string } = {},
): RecurringExpenseListRow[] {
  return rows.filter((row) => {
    if (opts.status && opts.status !== 'all' && row.status !== opts.status) return false;
    if (opts.frequency && opts.frequency !== 'all' && row.frequency !== opts.frequency) return false;
    return matchesRecurringExpenseSearch(row, opts.search ?? '');
  });
}

export function isRecurringDueWithinDays(
  nextOccurrenceDate: string | undefined,
  days: number,
  asOf = formatLocalIsoDate(new Date()),
): boolean {
  const next = optionalIsoDate(nextOccurrenceDate);
  const asOfDate = parseLocalIsoDate(asOf);
  const nextDate = parseLocalIsoDate(next);
  if (!next || !asOfDate || !nextDate) return false;
  const end = new Date(asOfDate);
  end.setDate(end.getDate() + days);
  return nextDate.getTime() <= end.getTime();
}

export function summarizeRecurringExpenses(
  rows: RecurringExpenseListRow[],
  asOf?: string,
) {
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === 'active').length,
    paused: rows.filter((row) => row.status === 'paused').length,
    dueSoon: rows.filter(
      (row) => row.status === 'active' && isRecurringDueWithinDays(row.nextOccurrenceDate, 7, asOf),
    ).length,
  };
}
