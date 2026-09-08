import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPENSES_TABLE,
  EXPENSE_PAYMENT_RECORDS_BUCKET,
  EXPENSE_RELATED_TYPE_PROJECT,
  EXPENSE_PAYMENT_METHOD_CREDIT_CARD,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_PAYMENT_STATUSES,
  expenseCreditCardId,
  BULK_EXPENSE_BILLED_TOTAL_MISMATCH,
  BULK_DATE_MODE_LABELS,
  DEFAULT_BULK_DATE_MODE,
  DEFAULT_BULK_EXPENSE_INSTALLMENT_COUNT,
  billedSumMatchesTotal,
  distributeDueDates,
  computeOutstanding,
  defaultBulkDateRange,
  expenseGroupKey,
  expensePaymentRecordStoragePath,
  findExpenseInstallmentCollision,
  formatExpenseDate,
  formatExpenseMoney,
  formatMoneyInput,
  groupExpensesByType,
  hasFilledPaymentAmount,
  nextExpenseInstallmentNumber,
  parseInstallmentNumber,
  parseMoney,
  planBulkExpenseInstallmentNumbers,
  splitBilledAmounts,
  spreadDueDates,
  summarizeExpenses,
  validateBulkExpenseInput,
  validateExpenseInput,
} from '../src/lib/quotationExpenses.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(EXPENSES_TABLE, 'expenses');
assert.equal(EXPENSE_PAYMENT_RECORDS_BUCKET, 'expense-payment-records');
assert.equal(EXPENSE_RELATED_TYPE_PROJECT, 'project');
assert.equal(expenseGroupKey('type-1', 'sup-1'), 'type-1::sup-1');
assert.equal(
  expensePaymentRecordStoragePath('proj-1', '收據 (v2).pdf', 'abc'),
  'proj-1/abc/v2.pdf',
);
assert.deepEqual([...EXPENSE_PAYMENT_METHODS], ['Transfer', 'Cash', 'Cheque', 'Credit Card']);
assert.equal(EXPENSE_PAYMENT_METHOD_CREDIT_CARD, 'Credit Card');
assert.equal(expenseCreditCardId('Credit Card', ' cc-1 '), 'cc-1');
assert.equal(expenseCreditCardId('Transfer', 'cc-1'), null);
assert.deepEqual([...EXPENSE_PAYMENT_STATUSES], ['Pending Check', 'Paid', 'Not Paid']);

assert.equal(hasFilledPaymentAmount(''), false);
assert.equal(hasFilledPaymentAmount('0'), true);
assert.equal(parseMoney('12000.5'), 12000.5);
assert.equal(parseInstallmentNumber('2'), 2);
assert.equal(computeOutstanding(10000, 3000, 500), 6500);
assert.equal(
  nextExpenseInstallmentNumber(
    [
      { groupKey: 't1::s1', installmentNumber: 2 },
      { groupKey: 't1::s2', installmentNumber: 5 },
    ],
    't1',
    's1',
  ),
  3,
);
assert.equal(nextExpenseInstallmentNumber([], 't1', 's1'), 1);
assert.equal(DEFAULT_BULK_EXPENSE_INSTALLMENT_COUNT, 2);
assert.equal(DEFAULT_BULK_DATE_MODE, 'monthly');
assert.equal(BULK_DATE_MODE_LABELS.monthly, '每月重複');
assert.deepEqual(defaultBulkDateRange('2026-03-01', '2026-09-01'), { start: '2026-03-01', end: '2026-09-01' });
assert.deepEqual(spreadDueDates('2026-01-01', '2026-04-01', 2), ['2026-01-01', '2026-04-01']);
assert.deepEqual(
  distributeDueDates({ mode: 'monthly', start: '2026-01-31', count: 3 }),
  ['2026-01-31', '2026-02-28', '2026-03-31'],
);
assert.deepEqual(splitBilledAmounts(10000, 3), [3333.33, 3333.33, 3333.34]);
assert.equal(formatMoneyInput(3333.34), '3333.34');
assert.deepEqual(
  planBulkExpenseInstallmentNumbers({
    projectRows: [{ groupKey: 't1::s1', installmentNumber: 2 }],
    supplierTypesId: 't1',
    supplierId: 's1',
    count: 2,
  }),
  [3, 4],
);
assert.equal(
  findExpenseInstallmentCollision(
    [{ id: 'x', groupKey: 't1::s1', installmentNumber: 2 }],
    't1',
    's1',
    [2, 3],
  ),
  2,
);
assert.equal(
  findExpenseInstallmentCollision(
    [{ id: 'x', groupKey: 't1::s1', installmentNumber: 2 }],
    't1',
    's1',
    [2, 3],
    ['x'],
  ),
  null,
);

