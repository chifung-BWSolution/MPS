import * as XLSX from 'xlsx';
import {
  expenseCreditCardId,
  expenseGroupKey,
  nextExpenseInstallmentNumber,
  type ExpensePaymentMethod,
  type ExpensePaymentStatus,
  type QuotationExpenseInput,
} from '@/lib/quotationExpenses';
import {
  parseSystemCurrency,
  toHkd,
  type SystemCurrency,
} from '@/lib/currency';

export const SHOPIFY_BILLING_IMPORT_SOURCE = 'shopify_billing';

const REQUIRED_HEADERS = ['bill', 'chargecategory', 'amount'] as const;

const HEADER_ALIASES: Record<string, keyof ShopifyBillingRaw> = {
  bill: 'billNumber',
  storename: 'storeName',
  shopid: 'shopId',
  myshopifycomurl: 'storeUrl',
  chargecategory: 'chargeCategory',
  description: 'description',
  amount: 'amount',
  currency: 'currency',
  startofbillingcycle: 'cycleStart',
  endofbillingcycle: 'cycleEnd',
  date: 'invoiceDate',
  app: 'app',
  originalamount: 'originalAmount',
  originalcurrency: 'originalCurrency',
  chargedate: 'chargeDate',
};

export type ShopifyBillingRaw = {
  billNumber: string;
  storeName: string;
  shopId: string;
  storeUrl: string;
  chargeCategory: string;
  description: string;
  amount: string;
  currency: string;
  cycleStart: string;
  cycleEnd: string;
  invoiceDate: string;
  app: string;
  originalAmount: string;
  originalCurrency: string;
  chargeDate: string;
};

export type ShopifyBillingCharge = {
  importKey: string;
  billNumber: string;
  storeName: string;
  shopId: string;
  storeUrl: string;
  chargeCategory: string;
  description: string;
  app: string;
  amount: number;
  currency: SystemCurrency;
  cycleStart?: string;
  cycleEnd?: string;
  invoiceDate?: string;
  chargeDate?: string;
};

export type ShopifyBillingSupplier = {
  id: string;
  supplierTypesId: string | null;
  displayName: string;
  companyName?: string;
  isActive: boolean;
};

export type ShopifyBillingAssignment = {
  supplierTypesId: string;
  supplierId: string;
  supplierLabel?: string;
  typeLabel?: string;
};

export type ShopifyBillingPaymentDefaults = {
  paymentMethod: ExpensePaymentMethod | '';
  paymentStatus: ExpensePaymentStatus | '';
  creditCardId: string;
};

export type ShopifyBillingParseResult = {
  charges: ShopifyBillingCharge[];
  stores: string[];
  error?: string;
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/^\ufeff/, '').replace(/[^a-z0-9]/g, '');
}

function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatLocalDate(value);
  }
  return String(value).trim();
}

function parseIsoDate(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = slash[1]!.padStart(2, '0');
    const day = slash[2]!.padStart(2, '0');
    return `${slash[3]}-${month}-${day}`;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return formatLocalDate(new Date(parsed));
}

function parseAmount(raw: string): number | null {
  const value = raw.replace(/,/g, '').trim();
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function mapHeaderRow(headers: unknown[]): Partial<Record<keyof ShopifyBillingRaw, number>> {
  const map: Partial<Record<keyof ShopifyBillingRaw, number>> = {};
  headers.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(cellText(header))];
    if (field && map[field] == null) map[field] = index;
  });
  return map;
}

export function shopifyChargeLabel(charge: Pick<ShopifyBillingCharge, 'app' | 'description'>): string {
  return charge.app.trim() || charge.description.trim();
}

export function shopifyBillingImportKey(input: {
  billNumber: string;
  chargeCategory: string;
  chargeDate?: string;
  invoiceDate?: string;
  amount: number;
  app?: string;
  description?: string;
}): string {
  return [
    input.billNumber.trim(),
    input.chargeCategory.trim(),
    input.chargeDate || input.invoiceDate || '',
    String(input.amount),
    (input.app || input.description || '').trim(),
  ].join('|');
}

