import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BAD_DEBT_SORT_DIR,
  DEFAULT_BAD_DEBT_SORT_KEY,
  DEFAULT_DUE_SOON_SORT_KEY,
  DEFAULT_DUE_SOON_WINDOW,
  daysUntilDue,
  filterBadDebts,
  filterDueSoonExpenses,
  filterPayables,
  filterReceivables,
  formatRemainingDays,
  matchesDueSoonWindow,
  nextLedgerSort,
  sortBadDebts,
  sortDueSoonExpenses,
  sortReceivables,
  summarizeBadDebts,
  summarizeDueSoonExpenses,
  summarizePayables,
  summarizeReceivables,
  toBadDebtRows,
  type FinanceExpenseRow,
  type FinanceIncomeRow,
} from '../src/lib/financeLedgers.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const app = read('src/context/AppContext.tsx');
assert.match(app, /id: 'finance'/);
assert.match(app, /label: '會計財務'/);
assert.match(app, /id: 'bv-allocation',\s*label: 'BV 分配'/);
assert.match(app, /id: 'due-soon',\s*label: '即將到期支出'/);
assert.match(app, /id: 'receivables',\s*label: '應收未收'/);
assert.match(app, /id: 'payables',\s*label: '應付未付'/);
assert.match(app, /id: 'bad-debts',\s*label: '壞帳列表'/);
assert.match(app, /id: 'recurring',\s*label: '自動續訂管理'/);