assert.equal(validateBulkExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  totalAmount: '',
  installmentCount: '2',
  rows: [
    { dueDate: '2026-01-01', installmentNumber: '1', billedAmount: '100' },
    { dueDate: '2026-02-01', installmentNumber: '2', billedAmount: '100' },
  ],
}), null);
assert.equal(validateBulkExpenseInput({
  supplierTypesId: '',
  supplierId: 's1',
  totalAmount: '',
  installmentCount: '1',
  rows: [{ dueDate: '2026-01-01', installmentNumber: '1', billedAmount: '100' }],
}), '請選擇支出類型');
assert.equal(validateBulkExpenseInput({
  supplierTypesId: 't1',
  supplierId: '',
  totalAmount: '',
  installmentCount: '1',
  rows: [{ dueDate: '2026-01-01', installmentNumber: '1', billedAmount: '100' }],
}), '請選擇供應商');
assert.equal(validateBulkExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  totalAmount: '200',
  installmentCount: '2',
  rows: [
    { dueDate: '2026-01-01', installmentNumber: '1', billedAmount: '80' },
    { dueDate: '2026-02-01', installmentNumber: '2', billedAmount: '100' },
  ],
}), BULK_EXPENSE_BILLED_TOTAL_MISMATCH);
assert.equal(billedSumMatchesTotal('200', [{ billedAmount: '100' }, { billedAmount: '100' }]), true);
assert.equal(validateBulkExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  totalAmount: '',
  installmentCount: '1',
  rows: [{ dueDate: '', installmentNumber: '1', billedAmount: '100' }],
}), '第 1 期請選擇到期日');
assert.equal(validateBulkExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  totalAmount: '',
  installmentCount: '1',
  rows: [{ dueDate: '2026-01-01', installmentNumber: '1', billedAmount: '' }],
}), '第 1 期請填寫應付金額');
assert.equal(formatExpenseMoney(1200), '$1,200.00 HKD');
assert.equal(formatExpenseDate('2026-09-04'), '2026/09/04');

assert.equal(validateExpenseInput({
  supplierTypesId: '',
  supplierId: 's1',
  installmentNumber: '1',
  billedAmount: '100',
  paymentAmount: '0',
  badDebt: '0',
  paymentMethod: '',
  paymentStatus: 'Not Paid',
}), '請選擇支出類型');
assert.equal(validateExpenseInput({
  supplierTypesId: 't1',
  supplierId: '',
  installmentNumber: '1',
  billedAmount: '100',
  paymentAmount: '0',
  badDebt: '0',
  paymentMethod: '',
  paymentStatus: '',
}), '請選擇供應商');
assert.equal(validateExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '',
  paymentDate: '',
  badDebt: '0',
  paymentMethod: '',
  paymentStatus: '',
}), null);
assert.equal(validateExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '500',
  paymentDate: '',
  paymentMethod: 'Transfer',
  paymentStatus: 'Paid',
}), '請選擇付款日期');
assert.equal(validateExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '500',
  paymentDate: '2026-09-10',
  paymentMethod: 'Transfer',
  paymentStatus: 'Paid',
}), null);
assert.equal(validateExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '500',
  paymentDate: '2026-09-10',
  paymentMethod: 'Credit Card',
  paymentStatus: 'Paid',
}), '請選擇信用卡');
assert.equal(validateExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '500',
  paymentDate: '2026-09-10',
  paymentMethod: 'Credit Card',
  creditCardId: 'cc-1',
  paymentStatus: 'Paid',
}), null);

