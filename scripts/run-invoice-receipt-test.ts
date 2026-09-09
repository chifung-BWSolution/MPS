import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_COMPANY_LIST_ID_BWL,
  DEFAULT_COMPANY_LIST_ID_OTHER,
  DEFAULT_INVOICE_NOTE,
  DEFAULT_RECEIPT_NOTE,
  INVOICE_FLOOR_ERROR,
  INVOICE_LINE_ITEMS_TABLE,
  INVOICES_TABLE,
  RECEIPT_LINE_ITEMS_TABLE,
  RECEIPTS_TABLE,
  buildMainItemName,
  canViewDocumentMoney,
  defaultCompanyListId,
  documentExistsColor,
  documentYymm,
  formatDocumentMoney,
  invoiceDiscountAmount,
  invoiceFilename,
  invoiceGrossTotal,
  invoiceMeetsFloor,
  invoiceNetTotal,
  isPlaceholderName,
  nextInvoiceNo,
  nextReceiptNo,
  receiptFilename,
  receiptNetTotal,
  resolveCustomerName,
  toCents,
} from '../src/lib/invoiceReceipts.ts';
import {
  buildInvoiceReceiptHash,
  openQuotationProjectDetail,
  readInvoiceReceiptDoc,
} from '../src/lib/quotationProjectNavigation.ts';
import {
  applyPrimaryCompanyChange,
  applySlotSourceChange,
  applySlotVisibility,
  brandingFromCompany,
  parsePdfBranding,
  resolvePdfBranding,
  type CompanyBrandingSource,
} from '../src/lib/pdfBranding.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(INVOICES_TABLE, 'invoices');
assert.equal(INVOICE_LINE_ITEMS_TABLE, 'invoice_line_items');
assert.equal(RECEIPTS_TABLE, 'receipts');
assert.equal(RECEIPT_LINE_ITEMS_TABLE, 'receipt_line_items');

assert.equal(defaultCompanyListId(['bwl_event']), DEFAULT_COMPANY_LIST_ID_BWL);
assert.equal(defaultCompanyListId(['bwl_event', 'bwt_web']), DEFAULT_COMPANY_LIST_ID_BWL);
assert.equal(defaultCompanyListId(['bwt_web']), DEFAULT_COMPANY_LIST_ID_OTHER);
assert.equal(defaultCompanyListId([]), DEFAULT_COMPANY_LIST_ID_OTHER);
assert.equal(DEFAULT_COMPANY_LIST_ID_BWL, 'c1779782989086');
assert.equal(DEFAULT_COMPANY_LIST_ID_OTHER, 'c1779783081242');

assert.equal(toCents(10.005), 1001);
assert.equal(invoiceGrossTotal(1, 1000, [{ quantity: 2, price: 50 }]), 1100);
assert.equal(invoiceDiscountAmount(true, -80), 80);
assert.equal(invoiceDiscountAmount(false, 80), 0);
assert.equal(invoiceNetTotal(1, 1000, [{ quantity: 1, price: 100 }], true, 50), 1050);
assert.equal(invoiceMeetsFloor(1000, 1000), true);
assert.equal(invoiceMeetsFloor(999.99, 1000), false);
assert.equal(invoiceMeetsFloor(500, null), true);
assert.equal(receiptNetTotal(1000, [{ quantity: 1, price: 50 }], true, -20), 1030);
assert.equal(receiptNetTotal(1000, [], true, -100), 900);

const now = new Date(2026, 8, 9);
assert.equal(documentYymm(now), '2609');
assert.equal(nextInvoiceNo(141, now), '260900142');
assert.equal(nextReceiptNo(141, now), 'REC-260900142');
assert.match(nextInvoiceNo(0), /^\d{9}$/);
assert.match(nextReceiptNo(0), /^REC-\d{9}$/);

assert.equal(isPlaceholderName('N/A'), true);
assert.equal(isPlaceholderName('na'), true);
assert.equal(isPlaceholderName(' '), true);
assert.equal(isPlaceholderName('Acme Ltd'), false);
assert.equal(resolveCustomerName({ companyNameZh: 'N/A', companyNameEn: 'Acme', clientName: 'Bob' }), 'Acme');
assert.equal(resolveCustomerName({ companyNameZh: '志豐', companyNameEn: 'Acme', clientName: 'Bob' }), '志豐');
assert.equal(resolveCustomerName({ clientName: 'Bob' }), 'Bob');

