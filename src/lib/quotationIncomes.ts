import {
  DEFAULT_CURRENCY,
  type SystemCurrency,
} from './currency';

export const INCOMES_TABLE = 'incomes';
export const INCOME_PAYMENT_RECORDS_BUCKET = 'income-payment-records';
export const INCOME_PAYMENT_RECORD_MAX_SIZE_MB = 50;
export const INCOME_PAYMENT_RECORD_MAX_SIZE_BYTES = INCOME_PAYMENT_RECORD_MAX_SIZE_MB * 1024 * 1024;

export const INCOME_TYPE_PRESETS = ['主要收入', '後加項目', '代付項目'] as const;
export type IncomeType = (typeof INCOME_TYPE_PRESETS)[number];
export const DEFAULT_INCOME_TYPE: IncomeType = '主要收入';

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
  currency?: SystemCurrency;
  billedAmount: number;
  dueDate?: string;
  paymentAmount: number;
  paymentDate?: string;
  paymentMethod?: IncomePaymentMethod;
  paymentStatus?: IncomePaymentStatus;
  outstanding: number;
  badDebt: number;
  remarks?: string;
  paymentRecordFileName?: string;
  paymentRecordFileUrl?: string;
  paymentRecordStoragePath?: string;
  paymentRecordFileSize?: number;
  paymentRecordMimeType?: string;
  createdAt: string;
  updatedAt: string;
};

export type QuotationIncomeInput = {
  type: string;
  installmentNumber?: number | null;
  currency?: SystemCurrency;
  billedAmount: number;
  dueDate?: string | null;
  paymentAmount: number;
  paymentDate?: string | null;
  paymentMethod?: IncomePaymentMethod | null;
  paymentStatus?: IncomePaymentStatus | null;
  badDebt: number;
  remarks?: string | null;
  paymentRecordFileName?: string | null;
  paymentRecordFileUrl?: string | null;
  paymentRecordStoragePath?: string | null;
  paymentRecordFileSize?: number | null;
  paymentRecordMimeType?: string | null;
};

export type PaymentRecordFileAction = 'keep' | 'replace' | 'clear';

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

