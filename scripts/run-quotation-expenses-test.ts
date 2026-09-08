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
  CREATE_RECURRING_EXPENSE_RPC,
  RECURRING_EXPENSES_TABLE,
  RECURRING_EXPENSE_FREQUENCIES,
  expenseCreditCardId,
  isMissingRecurringRelationship,
  isRecurringExpenseFrequency,
  nextRecurringDueDate,
  paidRecurringExpenseFields,
  previewRecurringDueDates,
  recurringSettingsFromRows,
  defaultGroupRecurringNextDate,
  latestExpenseDueDate,
  validateRecurringSettingInput,
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
  formatRecurringSettingDetails,
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
assert.equal(validateExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '100',
  paymentDate: '2026-09-04',
  paymentMethod: 'Transfer',
  paymentStatus: 'Paid',
  frequency: 'monthly',
}), '週期支出須選擇信用卡');
assert.equal(validateExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '100',
  paymentDate: '2026-09-04',
  paymentMethod: 'Credit Card',
  creditCardId: 'cc-1',
  paymentStatus: 'Paid',
  frequency: 'monthly',
}), null);
assert.equal(validateExpenseInput({
  supplierTypesId: 't1',
  supplierId: 's1',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '100',
  paymentDate: '2026-09-04',
  paymentMethod: 'Credit Card',
  creditCardId: 'cc-1',
  paymentStatus: 'Paid',
  frequency: 'daily',
}), '請選擇有效週期');

assert.equal(RECURRING_EXPENSES_TABLE, 'recurring_expenses');
assert.equal(CREATE_RECURRING_EXPENSE_RPC, 'create_recurring_expense');
assert.deepEqual([...RECURRING_EXPENSE_FREQUENCIES], ['weekly', 'monthly', 'quarterly', 'yearly']);
assert.equal(isRecurringExpenseFrequency('monthly'), true);
assert.equal(isRecurringExpenseFrequency('even'), false);
assert.equal(nextRecurringDueDate('weekly', '2026-01-07'), '2026-01-14');
assert.equal(nextRecurringDueDate('monthly', '2026-01-31'), '2026-02-28');
assert.equal(nextRecurringDueDate('monthly', '2026-02-28', '2026-01-31'), '2026-03-31');
assert.equal(nextRecurringDueDate('quarterly', '2026-01-31'), '2026-04-30');
assert.equal(nextRecurringDueDate('yearly', '2024-02-29'), '2025-02-28');
assert.deepEqual(
  previewRecurringDueDates('monthly', '2026-01-31', 3),
  ['2026-01-31', '2026-02-28', '2026-03-31'],
);
assert.equal(
  isMissingRecurringRelationship(
    "Could not find a relationship between 'expenses' and 'recurring_expenses' in the schema cache",
  ),
  true,
);
assert.equal(isMissingRecurringRelationship('missing project'), false);
assert.deepEqual(paidRecurringExpenseFields(1200, '2026-09-08'), {
  paymentAmount: 1200,
  paymentDate: '2026-09-08',
  paymentMethod: 'Credit Card',
  paymentStatus: 'Paid',
  badDebt: 0,
});
let catchUp = '2026-01-31';
const catchUpDates = [catchUp];
for (let i = 0; i < 2; i += 1) {
  const next = nextRecurringDueDate('monthly', catchUp, '2026-01-31');
  assert.ok(next);
  catchUp = next;
  catchUpDates.push(catchUp);
}
assert.deepEqual(catchUpDates, ['2026-01-31', '2026-02-28', '2026-03-31']);

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

