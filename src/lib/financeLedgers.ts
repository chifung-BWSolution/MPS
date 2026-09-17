import { compareQuotationListValues, type QuotationListSortDir } from '@/lib/quotationListSort';
import {
  EXPENSE_PAYMENT_STATUS_LABELS,
  formatExpenseMoney,
  optionalIsoDate,
  type ExpensePaymentStatus,
} from '@/lib/quotationExpenses';
import {
  formatIncomeMoney,
  formatLocalIsoDate,
  INCOME_PAYMENT_STATUS_LABELS,
  parseLocalIsoDate,
  type IncomePaymentStatus,
} from '@/lib/quotationIncomes';
import { buildQuotationProjectHref } from '@/lib/quotationProjectNavigation';
import { buildWebsiteDetailHref } from '@/lib/websiteNavigation';
import { DEFAULT_CURRENCY, type SystemCurrency } from '@/lib/currency';

export type FinanceLedgerKind = 'income' | 'expense';
export type FinanceLedgerSortDir = QuotationListSortDir;

export type FinanceIncomeRow = {
  kind: 'income';
  id: string;
  projectName: string;
  clientName: string;
  quotationClientProjectId?: string;
  projectStatus?: string;
  typeLabel: string;
  installmentNumber?: number;
  currency: SystemCurrency;
  billedAmount: number;
  paymentAmount: number;
  outstanding: number;
  badDebt: number;
  dueDate?: string;
  paymentDate?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  remarks?: string;
  createdAt: string;
};

export type FinanceExpenseRow = {
  kind: 'expense';
  id: string;
  projectName: string;
  clientName?: string;
  quotationClientProjectId?: string;
  websiteId?: string;
  projectStatus?: string;
  typeLabel: string;
  supplierLabel: string;
  installmentNumber?: number;
  currency: SystemCurrency;
  billedAmount: number;
  paymentAmount: number;
  outstanding: number;
  badDebt: number;
  dueDate?: string;
  paymentDate?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  creditCardLabel?: string;
  remarks?: string;
  createdAt: string;
};

export type FinanceBadDebtRow = {
  kind: FinanceLedgerKind;
  id: string;
  projectName: string;
  partyLabel: string;
  typeLabel: string;
  billedAmount: number;
  outstanding: number;
  badDebt: number;
  dueDate?: string;
  remarks?: string;
  quotationClientProjectId?: string;
  websiteId?: string;
  projectStatus?: string;
};

export const DUE_SOON_WINDOWS = ['overdue', '7', '30', 'all'] as const;
export type DueSoonWindow = (typeof DUE_SOON_WINDOWS)[number];
export const DEFAULT_DUE_SOON_WINDOW: DueSoonWindow = '30';

export const DUE_SOON_WINDOW_LABELS: Record<DueSoonWindow, string> = {
  overdue: '已逾期',
  '7': '7 日內',
  '30': '30 日內',
  all: '全部有到期日',
};

export const BAD_DEBT_KIND_FILTERS = ['all', 'income', 'expense'] as const;
export type BadDebtKindFilter = (typeof BAD_DEBT_KIND_FILTERS)[number];

export const BAD_DEBT_KIND_LABELS: Record<FinanceLedgerKind, string> = {
  income: '收入',
  expense: '支出',
};

export type DueSoonSortKey =
  | 'dueDate'
  | 'remainingDays'
  | 'projectName'
  | 'typeLabel'
  | 'supplierLabel'
  | 'billedAmount'
  | 'paymentAmount'
  | 'outstanding'
  | 'paymentStatus'
  | 'remarks';

export type ReceivableSortKey =
  | 'dueDate'
  | 'projectName'
  | 'clientName'
  | 'typeLabel'
  | 'installmentNumber'
  | 'billedAmount'
  | 'paymentAmount'
  | 'outstanding'
  | 'paymentStatus'
  | 'remarks';