const mainName = buildMainItemName({
  typeLabel: '主要收入',
  installmentNo: 2,
  incomeAmount: 5000,
  sameTypeSum: 10000,
  siteAddress: 'Tsuen Wan',
});
assert.match(mainName, /主要收入 #2 payment 50%/);
assert.match(mainName, /Contract Sum: \$10,000\.00/);
assert.match(mainName, /Site Address: Tsuen Wan/);
assert.equal(
  buildMainItemName({ typeLabel: '後加項目', installmentNo: 1, incomeAmount: 100, sameTypeSum: 0 }).includes('Site Address'),
  false,
);

assert.equal(formatDocumentMoney(1234.5), '$1,234.50');
assert.equal(invoiceFilename('250900001', 'Acme / Ltd'), 'Invoice_250900001_Acme _ Ltd.pdf');
assert.equal(receiptFilename('REC-1', 'Lee'), 'Receipt_REC-1_Lee.pdf');
assert.equal(documentExistsColor(false, 'invoice'), 'text-muted-foreground/40');
assert.equal(documentExistsColor(true, 'invoice'), 'text-blue-600');
assert.equal(documentExistsColor(true, 'receipt'), 'text-teal-600');
assert.equal(canViewDocumentMoney('designer'), false);
assert.equal(canViewDocumentMoney('accountant'), true);

const companyA: CompanyBrandingSource = {
  id: 'uuid-a',
  code: 'BWL',
  display: 'A EN',
  chineseDisplay: 'A ZH',
  logoUrl: 'https://a/logo.png',
  chopUrl: 'https://a/chop.png',
  bankNotes: 'Bank A',
};
const companyB: CompanyBrandingSource = {
  id: 'uuid-b',
  code: 'BWT',
  display: 'B EN',
  chineseDisplay: 'B ZH',
  logoUrl: 'https://b/logo.png',
  chopUrl: 'https://b/chop.png',
  bankNotes: 'Bank B',
};

assert.equal(parsePdfBranding({ version: 2 }), null);
assert.equal(parsePdfBranding('nope'), null);
const fromA = brandingFromCompany(companyA);
assert.equal(fromA.version, 1);
assert.equal(fromA.companyLogo.value.url, 'https://a/logo.png');
assert.equal(resolvePdfBranding(companyA, null).companyName.value.display, 'A EN');

const hiddenLogo = applySlotVisibility(fromA, 'companyLogo', false);
assert.equal(hiddenLogo.companyLogo.visible, false);
const swappedChop = applySlotSourceChange(hiddenLogo, 'companyChop', 'uuid-b', [companyA, companyB]);
assert.equal(swappedChop.companyChop.sourceId, 'uuid-b');
assert.equal(swappedChop.companyChop.value.url, 'https://b/chop.png');
assert.equal(swappedChop.companyLogo.visible, false);

const afterPrimary = applyPrimaryCompanyChange(swappedChop, 'uuid-a', companyB);
assert.equal(afterPrimary.companyLogo.value.url, 'https://b/logo.png');
assert.equal(afterPrimary.companyLogo.visible, false);
assert.equal(afterPrimary.companyChop.sourceId, 'uuid-b');
assert.equal(afterPrimary.companyChop.value.url, 'https://b/chop.png');

const parsed = parsePdfBranding(afterPrimary);
assert.ok(parsed);
assert.equal(parsed?.companyChop.sourceId, 'uuid-b');

const migration = read('supabase/migrations/20260909054700_create_invoices_receipts.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.invoices/);
assert.match(migration, /income_id uuid NOT NULL UNIQUE/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.receipts/);
assert.match(migration, /receipt_no text/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS chop_url text/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS bank_notes text/);
assert.doesNotMatch(migration, /bubble_id/);
assert.doesNotMatch(migration, /\bincome text\b/);

const dropSystemLabel = read('supabase/migrations/20260909073956_drop_invoice_receipt_system_label.sql');
assert.match(dropSystemLabel, /DROP COLUMN IF EXISTS system_label/);
assert.match(dropSystemLabel, /ALTER TABLE public\.invoices/);
assert.match(dropSystemLabel, /ALTER TABLE public\.receipts/);

const hook = read('src/hooks/useInvoiceReceipts.ts');
assert.match(hook, /from\(INVOICES_TABLE\)/);
assert.match(hook, /from\(RECEIPTS_TABLE\)/);
assert.doesNotMatch(hook, /\.from\(INCOMES_TABLE\)\s*\.update/);
assert.doesNotMatch(hook, /\.from\(INCOMES_TABLE\)\s*\.insert/);
assert.doesNotMatch(hook, /billed_amount\s*=/);
assert.doesNotMatch(hook, /system_label|systemLabel|systemLabelFromProjectTypes/);
assert.match(hook, /assertInvoiceFloor/);
assert.match(hook, /toErrorMessage/);
assert.match(hook, /DEFAULT_INVOICE_NOTE/);
assert.match(hook, /defaultCompanyListId/);
assert.match(hook, /project_types/);

const incomesLib = read('src/lib/quotationIncomes.ts');
assert.match(incomesLib, /installment_number|installmentNumber/);

const editor = read('src/components/quotation/InvoiceEditor.tsx');
assert.match(editor, /createInvoice/);
assert.match(editor, /updateInvoice/);
assert.doesNotMatch(editor, /updateIncome|addIncome/);
assert.doesNotMatch(editor, /系統 System|systemLabel/);

const receiptEditor = read('src/components/quotation/ReceiptEditor.tsx');
assert.match(receiptEditor, /createReceipt/);
assert.doesNotMatch(receiptEditor, /updateIncome|addIncome/);
assert.doesNotMatch(receiptEditor, /系統 System|systemLabel/);

const invoiceLib = read('src/lib/invoiceReceipts.ts');
assert.doesNotMatch(invoiceLib, /systemLabel|systemLabelFromProjectTypes/);
assert.match(invoiceLib, /defaultCompanyListId/);

const incomeTab = read('src/components/quotation/PitchingIncomeTab.tsx');
assert.match(incomeTab, /openInvoiceReceiptEditor/);
assert.match(incomeTab, /onOpenDocument/);
assert.match(incomeTab, /documentExistsColor/);
assert.match(incomeTab, /Paperclip/);
assert.doesNotMatch(incomeTab, /<FileText /);

const expenseTab = read('src/components/quotation/PitchingExpenseTab.tsx');
assert.match(expenseTab, /Paperclip/);
assert.doesNotMatch(expenseTab, /<FileText /);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /InvoiceEditor/);
assert.match(pitching, /ReceiptEditor/);
assert.match(pitching, /readInvoiceReceiptDoc/);
assert.match(pitching, /onOpenDocument=\{openDocEditor\}/);
assert.match(pitching, /setDocEditor\(\{ kind, incomeId \}\)/);

const companySettings = read('src/components/settings/CompanyManagementSettings.tsx');
assert.match(companySettings, /chopUrl/);
assert.match(companySettings, /bankNotes/);

const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
assert.ok(pkg.dependencies['@react-pdf/renderer']);
assert.equal(existsSync(join(root, 'public/fonts/NotoSansSC-Regular.ttf')), true);
assert.equal(existsSync(join(root, 'public/fonts/NotoSansSC-Bold.ttf')), true);
assert.equal(
  buildInvoiceReceiptHash('proj-1', 'projects', 'invoice', 'inc-9'),
  'quotation/projects?id=proj-1&doc=invoice&income=inc-9',
);
assert.deepEqual(
  readInvoiceReceiptDoc('#quotation/pitching?id=p1&doc=receipt&income=i2'),
  { kind: 'receipt', incomeId: 'i2' },
);

const loc = { hash: '#quotation/projects?id=proj-1&doc=invoice&income=inc-9' };
Object.defineProperty(globalThis, 'window', {
  value: { location: loc },
  configurable: true,
});
openQuotationProjectDetail('proj-1', 'confirmed');
assert.equal(loc.hash, '#quotation/projects?id=proj-1&doc=invoice&income=inc-9');

assert.ok(DEFAULT_INVOICE_NOTE.includes('2% handling charge'));
assert.ok(DEFAULT_INVOICE_NOTE.startsWith('感謝您的惠顧'));
assert.ok(DEFAULT_RECEIPT_NOTE.includes('acknowledge receipt'));
assert.ok(DEFAULT_RECEIPT_NOTE.startsWith('茲收到上述款項'));
assert.equal(INVOICE_FLOOR_ERROR.includes('discount'), true);

console.log('invoice/receipt tests passed');
