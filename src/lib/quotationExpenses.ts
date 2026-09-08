import {
  billedSumMatchesTotal,
  BULK_DATE_MODE_LABELS,
  BULK_DATE_MODES,
  computeOutstanding,
  DEFAULT_BULK_DATE_MODE,
  defaultBulkDateRange,
  distributeDueDates,
  findInstallmentCollision,
  formatIncomeDate,
  formatIncomeDateTime,
  formatIncomeMoney,
  formatLocalIsoDate,
  formatMoneyInput,
  formatPaymentRecordFileSize,
  hasFilledPaymentAmount,
  inferBulkDateMode,
  INCOME_PAYMENT_RECORD_MAX_SIZE_MB,
  isAllowedPaymentRecordFile,
  isBulkDateMode,
  nextInstallmentNumber,
  normalizeDateRange,
  optionalIsoDate,
  parseInstallmentNumber,
  parseLocalIsoDate,
  parseMoney,
  planBulkInstallmentNumbers,
  sanitizePaymentRecordFileName,
  splitBilledAmounts,
  spreadDueDates,
  type BulkDateMode,
  type PaymentRecordFileAction,
} from '@/lib/quotationIncomes';

export const EXPENSES_TABLE = 'expenses';
export const RECURRING_EXPENSES_TABLE = 'recurring_expenses';
export const EXPENSE_RELATED_TYPE_PROJECT = 'project';
export const EXPENSE_PAYMENT_RECORDS_BUCKET = 'expense-payment-records';
export const EXPENSE_PAYMENT_RECORD_MAX_SIZE_MB = INCOME_PAYMENT_RECORD_MAX_SIZE_MB;

export const RECURRING_EXPENSE_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type RecurringExpenseFrequency = (typeof RECURRING_EXPENSE_FREQUENCIES)[number];
export type RecurringExpenseStatus = 'active' | 'paused';

export const RECURRING_EXPENSE_FREQUENCY_LABELS: Record<RecurringExpenseFrequency, string> = {
  weekly: '每週',
  monthly: '每月',
  quarterly: '每季',
  yearly: '每年',
};

export const RECURRING_EXPENSE_STATUS_LABELS: Record<RecurringExpenseStatus, string> = {
  active: '進行中',
  paused: '已暫停',
};

export const EXPENSE_PAYMENT_METHODS = ['Transfer', 'Cash', 'Cheque', 'Credit Card'] as const;

export const EXPENSE_PAYMENT_STATUSES = ['Pending Check', 'Paid', 'Not Paid'] as const;

export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];
export type ExpensePaymentStatus = (typeof EXPENSE_PAYMENT_STATUSES)[number];

export const EXPENSE_PAYMENT_METHOD_CREDIT_CARD: ExpensePaymentMethod = 'Credit Card';

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  Transfer: '轉帳 Transfer',
  Cash: '現金 Cash',
  Cheque: '支票 Cheque',
  'Credit Card': '信用卡 Credit Card',
};

export const EXPENSE_PAYMENT_STATUS_LABELS: Record<ExpensePaymentStatus, string> = {
  'Pending Check': '待核對 Pending Check',
  Paid: '已付款 Paid',
  'Not Paid': '未付款 Not Paid',
};

export const EXPENSE_PAYMENT_STATUS_STYLES: Record<ExpensePaymentStatus, string> = {
  'Pending Check': 'bg-amber-50 text-amber-800 border-amber-200',
  Paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Not Paid': 'bg-rose-50 text-rose-700 border-rose-200',
};

export type QuotationExpense = {
  id: string;
  relatedType: string;
  relatedId: string;
  supplierTypesId: string;
  supplierId: string;
  typeLabel: string;
  supplierLabel: string;
  groupKey: string;
  installmentNumber?: number;
  billedAmount: number;
  dueDate?: string;
  paymentAmount: number;
  paymentDate?: string;
  paymentMethod?: ExpensePaymentMethod;
  creditCardId?: string;
  creditCardLabel?: string;
  paymentStatus?: ExpensePaymentStatus;
  outstanding: number;
  badDebt: number;
  remarks?: string;
  paymentRecordFileName?: string;
  paymentRecordFileUrl?: string;
  paymentRecordStoragePath?: string;
  paymentRecordFileSize?: number;
  paymentRecordMimeType?: string;
  recurringExpenseId?: string;
  recurringFrequency?: RecurringExpenseFrequency;
  recurringNextOccurrenceDate?: string;
  recurringAutomationRunCount?: number;
  recurringStatus?: RecurringExpenseStatus;
  createdAt: string;
  updatedAt: string;
};

