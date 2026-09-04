export const INCOMES_TABLE = 'incomes';

export const INCOME_TYPE_PRESETS = ['訂金', '分期', '尾款', '全額'] as const;

export const INCOME_PAYMENT_METHODS = ['Transfer', 'Cash', 'Cheque'] as const;

export const INCOME_PAYMENT_STATUSES = ['Pending Check', 'Received', 'Not Received'] as const;

export type IncomePaymentMethod = (typeof INCOME_PAYMENT_METHODS)[number];
export type IncomePaymentStatus = (typeof INCOME_PAYMENT_STATUSES)[number];

export const INCOME_PAYMENT_METHOD_LABELS: Record<IncomePaymentMethod, string> = {
  Transfer: '轉帳 Transfer',
  Cash: '現金 Cash',
  Cheque: '支票 Cheque',
};

export const INCOME_PAYMENT_STATUS_LABELS: Record<IncomePaymentStatus, string> = {
  'Pending Check': '待核對 Pending Check',
  Received: '已收款 Received',
  'Not Received': '未收款 Not Received',
};

export const INCOME_PAYMENT_STATUS_STYLES: Record<IncomePaymentStatus, string> = {
  'Pending Check': 'bg-amber-50 text-amber-800 border-amber-200',
  Received: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Not Received': 'bg-rose-50 text-rose-700 border-rose-200',
};

export type QuotationIncome = {
  id: string;
  quotationClientProjectId: string;
  type: string;
  installmentNumber?: number;
  billedAmount: number;
  dueDate?: string;
  paymentAmount: number;
  paymentMethod?: IncomePaymentMethod;
  paymentStatus: IncomePaymentStatus;
  outstanding: number;
  badDebt: number;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
};

export type QuotationIncomeInput = {
  type: string;
  installmentNumber?: number | null;
  billedAmount: number;
  dueDate?: string | null;
  paymentAmount: number;
  paymentMethod?: IncomePaymentMethod | null;
  paymentStatus: IncomePaymentStatus;
  badDebt: number;
  remarks?: string | null;
};

export function isIncomePaymentMethod(value: string | null | undefined): value is IncomePaymentMethod {
  return INCOME_PAYMENT_METHODS.includes(value as IncomePaymentMethod);
}

export function isIncomePaymentStatus(value: string | null | undefined): value is IncomePaymentStatus {
  return INCOME_PAYMENT_STATUSES.includes(value as IncomePaymentStatus);
}

export function optionalIsoDate(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 10);
}

export function parseMoney(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) / 100 : null;
  }
  const trimmed = raw?.trim();
  if (!trimmed) return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

export function parseInstallmentNumber(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

export function computeOutstanding(billedAmount: number, paymentAmount: number, badDebt: number): number {
  const billed = Number.isFinite(billedAmount) ? billedAmount : 0;
  const paid = Number.isFinite(paymentAmount) ? paymentAmount : 0;
  const writtenOff = Number.isFinite(badDebt) ? badDebt : 0;
  return Math.max(0, Math.round((billed - paid - writtenOff) * 100) / 100);
}

export function nextInstallmentNumber(rows: Array<{ installmentNumber?: number }>): number {
  return rows.reduce((max, row) => Math.max(max, row.installmentNumber ?? 0), 0) + 1;
}

export function formatIncomeMoney(amount: number, currency = 'HKD'): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatIncomeDate(value: string | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${year}/${month}/${day}`;
}

export function formatIncomeDateTime(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatIncomeDate(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

export function validateIncomeInput(input: {
  type: string;
  installmentNumber?: string;
  billedAmount: string;
  paymentAmount: string;
  badDebt: string;
  paymentMethod: string;
  paymentStatus: string;
}): string | null {
  if (!input.type.trim()) return '請填寫收入類型';
  if (input.installmentNumber?.trim() && parseInstallmentNumber(input.installmentNumber) == null) {
    return '期數須為 1 或以上的整數';
  }
  if (parseMoney(input.billedAmount) == null) return '應收金額須為 0 或以上的數字';
  if (parseMoney(input.paymentAmount) == null) return '實收金額須為 0 或以上的數字';
  if (parseMoney(input.badDebt) == null) return '壞帳須為 0 或以上的數字';
  if (input.paymentMethod && !isIncomePaymentMethod(input.paymentMethod)) return '請選擇有效的付款方式';
  if (!isIncomePaymentStatus(input.paymentStatus)) return '請選擇收款狀態';
  return null;
}

export function summarizeIncomes(rows: QuotationIncome[]) {
  return rows.reduce(
    (acc, row) => ({
      billed: acc.billed + row.billedAmount,
      received: acc.received + row.paymentAmount,
      outstanding: acc.outstanding + row.outstanding,
      badDebt: acc.badDebt + row.badDebt,
    }),
    { billed: 0, received: 0, outstanding: 0, badDebt: 0 },
  );
}