export function hasFilledPaymentAmount(raw: string | number | null | undefined): boolean {
  if (typeof raw === 'number') return Number.isFinite(raw);
  return Boolean(raw?.trim());
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

export function isIncomeType(value: string | null | undefined): value is IncomeType {
  return INCOME_TYPE_PRESETS.includes(value as IncomeType);
}

export function nextInstallmentNumber(
  rows: Array<{ type?: string; installmentNumber?: number }>,
  type?: string | null,
): number {
  const scoped = type
    ? rows.filter((row) => (row.type ?? '') === type)
    : rows;
  return scoped.reduce((max, row) => Math.max(max, row.installmentNumber ?? 0), 0) + 1;
}

export const DEFAULT_BULK_INSTALLMENT_COUNT = 2;
export const MAX_BULK_INSTALLMENT_COUNT = 24;

export const BULK_DATE_MODES = ['even', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type BulkDateMode = (typeof BULK_DATE_MODES)[number];
export const DEFAULT_BULK_DATE_MODE: BulkDateMode = 'monthly';

export const BULK_DATE_MODE_LABELS: Record<BulkDateMode, string> = {
  even: '按平均日數',
  weekly: '每週重複',
  monthly: '每月重複',
  quarterly: '每季重複',
  yearly: '每年重複',
};

export function isBulkDateMode(value: string | null | undefined): value is BulkDateMode {
  return BULK_DATE_MODES.includes(value as BulkDateMode);
}

export function parseLocalIsoDate(value: string | null | undefined): Date | null {
  const iso = optionalIsoDate(value);
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function formatLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalizeDateRange(
  start?: string | null,
  end?: string | null,
): { start: string; end: string } {
  const a = optionalIsoDate(start) ?? '';
  const b = optionalIsoDate(end) ?? '';
  if (a && b && a > b) return { start: b, end: a };
  return { start: a, end: b };
}

export function defaultBulkDateRange(
  signedDate?: string | null,
  handoverDate?: string | null,
): { start: string; end: string } {
  return normalizeDateRange(signedDate, handoverDate);
}

export function spreadDueDates(start: string, end: string, count: number): string[] {
  if (count < 1) return [];
  const startDate = parseLocalIsoDate(start);
  const endDate = parseLocalIsoDate(end);
  if (!startDate && !endDate) return Array.from({ length: count }, () => '');
  if (!startDate || !endDate) {
    const only = formatLocalIsoDate(startDate ?? endDate as Date);
    return Array.from({ length: count }, () => only);
  }
  if (count === 1) return [formatLocalIsoDate(startDate)];
  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
  return Array.from({ length: count }, (_, i) => {
    const offset = Math.round((totalDays * i) / (count - 1));
    const next = new Date(startDate);
    next.setDate(startDate.getDate() + offset);
    return formatLocalIsoDate(next);
  });
}

function addCalendarMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

export function distributeDueDates(input: {
  mode: BulkDateMode;
  start: string;
  end?: string;
  count: number;
}): string[] {
  const { mode, start, count } = input;
  if (mode === 'even') return spreadDueDates(start, input.end ?? start, count);
  if (count < 1) return [];
  const startDate = parseLocalIsoDate(start);
  if (!startDate) return Array.from({ length: count }, () => '');
  return Array.from({ length: count }, (_, index) => {
    if (mode === 'weekly') {
      const next = new Date(startDate);
      next.setDate(startDate.getDate() + index * 7);
      return formatLocalIsoDate(next);
    }
    const months = mode === 'monthly' ? index : mode === 'quarterly' ? index * 3 : index * 12;
    return formatLocalIsoDate(addCalendarMonths(startDate, months));
  });
}

export function inferBulkDateMode(dates: string[]): BulkDateMode | null {
  if (dates.length < 2 || dates.some((value) => !optionalIsoDate(value))) return null;
  const start = dates[0];
  const end = dates[dates.length - 1];
  const count = dates.length;
  const recurring: BulkDateMode[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
  for (const mode of recurring) {
    const generated = distributeDueDates({ mode, start, count });
    if (generated.every((value, index) => value === dates[index])) return mode;
  }
  const even = distributeDueDates({ mode: 'even', start, end, count });
  if (even.every((value, index) => value === dates[index])) return 'even';
  return null;
}

export function splitBilledAmounts(total: number, count: number): number[] {
  if (count < 1) return [];
  const cents = Math.round(total * 100);
  if (!Number.isFinite(cents) || cents < 0) return Array.from({ length: count }, () => 0);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i >= count - remainder ? 1 : 0)) / 100);
}

export function formatMoneyInput(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

export function parsePercent(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function formatPercentInput(percent: number): string {
  return (Math.round(percent * 100) / 100).toFixed(2);
}

export function billedAmountFromPercent(total: number, percent: number): number {
  return Math.round(total * percent) / 100;
}

export function percentFromBilledAmount(total: number, billed: number): number | null {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(billed) || billed < 0) return null;
  return Math.round((billed / total) * 10000) / 100;
}

export function billedInputFromPercent(totalAmount: string, percentRaw: string): string | null {
  const total = parseMoney(totalAmount);
  if (total == null || total <= 0 || !totalAmount.trim()) return null;
  if (!percentRaw.trim()) return '';
  const percent = parsePercent(percentRaw);
  if (percent == null) return null;
  return formatMoneyInput(billedAmountFromPercent(total, percent));
}

export function percentInputFromBilled(totalAmount: string, billedRaw: string): string {
  const total = parseMoney(totalAmount);
  if (total == null || total <= 0 || !totalAmount.trim()) return '';
  if (!billedRaw.trim()) return '';
  const billed = parseMoney(billedRaw);
  if (billed == null) return '';
  const percent = percentFromBilledAmount(total, billed);
  return percent == null ? '' : formatPercentInput(percent);
}

export function planBulkInstallmentNumbers(input: {
  projectRows: Array<{ id?: string; type?: string; installmentNumber?: number }>;
  type: string;
  count: number;
  editingIds?: Iterable<string>;
  keepNumbers?: Array<number | null | undefined>;
}): number[] {
  if (input.count < 1) return [];
  const exclude = new Set(input.editingIds ?? []);
  const others = input.projectRows.filter((row) => !row.id || !exclude.has(row.id));
  const kept = (input.keepNumbers ?? [])
    .slice(0, input.count)
    .map((value) => (typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null))
    .filter((value): value is number => value != null);
  const startAfter = Math.max(nextInstallmentNumber(others, input.type) - 1, ...kept, 0);
  const result = [...kept];
  let next = startAfter + 1;
  while (result.length < input.count) {
    result.push(next);
    next += 1;
  }
  return result;
}

export function findInstallmentCollision(
  projectRows: Array<{ id?: string; type?: string; installmentNumber?: number }>,
  type: string,
  numbers: Array<number | null>,
  excludeIds?: Iterable<string>,
): number | null {
  const exclude = new Set(excludeIds ?? []);
  const taken = new Set(
    projectRows
      .filter((row) => (row.type ?? '') === type && (!row.id || !exclude.has(row.id)))
      .map((row) => row.installmentNumber)
      .filter((value): value is number => value != null),
  );
  for (const number of numbers) {
    if (number != null && taken.has(number)) return number;
  }
  return null;
}

export function incomeToWriteInput(
  row: QuotationIncome,
  overrides: Partial<QuotationIncomeInput> = {},
): QuotationIncomeInput {
  return {
    type: row.type,
    installmentNumber: row.installmentNumber ?? null,
    currency: row.currency ?? DEFAULT_CURRENCY,
    billedAmount: row.billedAmount,
    dueDate: row.dueDate ?? null,
    paymentAmount: row.paymentAmount,
    paymentDate: row.paymentDate ?? null,
    paymentMethod: row.paymentMethod ?? null,
    paymentStatus: row.paymentStatus ?? null,
    badDebt: row.badDebt,
    remarks: row.remarks ?? null,
    ...overrides,
  };
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
  dueDate?: string;
  paymentAmount: string;
  paymentDate?: string;
  badDebt?: string;
  paymentMethod: string;
  paymentStatus: string;
}): string | null {
  if (!isIncomeType(input.type.trim())) return '請選擇收入類型';
  if (parseInstallmentNumber(input.installmentNumber) == null) return '請填寫期數';
  if (!input.billedAmount?.trim()) return '請填寫應收金額';
  if (parseMoney(input.billedAmount) == null) return '應收金額須為 0 或以上的數字';
  if (!optionalIsoDate(input.dueDate)) return '請選擇到期日';
  if (input.paymentAmount.trim() && parseMoney(input.paymentAmount) == null) {
    return '實收金額須為 0 或以上的數字';
  }
  if (input.badDebt?.trim() && parseMoney(input.badDebt) == null) return '壞帳須為 0 或以上的數字';
  if (hasFilledPaymentAmount(input.paymentAmount)) {
    if (!optionalIsoDate(input.paymentDate)) return '請選擇收款日期';
    if (!isIncomePaymentMethod(input.paymentMethod)) return '請選擇收款方式';
    if (!isIncomePaymentStatus(input.paymentStatus)) return '請選擇收款狀態';
  } else {
    if (input.paymentMethod && !isIncomePaymentMethod(input.paymentMethod)) return '請選擇有效的收款方式';
    if (input.paymentStatus && !isIncomePaymentStatus(input.paymentStatus)) return '請選擇有效的收款狀態';
  }
  return null;
}

export function validateBulkIncomeInput(input: {
  type: string;
  totalAmount: string;
  startDate?: string;
  endDate?: string;
  installmentCount: string;
  rows: Array<{ dueDate?: string; installmentNumber?: string; billedAmount: string }>;
}): string | null {
  if (!isIncomeType(input.type.trim())) return '請選擇收入類型';
  if (input.totalAmount?.trim() && parseMoney(input.totalAmount) == null) {
    return '總金額須為 0 或以上的數字';
  }
  const count = parseInstallmentNumber(input.installmentCount);
  if (count == null) return '請填寫期數數量';
  if (count > MAX_BULK_INSTALLMENT_COUNT) return `期數數量不可超過 ${MAX_BULK_INSTALLMENT_COUNT}`;
  if (input.rows.length !== count) return '期數列表與期數數量不一致';
  const seen = new Set<number>();
  for (let i = 0; i < input.rows.length; i += 1) {
    const row = input.rows[i];
    const installment = parseInstallmentNumber(row.installmentNumber);
    if (installment == null) return `第 ${i + 1} 期缺少期數`;
    if (seen.has(installment)) return `期數 ${installment} 重複`;
    seen.add(installment);
    if (!row.billedAmount?.trim()) return `第 ${i + 1} 期請填寫應收金額`;
    if (parseMoney(row.billedAmount) == null) return `第 ${i + 1} 期應收金額須為 0 或以上的數字`;
    if (!optionalIsoDate(row.dueDate)) return `第 ${i + 1} 期請選擇到期日`;
  }
  if (input.totalAmount?.trim() && !billedSumMatchesTotal(input.totalAmount, input.rows)) {
    return BULK_BILLED_TOTAL_MISMATCH;
  }
  return null;
}

export const BULK_BILLED_TOTAL_MISMATCH = '應收合計須等於總金額';

export function sumBulkBilledAmounts(rows: Array<{ billedAmount: string }>): number {
  return rows.reduce((sum, row) => sum + (parseMoney(row.billedAmount) ?? 0), 0);
}

export function billedSumMatchesTotal(
  totalAmount: string,
  rows: Array<{ billedAmount: string }>,
): boolean {
  const total = parseMoney(totalAmount);
  if (total == null || !totalAmount.trim()) return false;
  return Math.round(sumBulkBilledAmounts(rows) * 100) === Math.round(total * 100);
}

const PAYMENT_RECORD_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const PAYMENT_RECORD_EXTENSIONS = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'doc', 'docx', 'xls', 'xlsx',
]);