export function shopifyBillingRemarks(charge: ShopifyBillingCharge): string {
  const cycle = charge.cycleStart && charge.cycleEnd
    ? `${charge.cycleStart}–${charge.cycleEnd}`
    : '';
  return [ `Shopify #${charge.billNumber}`, shopifyChargeLabel(charge), cycle ]
    .filter(Boolean)
    .join(' · ');
}

export function isShopifyBillingDuplicate(
  expense: { remarks?: string | null; dueDate?: string },
  charge: ShopifyBillingCharge,
): boolean {
  const remarks = expense.remarks ?? '';
  if (!remarks.includes(`Shopify #${charge.billNumber}`)) return false;
  const label = shopifyChargeLabel(charge);
  if (label && !remarks.includes(label)) return false;
  const due = charge.chargeDate || charge.invoiceDate;
  if (due && expense.dueDate && expense.dueDate !== due) return false;
  return true;
}

export function normalizeSupplierName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function shopifyChargeMatchQueries(charge: ShopifyBillingCharge): string[] {
  const queries: string[] = [];
  if (charge.app) queries.push(charge.app);
  if (charge.description && charge.description !== charge.app) queries.push(charge.description);
  if (charge.chargeCategory === 'subscription_fee') queries.push('Shopify');
  return queries;
}

export function scoreSupplierName(query: string, name: string): number {
  const q = normalizeSupplierName(query);
  const n = normalizeSupplierName(name);
  if (!q || !n) return 0;
  if (q === n) return 100;
  if (q.includes(n) || n.includes(q)) return 80;
  return 0;
}

export function matchShopifyBillingSupplier(
  charge: ShopifyBillingCharge,
  suppliers: ShopifyBillingSupplier[],
): ShopifyBillingSupplier | null {
  let best: { supplier: ShopifyBillingSupplier; score: number; nameLength: number } | null = null;
  for (const supplier of suppliers) {
    if (!supplier.isActive || !supplier.supplierTypesId) continue;
    const names = [supplier.displayName, supplier.companyName ?? ''].filter(Boolean);
    for (const query of shopifyChargeMatchQueries(charge)) {
      for (const name of names) {
        const score = scoreSupplierName(query, name);
        if (!score) continue;
        if (
          !best
          || score > best.score
          || (score === best.score && name.length < best.nameLength)
        ) {
          best = { supplier, score, nameLength: name.length };
        }
      }
    }
  }
  return best && best.score >= 80 ? best.supplier : null;
}

function rowFromCells(
  cells: unknown[],
  columns: Partial<Record<keyof ShopifyBillingRaw, number>>,
): ShopifyBillingRaw {
  const read = (field: keyof ShopifyBillingRaw) => {
    const index = columns[field];
    return index == null ? '' : cellText(cells[index]);
  };
  return {
    billNumber: read('billNumber'),
    storeName: read('storeName'),
    shopId: read('shopId'),
    storeUrl: read('storeUrl'),
    chargeCategory: read('chargeCategory'),
    description: read('description'),
    amount: read('amount'),
    currency: read('currency'),
    cycleStart: read('cycleStart'),
    cycleEnd: read('cycleEnd'),
    invoiceDate: read('invoiceDate'),
    app: read('app'),
    originalAmount: read('originalAmount'),
    originalCurrency: read('originalCurrency'),
    chargeDate: read('chargeDate'),
  };
}