const financeMenu = app.match(/id: 'finance',[\s\S]*?subMenus: \[([\s\S]*?)\],\s*\},/);
assert.ok(financeMenu);
assert.match(financeMenu[1], /^\s*\{\s*id: 'bv-allocation'/);
assert.match(financeMenu[1], /bv-allocation/);
assert.match(financeMenu[1], /due-soon/);
assert.match(financeMenu[1], /receivables/);
assert.match(financeMenu[1], /payables/);
assert.match(financeMenu[1], /bad-debts/);
assert.match(financeMenu[1], /recurring/);
assert.doesNotMatch(financeMenu[1], /invoices/);
assert.doesNotMatch(financeMenu[1], /payments/);
assert.doesNotMatch(financeMenu[1], /by-company/);

const finance = read('src/components/finance/FinanceModule.tsx');
assert.match(finance, /BvAllocationPage/);
assert.match(finance, /DueSoonExpensesPage/);
assert.match(finance, /ReceivablesPage/);
assert.match(finance, /PayablesPage/);
assert.match(finance, /BadDebtsPage/);
assert.match(finance, /RecurringExpensesPage/);
assert.match(finance, /case 'bv-allocation'/);
assert.match(finance, /case 'receivables'/);
assert.match(finance, /case 'payables'/);
assert.match(finance, /case 'bad-debts'/);
assert.match(finance, /case 'recurring'/);
assert.doesNotMatch(finance, /InvoiceList/);
assert.doesNotMatch(finance, /PaymentTracker/);

const dueSoonPage = read('src/components/finance/DueSoonExpensesPage.tsx');
assert.match(dueSoonPage, /useFinanceExpenses/);
assert.match(dueSoonPage, /即將到期支出/);
assert.match(dueSoonPage, /expenses 表/);

const receivablesPage = read('src/components/finance/ReceivablesPage.tsx');
assert.match(receivablesPage, /useFinanceIncomes/);
assert.match(receivablesPage, /應收未收/);
assert.match(receivablesPage, /incomes 表/);

const payablesPage = read('src/components/finance/PayablesPage.tsx');
assert.match(payablesPage, /useFinanceExpenses/);
assert.match(payablesPage, /應付未付/);
assert.match(payablesPage, /expenses 表/);

const badDebtsPage = read('src/components/finance/BadDebtsPage.tsx');
assert.match(badDebtsPage, /useFinanceLedgers/);
assert.match(badDebtsPage, /壞帳列表/);
assert.match(badDebtsPage, /incomes 與 expenses 表/);

const hook = read('src/hooks/useFinanceLedgers.ts');
assert.match(hook, /INCOMES_TABLE/);
assert.match(hook, /EXPENSES_TABLE/);
assert.match(hook, /from\(INCOMES_TABLE\)/);
assert.match(hook, /from\(EXPENSES_TABLE\)/);
assert.match(hook, /quotation_client_project/);
assert.match(hook, /webandsystem_list/);
assert.match(hook, /outstanding/);
assert.match(hook, /bad_debt/);

assert.equal(DEFAULT_DUE_SOON_WINDOW, '30');
assert.equal(DEFAULT_DUE_SOON_SORT_KEY, 'dueDate');
assert.equal(DEFAULT_BAD_DEBT_SORT_KEY, 'badDebt');
assert.equal(DEFAULT_BAD_DEBT_SORT_DIR, 'desc');
assert.equal(daysUntilDue('2026-09-10', '2026-09-17'), -7);
assert.equal(daysUntilDue('2026-09-17', '2026-09-17'), 0);
assert.equal(daysUntilDue('2026-09-24', '2026-09-17'), 7);
assert.equal(formatRemainingDays(-3), '逾期 3 日');
assert.equal(formatRemainingDays(0), '今日到期');
assert.equal(matchesDueSoonWindow('2026-09-10', 100, '30', '2026-09-17'), true);
assert.equal(matchesDueSoonWindow('2026-09-10', 100, 'overdue', '2026-09-17'), true);
assert.equal(matchesDueSoonWindow('2026-10-20', 100, '30', '2026-09-17'), false);
assert.equal(matchesDueSoonWindow('2026-09-20', 0, '30', '2026-09-17'), false);

assert.deepEqual(nextLedgerSort('dueDate', 'asc', 'dueDate'), { key: 'dueDate', dir: 'desc' });
assert.deepEqual(nextLedgerSort('dueDate', 'asc', 'outstanding'), { key: 'outstanding', dir: 'desc' });

function income(partial: Partial<FinanceIncomeRow> & { id: string }): FinanceIncomeRow {
  return {
    kind: 'income',
    projectName: 'Alpha',
    clientName: 'Acme',
    typeLabel: '主要收入',
    billedAmount: 1000,
    paymentAmount: 0,
    outstanding: 1000,
    badDebt: 0,
    dueDate: '2026-09-10',
    createdAt: '',
    currency: 'HKD',
    ...partial,
  };
}

function expense(partial: Partial<FinanceExpenseRow> & { id: string }): FinanceExpenseRow {
  return {
    kind: 'expense',
    projectName: 'Site A',
    typeLabel: '插件',
    supplierLabel: 'Yoast',
    billedAmount: 200,
    paymentAmount: 0,
    outstanding: 200,
    badDebt: 0,
    dueDate: '2026-09-20',
    createdAt: '',
    currency: 'HKD',
    ...partial,
  };
}

const incomes = [
  income({ id: 'i-open', outstanding: 400, billedAmount: 500, paymentAmount: 100, dueDate: '2026-09-10' }),
  income({ id: 'i-paid', outstanding: 0, billedAmount: 300, paymentAmount: 300, dueDate: '2026-09-01' }),
  income({
    id: 'i-bad',
    outstanding: 0,
    billedAmount: 800,
    paymentAmount: 0,
    badDebt: 800,
    projectName: 'Zeta',
    dueDate: '2026-08-01',
  }),
  income({ id: 'i-future', outstanding: 250, billedAmount: 250, dueDate: '2026-10-01', remarks: 'retainer' }),
];

const expenses = [
  expense({ id: 'e-soon', outstanding: 80, billedAmount: 80, dueDate: '2026-09-20' }),
  expense({ id: 'e-overdue', outstanding: 120, billedAmount: 150, paymentAmount: 30, dueDate: '2026-09-01' }),
  expense({ id: 'e-later', outstanding: 90, billedAmount: 90, dueDate: '2026-11-01' }),
  expense({ id: 'e-paid', outstanding: 0, billedAmount: 50, paymentAmount: 50, dueDate: '2026-09-18' }),
  expense({
    id: 'e-bad',
    outstanding: 20,
    billedAmount: 200,
    paymentAmount: 0,
    badDebt: 180,
    supplierLabel: 'Ads Co',
    dueDate: '2026-08-15',
  }),
];

assert.deepEqual(
  filterDueSoonExpenses(expenses, { window: '30', asOf: '2026-09-17' }).map((row) => row.id),
  ['e-soon', 'e-overdue', 'e-bad'],
);
assert.deepEqual(
  filterDueSoonExpenses(expenses, { window: 'overdue', asOf: '2026-09-17' }).map((row) => row.id),
  ['e-overdue', 'e-bad'],
);
assert.deepEqual(
  sortDueSoonExpenses(
    filterDueSoonExpenses(expenses, { window: '30', asOf: '2026-09-17' }),
    'dueDate',
    'asc',
    '2026-09-17',
  ).map((row) => row.id),
  ['e-bad', 'e-overdue', 'e-soon'],
);

const dueStats = summarizeDueSoonExpenses(expenses, '2026-09-17');
assert.equal(dueStats.overdue, 2);
assert.equal(dueStats.dueIn7, 1);
assert.equal(dueStats.dueIn30, 1);
assert.equal(dueStats.outstandingTotal, 220);

assert.deepEqual(filterReceivables(incomes).map((row) => row.id), ['i-open', 'i-future']);
assert.deepEqual(
  filterReceivables(incomes, { overdue: true, asOf: '2026-09-17' }).map((row) => row.id),
  ['i-open'],
);
assert.deepEqual(
  filterReceivables(incomes, { search: 'retainer' }).map((row) => row.id),
  ['i-future'],
);
assert.deepEqual(sortReceivables(filterReceivables(incomes), 'outstanding', 'desc').map((row) => row.id), [
  'i-open',
  'i-future',
]);

const recvStats = summarizeReceivables(incomes, '2026-09-17');
assert.equal(recvStats.count, 2);
assert.equal(recvStats.outstanding, 650);
assert.equal(recvStats.overdue, 1);

assert.deepEqual(filterPayables(expenses).map((row) => row.id), [
  'e-soon',
  'e-overdue',
  'e-later',
  'e-bad',
]);
const payStats = summarizePayables(expenses, '2026-09-17');
assert.equal(payStats.count, 4);
assert.equal(payStats.outstanding, 310);
assert.equal(payStats.overdue, 2);

const badRows = toBadDebtRows(incomes, expenses);
assert.deepEqual(badRows.map((row) => `${row.kind}:${row.id}`), ['income:i-bad', 'expense:e-bad']);
assert.deepEqual(filterBadDebts(badRows, { kind: 'expense' }).map((row) => row.id), ['e-bad']);
assert.deepEqual(sortBadDebts(badRows).map((row) => row.id), ['i-bad', 'e-bad']);
const badStats = summarizeBadDebts(badRows);
assert.equal(badStats.count, 2);
assert.equal(badStats.income, 800);
assert.equal(badStats.expense, 180);
assert.equal(badStats.total, 980);

console.log('finance ledgers: ok');
