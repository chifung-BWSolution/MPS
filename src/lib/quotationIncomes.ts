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

export function sanitizePaymentRecordFileName(name: string): string {
  const trimmed = name.trim() || 'file';
  const cleaned = trimmed.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_').replace(/_+/g, '_');
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