export function parseShopifyBillingRows(rows: unknown[][]): ShopifyBillingParseResult {
  if (!rows.length) return { charges: [], stores: [], error: '檔案沒有資料' };

  let headerIndex = -1;
  let columns: Partial<Record<keyof ShopifyBillingRaw, number>> = {};
  for (let i = 0; i < Math.min(rows.length, 5); i += 1) {
    const mapped = mapHeaderRow(rows[i] ?? []);
    const hasRequired = REQUIRED_HEADERS.every((header) => mapped[HEADER_ALIASES[header]!] != null);
    if (hasRequired) {
      headerIndex = i;
      columns = mapped;
      break;
    }
  }
  if (headerIndex < 0) {
    return { charges: [], stores: [], error: '不是 Shopify 帳單匯出檔（缺少 Bill # / Charge category / Amount）' };
  }

  const charges: ShopifyBillingCharge[] = [];
  for (const cells of rows.slice(headerIndex + 1)) {
    const raw = rowFromCells(cells ?? [], columns);
    const amount = parseAmount(raw.amount);
    if (amount == null || amount <= 0) continue;
    const billNumber = raw.billNumber.trim();
    const chargeCategory = raw.chargeCategory.trim();
    if (!billNumber || !chargeCategory) continue;
    const chargeDate = parseIsoDate(raw.chargeDate);
    const invoiceDate = parseIsoDate(raw.invoiceDate);
    const charge: ShopifyBillingCharge = {
      importKey: '',
      billNumber,
      storeName: raw.storeName.trim(),
      shopId: raw.shopId.trim(),
      storeUrl: raw.storeUrl.trim(),
      chargeCategory,
      description: raw.description.trim(),
      app: raw.app.trim(),
      amount,
      currency: parseSystemCurrency(raw.currency),
      cycleStart: parseIsoDate(raw.cycleStart),
      cycleEnd: parseIsoDate(raw.cycleEnd),
      invoiceDate,
      chargeDate,
    };
    charge.importKey = shopifyBillingImportKey(charge);
    charges.push(charge);
  }

  const stores = [...new Set(charges.map((row) => row.storeName).filter(Boolean))];
  if (!charges.length) {
    return { charges: [], stores, error: '沒有可匯入的收費列' };
  }
  return { charges, stores };
}

export function parseShopifyBillingWorkbook(workbook: XLSX.WorkBook): ShopifyBillingParseResult {
  const first = workbook.SheetNames[0];
  if (!first) return { charges: [], stores: [], error: '檔案沒有工作表' };
  const sheet = workbook.Sheets[first];
  if (!sheet) return { charges: [], stores: [], error: '檔案沒有工作表' };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  return parseShopifyBillingRows(rows);
}

export function parseShopifyBillingCsvText(text: string): ShopifyBillingParseResult {
  const workbook = XLSX.read(text.replace(/^\ufeff/, ''), {
    type: 'string',
    raw: false,
    cellDates: false,
  });
  return parseShopifyBillingWorkbook(workbook);
}

export function parseShopifyBillingCsvBuffer(buffer: ArrayBuffer): ShopifyBillingParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', raw: false, cellDates: false });
  return parseShopifyBillingWorkbook(workbook);
}

export function assignShopifyBillingInstallments(
  rows: Array<{ importKey: string; supplierTypesId: string; supplierId: string; sortDate: string }>,
  existing: Array<{ groupKey?: string; installmentNumber?: number }>,
): Map<string, number> {
  const sorted = [...rows].sort((a, b) => {
    const byDate = a.sortDate.localeCompare(b.sortDate);
    if (byDate !== 0) return byDate;
    return a.importKey.localeCompare(b.importKey);
  });
  const nextByGroup = new Map<string, number>();
  const result = new Map<string, number>();
  for (const row of sorted) {
    const group = expenseGroupKey(row.supplierTypesId, row.supplierId);
    const next = nextByGroup.get(group)
      ?? nextExpenseInstallmentNumber(existing, row.supplierTypesId, row.supplierId);
    result.set(row.importKey, next);
    nextByGroup.set(group, next + 1);
  }
  return result;
}

export function shopifyChargeToExpenseInput(
  charge: ShopifyBillingCharge,
  assignment: ShopifyBillingAssignment,
  payment: ShopifyBillingPaymentDefaults,
  installmentNumber: number,
): QuotationExpenseInput {
  const billedAmount = toHkd(charge.amount, charge.currency);
  const dueDate = charge.chargeDate || charge.invoiceDate || null;
  const paid = payment.paymentStatus === 'Paid';
  const paymentDate = paid ? (charge.invoiceDate || charge.chargeDate || null) : null;
  return {
    supplierTypesId: assignment.supplierTypesId,
    supplierId: assignment.supplierId,
    installmentNumber,
    currency: charge.currency,
    billedAmount,
    dueDate,
    paymentAmount: paid ? billedAmount : 0,
    paymentDate,
    paymentMethod: paid ? (payment.paymentMethod || null) : null,
    creditCardId: paid ? expenseCreditCardId(payment.paymentMethod, payment.creditCardId) : null,
    paymentStatus: paid ? payment.paymentStatus : (payment.paymentStatus || null),
    badDebt: 0,
    remarks: shopifyBillingRemarks(charge),
  };
}
