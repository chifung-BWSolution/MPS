import {
  brandingFromCompany,
  type CompanyBrandingSource,
  type PdfBranding,
} from '@/lib/pdfBranding';

export const INVOICES_TABLE = 'invoices';
export const INVOICE_LINE_ITEMS_TABLE = 'invoice_line_items';
export const RECEIPTS_TABLE = 'receipts';
export const RECEIPT_LINE_ITEMS_TABLE = 'receipt_line_items';

export const DEFAULT_COMPANY_LIST_ID_BWL = 'c1779782989086';
export const DEFAULT_COMPANY_LIST_ID_OTHER = 'c1779783081242';

export const INVOICE_FLOOR_ERROR =
  'Main item and sub items total must be at least the related income amount. Use discount to reduce the invoice below income amount.';

export const DEFAULT_INVOICE_NOTE =
  '感謝您的惠顧。為確保工程能如期優質交付，敬請於到期日（即銀行收款日）或之前處理此發票。逾期發票將每月加收 2% 手續費，完工日期亦會相應延遲。 Thank you for your business. We do expect payment on time to ensure quality delivery of works, so please process this invoice on or before the due date (i.e. the payment receivable date in Bank). An additional 2% handling charge will be billed monthly on late invoices, and the finish date would be delayed accordingly.';

export const DEFAULT_RECEIPT_NOTE =
  '茲收到上述款項。感謝您的及時付款。 We hereby acknowledge receipt of the above payment. Thank you for your prompt settlement.';

export const RECEIPT_PAYMENT_METHODS = [
  'Bank Transfer',
  'Cheque',
  'Cash',
  'Credit Card',
  'FPS',
  'Other',
] as const;

export type ReceiptPaymentMethod = (typeof RECEIPT_PAYMENT_METHODS)[number];

export const RECEIPT_PAYMENT_METHOD_LABELS: Record<ReceiptPaymentMethod, string> = {
  'Bank Transfer': '銀行轉帳 Bank Transfer',
  Cheque: '支票 Cheque',
  Cash: '現金 Cash',
  'Credit Card': '信用卡 Credit Card',
  FPS: '轉數快 FPS',
  Other: '其他 Other',
};

export const FINANCIAL_MASK = '—';

export type InvoiceLineItem = {
  id?: string;
  itemName: string;
  quantity: number;
  price: number;
  amount: number;
};

export type InvoiceForm = {
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  billToName: string;
  projectName: string;
  mainItemName: string;
  mainItemQty: number;
  mainItemPrice: number;
  enableDiscount: boolean;
  discountDescription: string;
  discountAmount: number;
  note: string;
  companyId: string | null;
  pdfBranding: PdfBranding | null;
};

export type ReceiptForm = {
  receiptNo: string;
  receiptDate: string;
  paymentDate: string;
  receivedFromName: string;
  projectName: string;
  amountReceived: number;
  paymentMethod: ReceiptPaymentMethod | '';
  notes: string;
  enablePriceDifference: boolean;
  priceDifference: number;
  priceDifferenceDescription: string;
  companyId: string | null;
  invoiceId: string | null;
  pdfBranding: PdfBranding | null;
};

export type IncomeDocumentSnippet = {
  id: string;
  amount: number | null;
  installmentNo?: number;
  paymentStatus?: string;
  type: string;
};

export type SavedInvoice = InvoiceForm & {
  id: string;
  incomeId: string;
  mainItemAmount: number;
  totalAmount: number;
  lines: InvoiceLineItem[];
  income: IncomeDocumentSnippet;
  createdAt: string;
  updatedAt: string;
};

export type SavedReceipt = ReceiptForm & {
  id: string;
  incomeId: string;
  lines: InvoiceLineItem[];
  income: IncomeDocumentSnippet;
  createdAt: string;
  updatedAt: string;
};

export function isReceiptPaymentMethod(value: string | null | undefined): value is ReceiptPaymentMethod {
  return RECEIPT_PAYMENT_METHODS.includes(value as ReceiptPaymentMethod);
}

export function defaultCompanyListId(projectTypes: string[] | null | undefined): string {
  return (projectTypes ?? []).includes('bwl_event')
    ? DEFAULT_COMPANY_LIST_ID_BWL
    : DEFAULT_COMPANY_LIST_ID_OTHER;
}

export function toCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function lineAmount(quantity: number, price: number): number {
  return fromCents(toCents(quantity) * toCents(price) / 100);
}

export function invoiceMainAmount(qty: number, price: number): number {
  return lineAmount(qty, price);
}

export function invoiceSubTotal(lines: Array<{ quantity: number; price: number; amount?: number }>): number {
  return fromCents(lines.reduce((sum, line) => {
    const amount = line.amount != null && Number.isFinite(line.amount)
      ? line.amount
      : lineAmount(line.quantity, line.price);
    return sum + toCents(amount);
  }, 0));
}

export function invoiceGrossTotal(
  mainQty: number,
  mainPrice: number,
  lines: Array<{ quantity: number; price: number; amount?: number }>,
): number {
  return fromCents(toCents(invoiceMainAmount(mainQty, mainPrice)) + toCents(invoiceSubTotal(lines)));
}