export type PayableSortKey = DueSoonSortKey;
export type BadDebtSortKey =
  | 'kind'
  | 'dueDate'
  | 'projectName'
  | 'partyLabel'
  | 'typeLabel'
  | 'billedAmount'
  | 'badDebt'
  | 'outstanding'
  | 'remarks';

export const DEFAULT_DUE_SOON_SORT_KEY: DueSoonSortKey = 'dueDate';
export const DEFAULT_RECEIVABLE_SORT_KEY: ReceivableSortKey = 'dueDate';
export const DEFAULT_PAYABLE_SORT_KEY: PayableSortKey = 'dueDate';
export const DEFAULT_BAD_DEBT_SORT_KEY: BadDebtSortKey = 'badDebt';
export const DEFAULT_LEDGER_SORT_DIR: FinanceLedgerSortDir = 'asc';
export const DEFAULT_BAD_DEBT_SORT_DIR: FinanceLedgerSortDir = 'desc';

function todayIso(now = new Date()): string {
  return formatLocalIsoDate(now);
}

export function isOutstandingAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

export function daysUntilDue(dueDate: string | undefined, asOf = todayIso()): number | null {
  const due = parseLocalIsoDate(optionalIsoDate(dueDate));
  const asOfDate = parseLocalIsoDate(optionalIsoDate(asOf) ?? asOf);
  if (!due || !asOfDate) return null;
  return Math.round((due.getTime() - asOfDate.getTime()) / 86_400_000);
}

export function isOverdueDueDate(dueDate: string | undefined, asOf = todayIso()): boolean {
  const days = daysUntilDue(dueDate, asOf);
  return days != null && days < 0;
}

export function matchesDueSoonWindow(
  dueDate: string | undefined,
  outstanding: number,
  window: DueSoonWindow,
  asOf = todayIso(),
): boolean {
  if (!isOutstandingAmount(outstanding)) return false;
  const days = daysUntilDue(dueDate, asOf);
  if (days == null) return false;
  if (window === 'all') return true;
  if (window === 'overdue') return days < 0;
  return days <= (window === '7' ? 7 : 30);
}

export function formatRemainingDays(days: number | null): string {
  if (days == null) return '—';
  if (days < 0) return `逾期 ${Math.abs(days)} 日`;
  if (days === 0) return '今日到期';
  return `${days} 日`;
}

export function remainingDaysClass(days: number | null): string {
  if (days == null) return 'text-muted-foreground';
  if (days < 0) return 'text-rose-600';
  if (days <= 7) return 'text-amber-600';
  return 'text-muted-foreground';
}

export function formatFinanceMoney(amount: number, currency: SystemCurrency = DEFAULT_CURRENCY): string {
  return formatIncomeMoney(amount, currency);
}

export function incomeStatusLabel(status: string | undefined): string {
  if (!status) return '—';
  return INCOME_PAYMENT_STATUS_LABELS[status as IncomePaymentStatus] ?? status;
}

export function expenseStatusLabel(status: string | undefined): string {
  if (!status) return '—';
  return EXPENSE_PAYMENT_STATUS_LABELS[status as ExpensePaymentStatus] ?? status;
}

export function financeRowHref(row: {
  quotationClientProjectId?: string;
  projectStatus?: string;
  websiteId?: string;
}): string | null {
  const qcpId = row.quotationClientProjectId?.trim();
  if (qcpId) return buildQuotationProjectHref(qcpId, row.projectStatus);
  const websiteId = row.websiteId?.trim();
  if (websiteId) return buildWebsiteDetailHref(websiteId);
  return null;
}

function includesQuery(values: Array<string | number | undefined | null>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((value) => String(value ?? '').toLowerCase().includes(q));
}