/** Storage keys must be S3-safe ASCII. The original display name is stored separately. */
export function sanitizePaymentRecordFileName(name: string): string {
  const trimmed = name.trim() || 'file';
  const lastDot = trimmed.lastIndexOf('.');
  const hasExt = lastDot > 0 && lastDot < trimmed.length - 1;
  const rawBase = hasExt ? trimmed.slice(0, lastDot) : trimmed;
  const rawExt = hasExt ? trimmed.slice(lastDot + 1) : '';

  const base = rawBase
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const ext = rawExt.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '');
  const cleaned = ext ? `${base || 'file'}.${ext}` : base || 'file';
  return cleaned.slice(0, 180) || 'file';
}

export function paymentRecordFileExtension(name: string): string {
  const match = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

export function isAllowedPaymentRecordFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (file.size > INCOME_PAYMENT_RECORD_MAX_SIZE_BYTES) {
    return `檔案不可超過 ${INCOME_PAYMENT_RECORD_MAX_SIZE_MB}MB`;
  }
  const ext = paymentRecordFileExtension(file.name);
  if (file.type && PAYMENT_RECORD_MIME_TYPES.has(file.type)) return null;
  if (ext && PAYMENT_RECORD_EXTENSIONS.has(ext)) return null;
  return '不支援此檔案格式（可用 PDF、圖片、Word、Excel）';
}