export function invoiceDiscountAmount(enableDiscount: boolean, discountAmount: number | null | undefined): number {
  if (!enableDiscount) return 0;
  const raw = Number(discountAmount ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.abs(raw);
}

export function invoiceNetTotal(
  mainQty: number,
  mainPrice: number,
  lines: Array<{ quantity: number; price: number; amount?: number }>,
  enableDiscount: boolean,
  discountAmount: number | null | undefined,
): number {
  return fromCents(
    toCents(invoiceGrossTotal(mainQty, mainPrice, lines))
    - toCents(invoiceDiscountAmount(enableDiscount, discountAmount)),
  );
}

export function invoiceMeetsFloor(grossTotal: number, incomeAmount: number | null | undefined): boolean {
  if (incomeAmount == null || !Number.isFinite(incomeAmount)) return true;
  return toCents(grossTotal) >= toCents(incomeAmount);
}

export function receiptNetTotal(
  amountReceived: number,
  lines: Array<{ quantity: number; price: number; amount?: number }>,
  enablePriceDifference: boolean,
  priceDifference: number | null | undefined,
): number {
  const diff = enablePriceDifference && Number.isFinite(Number(priceDifference))
    ? Number(priceDifference)
    : 0;
  return fromCents(
    toCents(amountReceived || 0) + toCents(invoiceSubTotal(lines)) + toCents(diff),
  );
}

function padSeq(count: number): string {
  return String(Math.max(1, count + 1)).padStart(5, '0');
}

export function documentYymm(now = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

export function nextInvoiceNo(existingCount: number, now = new Date()): string {
  return `${documentYymm(now)}${padSeq(existingCount)}`;
}

export function nextReceiptNo(existingCount: number, now = new Date()): string {
  return `REC-${documentYymm(now)}${padSeq(existingCount)}`;
}

const NAME_PLACEHOLDERS = new Set(['n/a', 'na', 'null', '—', '-']);

export function isPlaceholderName(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return true;
  return NAME_PLACEHOLDERS.has(trimmed.toLowerCase());
}

export function resolveCustomerName(input: {
  companyNameZh?: string | null;
  companyNameEn?: string | null;
  clientName?: string | null;
}): string {
  for (const value of [input.companyNameZh, input.companyNameEn, input.clientName]) {
    if (!isPlaceholderName(value)) return value!.trim();
  }
  return '';
}

export function formatDocumentMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDocumentDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildMainItemName(input: {
  typeLabel: string;
  installmentNo?: number | null;
  incomeAmount: number;
  sameTypeSum: number;
  siteAddress?: string | null;
}): string {
  const pct = input.sameTypeSum > 0
    ? Math.round((input.incomeAmount / input.sameTypeSum) * 100)
    : 0;
  const installment = input.installmentNo != null ? `#${input.installmentNo}` : '#';
  const lines = [
    `${input.typeLabel} ${installment} payment ${pct}%`,
    `Contract Sum: ${formatDocumentMoney(input.sameTypeSum)}`,
  ];
  const site = input.siteAddress?.trim();
  if (site) lines.push(`Site Address: ${site}`);
  return lines.join('\n');
}

export function composeCompanyBankNotes(input: {
  bankNotes?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
}): string {
  const notes = input.bankNotes?.trim();
  if (notes) return notes;
  return [input.bankName?.trim(), input.bankAccount?.trim()].filter(Boolean).join('\n');
}

export function companyToBrandingSource(input: {
  uuid: string;
  companyCode?: string;
  companyNameEn?: string;
  companyNameZh?: string;
  logoUrl?: string | null;
  chopUrl?: string | null;
  bankNotes?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  address?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}): CompanyBrandingSource {
  return {
    id: input.uuid,
    code: input.companyCode ?? null,
    display: input.companyNameEn?.trim() || null,
    chineseDisplay: input.companyNameZh?.trim() || null,
    logoUrl: input.logoUrl?.trim() || null,
    chopUrl: input.chopUrl?.trim() || null,
    bankNotes: composeCompanyBankNotes(input) || null,
    address: input.address?.trim() || null,
    phone: input.contactPhone?.trim() || null,
  };
}

export function brandingForCompany(company: CompanyBrandingSource | null): PdfBranding {
  return brandingFromCompany(company);
}

export function invoiceFilename(invoiceNo: string, billToName: string): string {
  const safeNo = invoiceNo.trim() || 'draft';
  const safeName = (billToName.trim() || 'customer').replace(/[\\/:*?"<>|]+/g, '_');
  return `Invoice_${safeNo}_${safeName}.pdf`;
}

export function receiptFilename(receiptNo: string, receivedFrom: string): string {
  const safeNo = receiptNo.trim() || 'draft';
  const safeName = (receivedFrom.trim() || 'customer').replace(/[\\/:*?"<>|]+/g, '_');
  return `Receipt_${safeNo}_${safeName}.pdf`;
}

export function documentExistsColor(exists: boolean, kind: 'invoice' | 'receipt'): string {
  if (!exists) return 'text-muted-foreground/40';
  return kind === 'invoice' ? 'text-blue-600' : 'text-teal-600';
}

export function canViewDocumentMoney(role: string | null | undefined): boolean {
  return role !== 'designer';
}

export function emptyLine(): InvoiceLineItem {
  return { itemName: '', quantity: 1, price: 0, amount: 0 };
}
