import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RECURRING_EXPENSE_SORT_DIR,
  DEFAULT_RECURRING_EXPENSE_SORT_KEY,
  defaultRecurringExpenseSortDir,
  filterRecurringExpenses,
  nextRecurringExpenseSort,
  sortRecurringExpenseRows,
  summarizeRecurringExpenses,
  type RecurringExpenseListRow,
} from '../src/lib/recurringExpensesList.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const app = read('src/context/AppContext.tsx');
assert.match(app, /id: 'finance'/);
assert.match(app, /label: '會計財務'/);
assert.match(app, /id: 'recurring',\s*label: '自動續訂管理'/);
assert.match(app, /sub === 'invoices' \|\| sub === 'payments' \|\| sub === 'credit-cards' \|\| sub === 'by-company'/);
assert.match(app, /subModule: 'recurring'/);
assert.doesNotMatch(app, /id: 'invoices', label: '發票列表'/);
assert.doesNotMatch(app, /id: 'payments', label: '付款追蹤'/);
assert.doesNotMatch(app, /id: 'by-company', label: '按公司查看'/);
const financeMenu = app.match(/id: 'finance',[\s\S]*?subMenus: \[([\s\S]*?)\],\s*\},/);
assert.ok(financeMenu);
assert.match(financeMenu[1], /id: 'recurring'/);
assert.doesNotMatch(financeMenu[1], /credit-cards/);
assert.doesNotMatch(financeMenu[1], /invoices/);
assert.doesNotMatch(financeMenu[1], /payments/);
assert.doesNotMatch(financeMenu[1], /by-company/);

const finance = read('src/components/finance/FinanceModule.tsx');
assert.match(finance, /RecurringExpensesPage/);
assert.doesNotMatch(finance, /InvoiceList/);
assert.doesNotMatch(finance, /PaymentTracker/);
assert.doesNotMatch(finance, /CreditCardManagement/);
assert.doesNotMatch(finance, /ByCompanyView/);
assert.doesNotMatch(finance, /initialInvoices/);
assert.doesNotMatch(finance, /initialPayments/);
assert.doesNotMatch(finance, /initialCreditCards/);

const page = read('src/components/finance/RecurringExpensesPage.tsx');
assert.match(page, /useRecurringExpenses/);
assert.match(page, /DEFAULT_RECURRING_EXPENSE_SORT_KEY/);
assert.match(page, /DEFAULT_RECURRING_EXPENSE_SORT_DIR/);
assert.match(page, /下次扣款日/);
assert.match(page, /項目/);
assert.match(page, /供應商類型/);
assert.match(page, /供應商/);
assert.match(page, /信用卡/);
assert.match(page, /每期金額/);
assert.match(page, /週期/);
assert.match(page, /狀態/);
assert.match(page, /已執行/);
assert.match(page, /備註/);
assert.match(page, /aria-sort/);
assert.match(page, /依\$\{label\}排序/);
assert.match(page, /colSpan=\{10\}/);
assert.ok(page.indexOf('下次扣款日') < page.indexOf('項目'));

const hook = read('src/hooks/useRecurringExpenses.ts');
assert.match(hook, /RECURRING_EXPENSES_TABLE/);
assert.match(hook, /from\('projects'\)/);
assert.match(hook, /from\('supplier_types'\)/);
assert.match(hook, /from\('suppliers'\)/);
assert.match(hook, /from\('credit_cards'\)/);
assert.match(hook, /next_occurrence_date/);
assert.match(hook, /ascending: true/);

assert.equal(DEFAULT_RECURRING_EXPENSE_SORT_KEY, 'nextOccurrenceDate');
assert.equal(DEFAULT_RECURRING_EXPENSE_SORT_DIR, 'asc');
assert.equal(defaultRecurringExpenseSortDir('nextOccurrenceDate'), 'asc');
assert.equal(defaultRecurringExpenseSortDir('projectName'), 'asc');
assert.equal(defaultRecurringExpenseSortDir('billedAmount'), 'desc');

assert.deepEqual(nextRecurringExpenseSort('nextOccurrenceDate', 'asc', 'nextOccurrenceDate'), {
  key: 'nextOccurrenceDate',
  dir: 'desc',
});
assert.deepEqual(nextRecurringExpenseSort('nextOccurrenceDate', 'asc', 'projectName'), {
  key: 'projectName',
  dir: 'asc',
});

function row(partial: Partial<RecurringExpenseListRow> & { id: string }): RecurringExpenseListRow {
  return {
    relatedType: 'project',
    relatedId: 'p1',
    projectName: 'Alpha',
    supplierTypesId: 't1',
    supplierId: 's1',
    typeLabel: '插件',
    supplierLabel: 'Yoast',
    creditCardId: 'cc-1',
    creditCardLabel: 'HSBC · •••• 4521',
    billedAmount: 100,
    frequency: 'monthly',
    nextOccurrenceDate: '2026-09-10',
    automationRunCount: 0,
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

const rows = [
  row({
    id: 'late',
    projectName: 'Zeta',
    nextOccurrenceDate: '2026-10-01',
    billedAmount: 300,
    status: 'paused',
    frequency: 'yearly',
  }),
  row({
    id: 'soon',
    projectName: 'Beta',
    nextOccurrenceDate: '2026-09-02',
    billedAmount: 50,
    status: 'active',
    frequency: 'weekly',
    remarks: 'Ads',
  }),
  row({
    id: 'missing',
    projectName: 'Gamma',
    nextOccurrenceDate: undefined,
    billedAmount: 200,
    status: 'active',
    frequency: 'quarterly',
  }),
];

assert.deepEqual(
  sortRecurringExpenseRows(rows).map((item) => item.id),
  ['soon', 'late', 'missing'],
);
assert.deepEqual(
  sortRecurringExpenseRows(rows, 'nextOccurrenceDate', 'desc').map((item) => item.id),
  ['late', 'soon', 'missing'],
);
assert.deepEqual(
  sortRecurringExpenseRows(rows, 'projectName', 'asc').map((item) => item.id),
  ['soon', 'missing', 'late'],
);
assert.deepEqual(
  sortRecurringExpenseRows(rows, 'billedAmount', 'desc').map((item) => item.id),
  ['late', 'missing', 'soon'],
);

const filtered = filterRecurringExpenses(rows, { search: 'ads', status: 'active' });
assert.deepEqual(filtered.map((item) => item.id), ['soon']);

const stats = summarizeRecurringExpenses(rows, '2026-09-01');
assert.equal(stats.total, 3);
assert.equal(stats.active, 2);
assert.equal(stats.paused, 1);
assert.equal(stats.dueSoon, 1);

console.log('recurring expenses list: ok');