export type QuotationExpenseInput = {
  supplierTypesId: string;
  supplierId: string;
  installmentNumber?: number | null;
  billedAmount: number;
  dueDate?: string | null;
  paymentAmount: number;
  paymentDate?: string | null;
  paymentMethod?: ExpensePaymentMethod | null;
  creditCardId?: string | null;
  paymentStatus?: ExpensePaymentStatus | null;
  badDebt: number;
  remarks?: string | null;
  paymentRecordFileName?: string | null;
  paymentRecordFileUrl?: string | null;
  paymentRecordStoragePath?: string | null;
  paymentRecordFileSize?: number | null;
  paymentRecordMimeType?: string | null;
  recurringExpenseId?: string | null;
};

export function expenseGroupKey(supplierTypesId: string, supplierId: string): string {
  return `${supplierTypesId.trim()}::${supplierId.trim()}`;
}

export function isExpensePaymentMethod(value: string | null | undefined): value is ExpensePaymentMethod {
  return EXPENSE_PAYMENT_METHODS.includes(value as ExpensePaymentMethod);
}

export function isCreditCardPaymentMethod(value: string | null | undefined): boolean {
  return value === EXPENSE_PAYMENT_METHOD_CREDIT_CARD;
}

export function expenseCreditCardId(
  paymentMethod: string | null | undefined,
  creditCardId: string | null | undefined,
): string | null {
  if (!isCreditCardPaymentMethod(paymentMethod)) return null;
  return creditCardId?.trim() || null;
}

export function isRecurringExpenseFrequency(
  value: string | null | undefined,
): value is RecurringExpenseFrequency {
  return RECURRING_EXPENSE_FREQUENCIES.includes(value as RecurringExpenseFrequency);
}

export function isRecurringExpenseStatus(
  value: string | null | undefined,
): value is RecurringExpenseStatus {
  return value === 'active' || value === 'paused';
}

export function nextRecurringDueDate(
  frequency: RecurringExpenseFrequency,
  from: string,
  anchor = from,
): string | null {
  const fromDate = parseLocalIsoDate(from);
  const anchorDate = parseLocalIsoDate(anchor);
  if (!fromDate || !anchorDate) return null;
  if (frequency === 'weekly') {
    const next = new Date(fromDate);
    next.setDate(fromDate.getDate() + 7);
    return formatLocalIsoDate(next);
  }
  const months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
  const target = new Date(fromDate.getFullYear(), fromDate.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(anchorDate.getDate(), lastDay));
  return formatLocalIsoDate(target);
}

export function previewRecurringDueDates(
  frequency: RecurringExpenseFrequency,
  start: string,
  count = 3,
): string[] {
  if (count < 1) return [];
  const first = optionalIsoDate(start);
  if (!first) return [];
  const dates = [first];
  let current = first;
  for (let i = 1; i < count; i += 1) {
    const next = nextRecurringDueDate(frequency, current, first);
    if (!next) break;
    dates.push(next);
    current = next;
  }
  return dates;
}

export function paidRecurringExpenseFields(billedAmount: number, dueDate: string) {
  return {
    paymentAmount: billedAmount,
    paymentDate: dueDate,
    paymentMethod: EXPENSE_PAYMENT_METHOD_CREDIT_CARD,
    paymentStatus: 'Paid' as const,
    badDebt: 0,
  };
}

export function isExpensePaymentStatus(value: string | null | undefined): value is ExpensePaymentStatus {
  return EXPENSE_PAYMENT_STATUSES.includes(value as ExpensePaymentStatus);
}

export function installmentScopeRows(
  rows: Array<{ id?: string; groupKey?: string; installmentNumber?: number }>,
) {
  return rows.map((row) => ({
    id: row.id,
    type: row.groupKey ?? '',
    installmentNumber: row.installmentNumber,
  }));
}

export function nextExpenseInstallmentNumber(
  rows: Array<{ groupKey?: string; installmentNumber?: number }>,
  supplierTypesId: string,
  supplierId: string,
): number {
  return nextInstallmentNumber(installmentScopeRows(rows), expenseGroupKey(supplierTypesId, supplierId));
}

export function planBulkExpenseInstallmentNumbers(input: {
  projectRows: Array<{ id?: string; groupKey?: string; installmentNumber?: number }>;
  supplierTypesId: string;
  supplierId: string;
  count: number;
  editingIds?: Iterable<string>;
  keepNumbers?: Array<number | null | undefined>;
}): number[] {
  return planBulkInstallmentNumbers({
    projectRows: installmentScopeRows(input.projectRows),
    type: expenseGroupKey(input.supplierTypesId, input.supplierId),
    count: input.count,
    editingIds: input.editingIds,
    keepNumbers: input.keepNumbers,
  });
}