const recurringGroup = recurringSettingsFromRows([
  {
    id: 'r1',
    relatedType: 'project',
    relatedId: 'p1',
    supplierTypesId: 't1',
    supplierId: 's1',
    typeLabel: '網站',
    supplierLabel: 'Bubble',
    groupKey: 't1::s1',
    billedAmount: 368,
    paymentAmount: 368,
    outstanding: 0,
    badDebt: 0,
    creditCardLabel: "Franco's card",
    recurringExpenseId: 'rec-1',
    recurringFrequency: 'monthly',
    recurringStatus: 'active',
    recurringNextOccurrenceDate: '2026-09-20',
    recurringAutomationRunCount: 4,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'r2',
    relatedType: 'project',
    relatedId: 'p1',
    supplierTypesId: 't1',
    supplierId: 's1',
    typeLabel: '網站',
    supplierLabel: 'Bubble',
    groupKey: 't1::s1',
    billedAmount: 368,
    paymentAmount: 368,
    outstanding: 0,
    badDebt: 0,
    recurringExpenseId: 'rec-1',
    recurringFrequency: 'monthly',
    recurringStatus: 'active',
    createdAt: '',
    updatedAt: '',
  },
]);
assert.equal(recurringGroup.length, 1);
assert.equal(recurringGroup[0].id, 'rec-1');
assert.match(
  formatRecurringSettingDetails(recurringGroup[0]),
  /每月 · 進行中 · 自動化已執行 4 次 · 下次 2026\/09\/20 · Franco's card · 每期 \$368\.00 HKD/,
);
assert.deepEqual(recurringSettingsFromRows(grouped[0].rows), []);
assert.equal(latestExpenseDueDate([
  { dueDate: '2026-04-20' },
  { dueDate: '2026-08-20' },
  { dueDate: '2026-05-20' },
]), '2026-08-20');
assert.equal(defaultGroupRecurringNextDate([
  { dueDate: '2026-04-20' },
  { dueDate: '2026-08-20' },
], 'monthly'), '2026-09-20');
assert.equal(validateRecurringSettingInput({
  creditCardId: 'cc-1',
  frequency: 'monthly',
  billedAmount: '249.6',
  nextOccurrenceDate: '2026-09-20',
}), null);
assert.equal(validateRecurringSettingInput({
  creditCardId: '',
  frequency: 'monthly',
  billedAmount: '249.6',
  nextOccurrenceDate: '2026-09-20',
}), '請選擇信用卡');

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
assert.match(hook, /RECURRING_EXPENSES_TABLE/);
assert.match(hook, /recurring_expense_id/);
assert.match(hook, /recurring_expenses!expenses_recurring_expense_id_fkey/);
assert.match(hook, /EXPENSE_SELECT_CORE/);
assert.match(hook, /isMissingRecurringRelationship/);
assert.match(hook, /selectExpenseRow/);
assert.match(hook, /automation_run_count/);
assert.match(hook, /nextRecurringDueDate/);
assert.match(hook, /paidRecurringExpenseFields/);
assert.match(hook, /const setRecurringExpenseStatus/);
assert.match(hook, /const saveGroupRecurring/);
assert.match(hook, /RecurringExpenseWriteInput/);
assert.match(hook, /insertRecurringTemplate/);
assert.match(hook, /CREATE_RECURRING_EXPENSE_RPC/);
assert.match(hook, /frequency && !recurringId/);
assert.doesNotMatch(hook, /!editing && isRecurringExpenseFrequency/);

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
assert.match(tab, /<h3 className="text-\[14px\] font-semibold">\{group\.supplierLabel\}<\/h3>/);
assert.match(tab, /\{group\.typeLabel\} · \{group\.rows\.length\} 筆/);
assert.match(tab, /應付合計/);
assert.match(tab, /查看附件/);
assert.match(tab, /paymentRecordFileUrl/);
assert.match(tab, /FileText/);
assert.match(tab, /供應商 Supplier/);
assert.match(tab, /SearchableSelect/);
assert.match(tab, /useSupplierTypes/);
assert.match(tab, /useWebPageSuppliers/);
assert.match(tab, /showRecurringBlock/);
assert.match(tab, /draft\.creditCardId/);
assert.match(tab, /週期 Recurring/);
assert.match(tab, /ariaLabel="週期頻率"/);
assert.match(tab, /RECURRING_EXPENSE_FREQUENCIES/);
assert.match(tab, /previewRecurringDueDates/);
assert.match(tab, /setRecurringExpenseStatus/);
assert.match(tab, /isRecurringExpenseFrequency\(draft\.frequency\) \? draft\.frequency : null/);
assert.doesNotMatch(tab, /!editing && isRecurringExpenseFrequency/);
assert.match(tab, /recurringSettingsFromRows/);
assert.match(tab, /formatRecurringSettingDetails/);
assert.match(tab, /<Repeat size=\{14\} \/>|<RecurringIcon size=\{14\} \/>/);
assert.match(tab, /Pause/);
assert.match(tab, /週期已暫停/);
assert.match(tab, /循環設定/);
assert.match(tab, /PitchingRecurringExpenseDialog/);
assert.match(tab, /openRecurringSettings/);
assert.match(tab, /TooltipProvider/);
assert.match(tab, /週期進行中/);
assert.match(tab, /暫停週期/);
assert.match(tab, /恢復週期/);
assert.match(tab, /自動化已執行/);
assert.match(tab, /row\.recurringExpenseId &&/);
assert.match(tab, /rounded-full text-\[10px\][\s\S]*週期/);
assert.doesNotMatch(tab, /單次 \/ 週期/);
assert.doesNotMatch(tab, /應收合計/);
assert.doesNotMatch(tab, /完成收款/);