assert.deepEqual(
  summarizeExpenses([
    {
      id: 'a',
      relatedType: 'project',
      relatedId: 'p1',
      supplierTypesId: 't1',
      supplierId: 's1',
      typeLabel: '網站插件',
      supplierLabel: 'Yoast',
      groupKey: 't1::s1',
      billedAmount: 1000,
      paymentAmount: 400,
      paymentStatus: 'Pending Check',
      outstanding: 600,
      badDebt: 0,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'b',
      relatedType: 'project',
      relatedId: 'p1',
      supplierTypesId: 't2',
      supplierId: 's2',
      typeLabel: '網站工具',
      supplierLabel: 'Ahrefs',
      groupKey: 't2::s2',
      billedAmount: 2000,
      paymentAmount: 0,
      paymentStatus: 'Not Paid',
      outstanding: 1800,
      badDebt: 200,
      createdAt: '',
      updatedAt: '',
    },
  ]),
  { billed: 3000, paid: 400, outstanding: 2400, badDebt: 200 },
);

const grouped = groupExpensesByType([
  {
    id: 'b',
    relatedType: 'project',
    relatedId: 'p1',
    supplierTypesId: 't2',
    supplierId: 's2',
    typeLabel: '網站工具',
    supplierLabel: 'Ahrefs',
    groupKey: 't2::s2',
    billedAmount: 800,
    paymentAmount: 200,
    outstanding: 600,
    badDebt: 0,
    createdAt: '2026-09-02',
    updatedAt: '2026-09-02',
  },
  {
    id: 'a1',
    relatedType: 'project',
    relatedId: 'p1',
    supplierTypesId: 't1',
    supplierId: 's1',
    typeLabel: '網站插件',
    supplierLabel: 'Yoast',
    groupKey: 't1::s1',
    billedAmount: 1000,
    paymentAmount: 400,
    outstanding: 600,
    badDebt: 0,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'a2',
    relatedType: 'project',
    relatedId: 'p1',
    supplierTypesId: 't1',
    supplierId: 's1',
    typeLabel: '網站插件',
    supplierLabel: 'Yoast',
    groupKey: 't1::s1',
    billedAmount: 2000,
    paymentAmount: 0,
    outstanding: 1800,
    badDebt: 200,
    createdAt: '2026-09-03',
    updatedAt: '2026-09-03',
  },
]);
assert.deepEqual(grouped.map((group) => group.typeLabel), ['網站工具', '網站插件']);
assert.deepEqual(grouped[1].rows.map((row) => row.id), ['a1', 'a2']);
assert.deepEqual(grouped[1].summary, { billed: 3000, paid: 400, outstanding: 2400, badDebt: 200 });
assert.deepEqual(grouped[0].summary, { billed: 800, paid: 200, outstanding: 600, badDebt: 0 });