export function findExpenseInstallmentCollision(
  projectRows: Array<{ id?: string; groupKey?: string; installmentNumber?: number }>,
  supplierTypesId: string,
  supplierId: string,
  numbers: Array<number | null>,
  excludeIds?: Iterable<string>,
): number | null {
  return findInstallmentCollision(
    installmentScopeRows(projectRows),
    expenseGroupKey(supplierTypesId, supplierId),
    numbers,
    excludeIds,
  );
}

export const BULK_EXPENSE_BILLED_TOTAL_MISMATCH = '應付合計須等於總金額';
export const DEFAULT_BULK_EXPENSE_INSTALLMENT_COUNT = 2;
export const MAX_BULK_EXPENSE_INSTALLMENT_COUNT = 24;

export function expenseToWriteInput(
  row: QuotationExpense,
  overrides: Partial<QuotationExpenseInput> = {},
): QuotationExpenseInput {
  return {
    supplierTypesId: row.supplierTypesId,
    supplierId: row.supplierId,
    installmentNumber: row.installmentNumber ?? null,
    billedAmount: row.billedAmount,
    dueDate: row.dueDate ?? null,
    paymentAmount: row.paymentAmount,
    paymentDate: row.paymentDate ?? null,
    paymentMethod: row.paymentMethod ?? null,
    creditCardId: expenseCreditCardId(row.paymentMethod, row.creditCardId),
    paymentStatus: row.paymentStatus ?? null,
    recurringExpenseId: row.recurringExpenseId ?? null,
    badDebt: row.badDebt,
    remarks: row.remarks ?? null,
    ...overrides,
  };
}

export function formatExpenseMoney(amount: number, currency = 'HKD'): string {
  return formatIncomeMoney(amount, currency);
}

export function formatExpenseDate(value: string | undefined): string {
  return formatIncomeDate(value);
}

export function formatExpenseDateTime(value: string | undefined): string {
  return formatIncomeDateTime(value);
}

export function validateExpenseInput(input: {
  supplierTypesId: string;
  supplierId: string;
  installmentNumber?: string;
  billedAmount: string;
  dueDate?: string;
  paymentAmount: string;
  paymentDate?: string;
  badDebt?: string;
  paymentMethod: string;
  creditCardId?: string;
  paymentStatus: string;
  frequency?: string;
}): string | null {
  if (!input.supplierTypesId.trim()) return '請選擇支出類型';
  if (!input.supplierId.trim()) return '請選擇供應商';
  if (parseInstallmentNumber(input.installmentNumber) == null) return '請填寫期數';
  if (!input.billedAmount?.trim()) return '請填寫應付金額';
  if (parseMoney(input.billedAmount) == null) return '應付金額須為 0 或以上的數字';
  if (!optionalIsoDate(input.dueDate)) return '請選擇到期日';
  if (input.paymentAmount.trim() && parseMoney(input.paymentAmount) == null) {
    return '實付金額須為 0 或以上的數字';
  }
  if (input.badDebt?.trim() && parseMoney(input.badDebt) == null) return '壞帳須為 0 或以上的數字';
  if (hasFilledPaymentAmount(input.paymentAmount)) {
    if (!optionalIsoDate(input.paymentDate)) return '請選擇付款日期';
    if (!isExpensePaymentMethod(input.paymentMethod)) return '請選擇付款方式';
    if (!isExpensePaymentStatus(input.paymentStatus)) return '請選擇付款狀態';
  } else {
    if (input.paymentMethod && !isExpensePaymentMethod(input.paymentMethod)) return '請選擇有效的付款方式';
    if (input.paymentStatus && !isExpensePaymentStatus(input.paymentStatus)) return '請選擇有效的付款狀態';
  }
  if (isCreditCardPaymentMethod(input.paymentMethod) && !input.creditCardId?.trim()) {
    return '請選擇信用卡';
  }
  if (input.frequency?.trim()) {
    if (!input.creditCardId?.trim() || !isCreditCardPaymentMethod(input.paymentMethod)) {
      return '週期支出須選擇信用卡';
    }
    if (!isRecurringExpenseFrequency(input.frequency)) return '請選擇有效週期';
  }
  return null;
}