export function incomePaymentRecordStoragePath(
  projectId: string,
  fileName: string,
  uniqueId: string,
): string {
  return `${projectId.trim()}/${uniqueId}/${sanitizePaymentRecordFileName(fileName)}`;
}

export function formatPaymentRecordFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type IncomeSummary = {
  billed: number;
  received: number;
  outstanding: number;
  badDebt: number;
};

export type IncomeTypeGroup = {
  type: string;
  rows: QuotationIncome[];
  summary: IncomeSummary;
};

export function summarizeIncomes(rows: QuotationIncome[]): IncomeSummary {
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

export function groupIncomesByType(rows: QuotationIncome[]): IncomeTypeGroup[] {
  const byType = new Map<string, QuotationIncome[]>();
  for (const row of rows) {
    const type = row.type?.trim() || '未分類';
    const list = byType.get(type);
    if (list) list.push(row);
    else byType.set(type, [row]);
  }

  const presetOrder = new Map(INCOME_TYPE_PRESETS.map((type, index) => [type, index]));
  return [...byType.entries()]
    .sort(([a], [b]) => {
      const ai = presetOrder.get(a as IncomeType);
      const bi = presetOrder.get(b as IncomeType);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return a.localeCompare(b, 'zh-Hant');
    })
    .map(([type, typeRows]) => ({
      type,
      rows: typeRows,
      summary: summarizeIncomes(typeRows),
    }));
}