export function filterDueSoonExpenses(
  rows: FinanceExpenseRow[],
  opts: { search?: string; window?: DueSoonWindow; asOf?: string } = {},
): FinanceExpenseRow[] {
  const window = opts.window ?? DEFAULT_DUE_SOON_WINDOW;
  const asOf = opts.asOf ?? todayIso();
  return rows.filter((row) => {
    if (!matchesDueSoonWindow(row.dueDate, row.outstanding, window, asOf)) return false;
    return includesQuery(
      [
        row.projectName,
        row.supplierLabel,
        row.typeLabel,
        row.creditCardLabel,
        row.remarks,
        row.paymentStatus,
        formatExpenseMoney(row.outstanding),
      ],
      opts.search ?? '',
    );
  });
}

export function filterReceivables(
  rows: FinanceIncomeRow[],
  opts: { search?: string; status?: string; overdue?: boolean; asOf?: string } = {},
): FinanceIncomeRow[] {
  const asOf = opts.asOf ?? todayIso();
  return rows.filter((row) => {
    if (!isOutstandingAmount(row.outstanding)) return false;
    if (opts.status && opts.status !== 'all' && row.paymentStatus !== opts.status) return false;
    if (opts.overdue && !isOverdueDueDate(row.dueDate, asOf)) return false;
    return includesQuery(
      [
        row.projectName,
        row.clientName,
        row.typeLabel,
        row.remarks,
        row.paymentStatus,
        formatIncomeMoney(row.outstanding),
      ],
      opts.search ?? '',
    );
  });
}

export function filterPayables(
  rows: FinanceExpenseRow[],
  opts: { search?: string; status?: string; overdue?: boolean; asOf?: string } = {},
): FinanceExpenseRow[] {
  const asOf = opts.asOf ?? todayIso();
  return rows.filter((row) => {
    if (!isOutstandingAmount(row.outstanding)) return false;
    if (opts.status && opts.status !== 'all' && row.paymentStatus !== opts.status) return false;
    if (opts.overdue && !isOverdueDueDate(row.dueDate, asOf)) return false;
    return includesQuery(
      [
        row.projectName,
        row.supplierLabel,
        row.typeLabel,
        row.creditCardLabel,
        row.remarks,
        row.paymentStatus,
        formatExpenseMoney(row.outstanding),
      ],
      opts.search ?? '',
    );
  });
}

export function toBadDebtRows(
  incomes: FinanceIncomeRow[],
  expenses: FinanceExpenseRow[],
): FinanceBadDebtRow[] {
  return [
    ...incomes
      .filter((row) => isOutstandingAmount(row.badDebt))
      .map((row) => ({
        kind: 'income' as const,
        id: row.id,
        projectName: row.projectName,
        partyLabel: row.clientName || '—',
        typeLabel: row.typeLabel,
        billedAmount: row.billedAmount,
        outstanding: row.outstanding,
        badDebt: row.badDebt,
        dueDate: row.dueDate,
        remarks: row.remarks,
        quotationClientProjectId: row.quotationClientProjectId,
        projectStatus: row.projectStatus,
      })),
    ...expenses
      .filter((row) => isOutstandingAmount(row.badDebt))
      .map((row) => ({
        kind: 'expense' as const,
        id: row.id,
        projectName: row.projectName,
        partyLabel: row.supplierLabel || '—',
        typeLabel: row.typeLabel,
        billedAmount: row.billedAmount,
        outstanding: row.outstanding,
        badDebt: row.badDebt,
        dueDate: row.dueDate,
        remarks: row.remarks,
        quotationClientProjectId: row.quotationClientProjectId,
        websiteId: row.websiteId,
        projectStatus: row.projectStatus,
      })),
  ];
}

export function filterBadDebts(
  rows: FinanceBadDebtRow[],
  opts: { search?: string; kind?: BadDebtKindFilter } = {},
): FinanceBadDebtRow[] {
  return rows.filter((row) => {
    if (opts.kind && opts.kind !== 'all' && row.kind !== opts.kind) return false;
    return includesQuery(
      [
        BAD_DEBT_KIND_LABELS[row.kind],
        row.projectName,
        row.partyLabel,
        row.typeLabel,
        row.remarks,
        formatFinanceMoney(row.badDebt),
      ],
      opts.search ?? '',
    );
  });
}