export function validateBulkExpenseInput(input: {
  supplierTypesId: string;
  supplierId: string;
  totalAmount: string;
  startDate?: string;
  endDate?: string;
  installmentCount: string;
  rows: Array<{ dueDate?: string; installmentNumber?: string; billedAmount: string }>;
}): string | null {
  if (!input.supplierTypesId.trim()) return '請選擇支出類型';
  if (!input.supplierId.trim()) return '請選擇供應商';
  if (input.totalAmount?.trim() && parseMoney(input.totalAmount) == null) {
    return '總金額須為 0 或以上的數字';
  }
  const count = parseInstallmentNumber(input.installmentCount);
  if (count == null) return '請填寫期數數量';
  if (count > MAX_BULK_EXPENSE_INSTALLMENT_COUNT) {
    return `期數數量不可超過 ${MAX_BULK_EXPENSE_INSTALLMENT_COUNT}`;
  }
  if (input.rows.length !== count) return '期數列表與期數數量不一致';
  const seen = new Set<number>();
  for (let i = 0; i < input.rows.length; i += 1) {
    const row = input.rows[i];
    const installment = parseInstallmentNumber(row.installmentNumber);
    if (installment == null) return `第 ${i + 1} 期缺少期數`;
    if (seen.has(installment)) return `期數 ${installment} 重複`;
    seen.add(installment);
    if (!row.billedAmount?.trim()) return `第 ${i + 1} 期請填寫應付金額`;
    if (parseMoney(row.billedAmount) == null) return `第 ${i + 1} 期應付金額須為 0 或以上的數字`;
    if (!optionalIsoDate(row.dueDate)) return `第 ${i + 1} 期請選擇到期日`;
  }
  if (input.totalAmount?.trim() && !billedSumMatchesTotal(input.totalAmount, input.rows)) {
    return BULK_EXPENSE_BILLED_TOTAL_MISMATCH;
  }
  return null;
}

export function expensePaymentRecordStoragePath(
  projectId: string,
  fileName: string,
  uniqueId: string,
): string {
  return `${projectId.trim()}/${uniqueId}/${sanitizePaymentRecordFileName(fileName)}`;
}

export type ExpenseSummary = {
  billed: number;
  paid: number;
  outstanding: number;
  badDebt: number;
};

export type ExpenseTypeGroup = {
  key: string;
  supplierTypesId: string;
  supplierId: string;
  typeLabel: string;
  supplierLabel: string;
  rows: QuotationExpense[];
  summary: ExpenseSummary;
};

export function summarizeExpenses(rows: QuotationExpense[]): ExpenseSummary {
  return rows.reduce(
    (acc, row) => ({
      billed: acc.billed + row.billedAmount,
      paid: acc.paid + row.paymentAmount,
      outstanding: acc.outstanding + row.outstanding,
      badDebt: acc.badDebt + row.badDebt,
    }),
    { billed: 0, paid: 0, outstanding: 0, badDebt: 0 },
  );
}

export function groupExpensesByType(rows: QuotationExpense[]): ExpenseTypeGroup[] {
  const byKey = new Map<string, QuotationExpense[]>();
  for (const row of rows) {
    const key = row.groupKey || expenseGroupKey(row.supplierTypesId, row.supplierId);
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  return [...byKey.entries()]
    .map(([key, typeRows]) => ({
      key,
      supplierTypesId: typeRows[0]?.supplierTypesId ?? '',
      supplierId: typeRows[0]?.supplierId ?? '',
      typeLabel: typeRows[0]?.typeLabel?.trim() || '未分類',
      supplierLabel: typeRows[0]?.supplierLabel?.trim() || '未指定供應商',
      rows: typeRows,
      summary: summarizeExpenses(typeRows),
    }))
    .sort((a, b) => {
      const typeCmp = a.typeLabel.localeCompare(b.typeLabel, 'zh-Hant');
      if (typeCmp !== 0) return typeCmp;
      return a.supplierLabel.localeCompare(b.supplierLabel, 'zh-Hant');
    });
}

export {
  billedSumMatchesTotal,
  BULK_DATE_MODE_LABELS,
  BULK_DATE_MODES,
  computeOutstanding,
  DEFAULT_BULK_DATE_MODE,
  defaultBulkDateRange,
  distributeDueDates,
  formatLocalIsoDate,
  formatMoneyInput,
  formatPaymentRecordFileSize,
  hasFilledPaymentAmount,
  inferBulkDateMode,
  isAllowedPaymentRecordFile,
  isBulkDateMode,
  normalizeDateRange,
  optionalIsoDate,
  parseInstallmentNumber,
  parseLocalIsoDate,
  parseMoney,
  splitBilledAmounts,
  spreadDueDates,
  type BulkDateMode,
  type PaymentRecordFileAction,
};