const recurringMigration = read('supabase/migrations/20260908032903_recurring_expenses.sql');
assert.match(recurringMigration, /CREATE TABLE IF NOT EXISTS public\.recurring_expenses/);
assert.match(recurringMigration, /credit_card_id uuid NOT NULL/);
assert.match(recurringMigration, /automation_run_count integer NOT NULL DEFAULT 0/);
assert.match(recurringMigration, /frequency text NOT NULL/);
assert.match(recurringMigration, /'weekly', 'monthly', 'quarterly', 'yearly'/);
assert.match(recurringMigration, /ADD COLUMN IF NOT EXISTS recurring_expense_id uuid/);
assert.match(recurringMigration, /expenses_recurring_due_date_uidx/);
assert.match(recurringMigration, /CREATE SCHEMA IF NOT EXISTS private/);
assert.match(recurringMigration, /private\.generate_due_recurring_expenses/);
assert.match(recurringMigration, /private\.next_recurring_due_date/);
assert.match(recurringMigration, /SECURITY DEFINER/);
assert.match(recurringMigration, /Asia\/Hong_Kong/);
assert.match(recurringMigration, /payment_status/);
assert.match(recurringMigration, /'Paid'/);
assert.match(recurringMigration, /cron\.schedule/);
assert.match(recurringMigration, /recurring-expenses-daily/);
assert.match(recurringMigration, /5 16 \* \* \*/);
assert.doesNotMatch(recurringMigration, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.recurring_expenses TO anon/);
assert.doesNotMatch(recurringMigration, /GRANT EXECUTE ON FUNCTION private\.generate_due_recurring_expenses\(\) TO authenticated/);

const recurringRpc = read('supabase/migrations/20260908035523_create_recurring_expense_rpc.sql');
assert.match(recurringRpc, /private\.insert_recurring_expense/);
assert.match(recurringRpc, /public\.create_recurring_expense/);
assert.match(recurringRpc, /GRANT EXECUTE ON FUNCTION public\.create_recurring_expense/);
assert.match(recurringRpc, /NOTIFY pgrst, 'reload schema'/);

const recurringDialog = read('src/components/quotation/PitchingRecurringExpenseDialog.tsx');
assert.match(recurringDialog, /export function PitchingRecurringExpenseDialog/);
assert.match(recurringDialog, /新增循環設定/);
assert.match(recurringDialog, /編輯循環設定/);
assert.match(recurringDialog, /validateRecurringSettingInput/);
assert.match(recurringDialog, /aria-label="下次到期日"/);
assert.match(recurringDialog, /aria-label="週期狀態"/);

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