function defaultSortDirForKey(key: string): FinanceLedgerSortDir {
  if (
    key === 'billedAmount' ||
    key === 'paymentAmount' ||
    key === 'outstanding' ||
    key === 'badDebt' ||
    key === 'installmentNumber'
  ) {
    return 'desc';
  }
  if (key === 'remainingDays' || key === 'dueDate') return 'asc';
  return 'asc';
}

export function nextLedgerSort<K extends string>(
  currentKey: K,
  currentDir: FinanceLedgerSortDir,
  clickedKey: K,
): { key: K; dir: FinanceLedgerSortDir } {
  if (clickedKey === currentKey) {
    return { key: currentKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: clickedKey, dir: defaultSortDirForKey(clickedKey) };
}

function expenseSortValue(
  row: FinanceExpenseRow,
  key: DueSoonSortKey,
  asOf: string,
): string | number | null {
  switch (key) {
    case 'dueDate':
      return optionalIsoDate(row.dueDate) ?? null;
    case 'remainingDays':
      return daysUntilDue(row.dueDate, asOf);
    case 'projectName':
      return row.projectName.trim() || null;
    case 'typeLabel':
      return row.typeLabel.trim() || null;
    case 'supplierLabel':
      return row.supplierLabel.trim() || null;
    case 'billedAmount':
      return row.billedAmount;
    case 'paymentAmount':
      return row.paymentAmount;
    case 'outstanding':
      return row.outstanding;
    case 'paymentStatus':
      return row.paymentStatus?.trim() || null;
    case 'remarks':
      return row.remarks?.trim() || null;
  }
}

function incomeSortValue(
  row: FinanceIncomeRow,
  key: ReceivableSortKey,
): string | number | null {
  switch (key) {
    case 'dueDate':
      return optionalIsoDate(row.dueDate) ?? null;
    case 'projectName':
      return row.projectName.trim() || null;
    case 'clientName':
      return row.clientName.trim() || null;
    case 'typeLabel':
      return row.typeLabel.trim() || null;
    case 'installmentNumber':
      return row.installmentNumber ?? null;
    case 'billedAmount':
      return row.billedAmount;
    case 'paymentAmount':
      return row.paymentAmount;
    case 'outstanding':
      return row.outstanding;
    case 'paymentStatus':
      return row.paymentStatus?.trim() || null;
    case 'remarks':
      return row.remarks?.trim() || null;
  }
}

function badDebtSortValue(row: FinanceBadDebtRow, key: BadDebtSortKey): string | number | null {
  switch (key) {
    case 'kind':
      return row.kind === 'income' ? 0 : 1;
    case 'dueDate':
      return optionalIsoDate(row.dueDate) ?? null;
    case 'projectName':
      return row.projectName.trim() || null;
    case 'partyLabel':
      return row.partyLabel.trim() || null;
    case 'typeLabel':
      return row.typeLabel.trim() || null;
    case 'billedAmount':
      return row.billedAmount;
    case 'badDebt':
      return row.badDebt;
    case 'outstanding':
      return row.outstanding;
    case 'remarks':
      return row.remarks?.trim() || null;
  }
}

export function sortDueSoonExpenses(
  rows: FinanceExpenseRow[],
  key: DueSoonSortKey = DEFAULT_DUE_SOON_SORT_KEY,
  dir: FinanceLedgerSortDir = DEFAULT_LEDGER_SORT_DIR,
  asOf = todayIso(),
): FinanceExpenseRow[] {
  return [...rows].sort((a, b) =>
    compareQuotationListValues(expenseSortValue(a, key, asOf), expenseSortValue(b, key, asOf), dir),
  );
}

export function sortReceivables(
  rows: FinanceIncomeRow[],
  key: ReceivableSortKey = DEFAULT_RECEIVABLE_SORT_KEY,
  dir: FinanceLedgerSortDir = DEFAULT_LEDGER_SORT_DIR,
): FinanceIncomeRow[] {
  return [...rows].sort((a, b) =>
    compareQuotationListValues(incomeSortValue(a, key), incomeSortValue(b, key), dir),
  );
}

export function sortPayables(
  rows: FinanceExpenseRow[],
  key: PayableSortKey = DEFAULT_PAYABLE_SORT_KEY,
  dir: FinanceLedgerSortDir = DEFAULT_LEDGER_SORT_DIR,
  asOf = todayIso(),
): FinanceExpenseRow[] {
  return sortDueSoonExpenses(rows, key, dir, asOf);
}

export function sortBadDebts(
  rows: FinanceBadDebtRow[],
  key: BadDebtSortKey = DEFAULT_BAD_DEBT_SORT_KEY,
  dir: FinanceLedgerSortDir = DEFAULT_BAD_DEBT_SORT_DIR,
): FinanceBadDebtRow[] {
  return [...rows].sort((a, b) =>
    compareQuotationListValues(badDebtSortValue(a, key), badDebtSortValue(b, key), dir),
  );
}

function sumField<T>(rows: T[], pick: (row: T) => number): number {
  return Math.round(rows.reduce((sum, row) => sum + (Number.isFinite(pick(row)) ? pick(row) : 0), 0) * 100) / 100;
}

export function summarizeDueSoonExpenses(rows: FinanceExpenseRow[], asOf = todayIso()) {
  const outstanding = rows.filter((row) => isOutstandingAmount(row.outstanding) && daysUntilDue(row.dueDate, asOf) != null);
  return {
    overdue: outstanding.filter((row) => matchesDueSoonWindow(row.dueDate, row.outstanding, 'overdue', asOf)).length,
    dueIn7: outstanding.filter((row) => {
      const days = daysUntilDue(row.dueDate, asOf);
      return days != null && days >= 0 && days <= 7;
    }).length,
    dueIn30: outstanding.filter((row) => {
      const days = daysUntilDue(row.dueDate, asOf);
      return days != null && days >= 0 && days <= 30;
    }).length,
    outstandingTotal: sumField(
      outstanding.filter((row) => matchesDueSoonWindow(row.dueDate, row.outstanding, '30', asOf)),
      (row) => row.outstanding,
    ),
  };
}

export function summarizeReceivables(rows: FinanceIncomeRow[], asOf = todayIso()) {
  const open = rows.filter((row) => isOutstandingAmount(row.outstanding));
  return {
    count: open.length,
    billed: sumField(open, (row) => row.billedAmount),
    received: sumField(open, (row) => row.paymentAmount),
    outstanding: sumField(open, (row) => row.outstanding),
    overdue: open.filter((row) => isOverdueDueDate(row.dueDate, asOf)).length,
  };
}

export function summarizePayables(rows: FinanceExpenseRow[], asOf = todayIso()) {
  const open = rows.filter((row) => isOutstandingAmount(row.outstanding));
  return {
    count: open.length,
    billed: sumField(open, (row) => row.billedAmount),
    paid: sumField(open, (row) => row.paymentAmount),
    outstanding: sumField(open, (row) => row.outstanding),
    overdue: open.filter((row) => isOverdueDueDate(row.dueDate, asOf)).length,
  };
}

export function summarizeBadDebts(rows: FinanceBadDebtRow[]) {
  const incomes = rows.filter((row) => row.kind === 'income');
  const expenses = rows.filter((row) => row.kind === 'expense');
  return {
    count: rows.length,
    income: sumField(incomes, (row) => row.badDebt),
    expense: sumField(expenses, (row) => row.badDebt),
    total: sumField(rows, (row) => row.badDebt),
  };
}