const migration = read('supabase/migrations/20260907043040_create_expenses.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.expenses/);
assert.match(migration, /related_type text NOT NULL DEFAULT 'project'/);
assert.match(migration, /related_id uuid NOT NULL/);
assert.match(migration, /REFERENCES public\.projects\(id\) ON DELETE RESTRICT/);
assert.match(migration, /supplier_types_id uuid NOT NULL/);
assert.match(migration, /REFERENCES public\.supplier_types\(id\) ON DELETE RESTRICT/);
assert.match(migration, /supplier_id text NOT NULL/);
assert.match(migration, /REFERENCES public\.suppliers\(id\) ON DELETE RESTRICT/);
assert.match(migration, /installment_number integer/);
assert.match(migration, /billed_amount numeric\(14, 2\)/);
assert.match(migration, /payment_amount numeric\(14, 2\)/);
assert.match(migration, /'Transfer', 'Cash', 'Cheque'/);
assert.match(migration, /'Pending Check', 'Paid', 'Not Paid'/);
assert.match(migration, /outstanding numeric\(14, 2\) GENERATED ALWAYS AS/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /'expense-payment-records'/);
assert.match(migration, /trg_expenses_supplier_type_match/);
assert.doesNotMatch(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.expenses TO anon/);

const hook = read('src/hooks/useQuotationExpenses.ts');
assert.match(hook, /EXPENSES_TABLE/);
assert.match(hook, /EXPENSE_PAYMENT_RECORDS_BUCKET/);
assert.match(hook, /related_type/);
assert.match(hook, /related_id/);
assert.match(hook, /supplier_types_id/);
assert.match(hook, /supplier_id/);
assert.match(hook, /quotation_client/);
assert.match(hook, /resolveExpenseProjectId/);
assert.match(hook, /uploadExpensePaymentRecordFile/);
assert.match(hook, /const addExpense/);
assert.match(hook, /const updateExpense/);
assert.match(hook, /const deleteExpense/);
assert.match(hook, /const saveBulkExpenses/);
assert.match(hook, /credit_card_id/);
assert.match(hook, /credit_cards!expenses_credit_card_id_fkey/);
assert.match(hook, /expenseCreditCardId/);

const tab = read('src/components/quotation/PitchingExpenseTab.tsx');
assert.match(tab, /useQuotationExpenses/);
assert.match(tab, /addExpense/);
assert.match(tab, /updateExpense/);
assert.match(tab, /deleteExpense/);
assert.match(tab, /DeleteConfirmModal/);
assert.match(tab, /rounded-full/);
assert.match(tab, /ariaLabel="付款方式"/);
assert.match(tab, /信用卡 Credit card/);
assert.match(tab, /選擇信用卡/);
assert.match(tab, /useCreditCards/);
assert.match(tab, /isCreditCardPaymentMethod/);
assert.match(tab, /ariaLabel="付款狀態"/);
assert.match(tab, /aria-label="備註"/);
assert.match(tab, /aria-label="付款紀錄檔案"/);
assert.match(tab, /paymentRecordAction/);
assert.match(tab, /新增單項支出/);
assert.match(tab, /新增整項支出/);
assert.match(tab, /編輯整項/);
assert.match(tab, /PitchingBulkExpenseDialog/);
assert.match(tab, /signedDate/);
assert.match(tab, /handoverDate/);
assert.match(tab, /saveBulkExpenses/);
assert.match(tab, /nextExpenseInstallmentNumber/);
assert.match(tab, /款項資訊/);
assert.match(tab, /完成付款/);
assert.match(tab, /於完成付款時填寫/);
assert.match(tab, /aria-label="付款日期"/);
assert.match(tab, /groupExpensesByType/);
assert.match(tab, /應付合計/);
assert.match(tab, /查看附件/);
assert.match(tab, /paymentRecordFileUrl/);
assert.match(tab, /FileText/);
assert.match(tab, /供應商 Supplier/);
assert.match(tab, /SearchableSelect/);
assert.match(tab, /useSupplierTypes/);
assert.match(tab, /useWebPageSuppliers/);
assert.doesNotMatch(tab, /應收合計/);
assert.doesNotMatch(tab, /完成收款/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /PitchingExpenseTab/);
assert.match(pitching, /id: 'expense', label: '支出'/);
assert.match(pitching, /<PitchingExpenseTab/);
assert.match(pitching, /activeTab === 'expense'/);

const bulk = read('src/components/quotation/PitchingBulkExpenseDialog.tsx');
assert.match(bulk, /新增整項支出/);
assert.match(bulk, /編輯整項支出/);
assert.match(bulk, /DEFAULT_BULK_EXPENSE_INSTALLMENT_COUNT/);
assert.match(bulk, /DEFAULT_BULK_DATE_MODE/);
assert.match(bulk, /distributeDueDates/);
assert.match(bulk, /planBulkExpenseInstallmentNumbers/);
assert.match(bulk, /mode="range"/);
assert.match(bulk, /mode="single"/);
assert.match(bulk, /setPickingEnd\(true\)/);
assert.match(bulk, /to: undefined/);
assert.match(bulk, /triggerDate/);
assert.match(bulk, /BULK_EXPENSE_BILLED_TOTAL_MISMATCH/);
assert.match(bulk, /billedMismatch/);
assert.match(bulk, /role="alert"/);
assert.match(bulk, /aria-label="按日期分期"/);
assert.match(bulk, /BULK_DATE_MODE_LABELS/);
assert.match(bulk, /按日期分期 Date distribution/);
assert.match(bulk, /開始日期 Start date/);
assert.match(bulk, /aria-label="日期範圍"/);
assert.match(bulk, /aria-label="開始日期"/);
assert.match(bulk, /aria-label="總金額"/);
assert.match(bulk, /aria-label="期數數量"/);
assert.match(bulk, /到期日 Due date \*/);
assert.match(bulk, /應付金額 Billed \*/);
assert.match(bulk, /供應商 Supplier \*/);
assert.match(bulk, /aria-label="支出類型"/);
assert.doesNotMatch(bulk, /總金額 Total \*/);
assert.doesNotMatch(bulk, /日期範圍 Date range \*/);
assert.doesNotMatch(bulk, /應收合計/);

const project = read('src/components/quotation/ProjectModule.tsx');
assert.match(project, /PitchingDetail/);

console.log('quotation expenses: ok');
