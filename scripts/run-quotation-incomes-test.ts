import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INCOMES_TABLE,
  INCOME_PAYMENT_RECORDS_BUCKET,
  INCOME_PAYMENT_METHODS,
  INCOME_PAYMENT_STATUSES,
  INCOME_TYPE_PRESETS,
  computeOutstanding,
  formatIncomeDate,
  formatIncomeMoney,
  incomePaymentRecordStoragePath,
  isAllowedPaymentRecordFile,
  nextInstallmentNumber,
  parseInstallmentNumber,
  hasFilledPaymentAmount,
  parseMoney,
  groupIncomesByType,
  summarizeIncomes,
  validateIncomeInput,
  validateBulkIncomeInput,
  BULK_BILLED_TOTAL_MISMATCH,
  billedSumMatchesTotal,
  BULK_DATE_MODE_LABELS,
  DEFAULT_BULK_DATE_MODE,
  DEFAULT_BULK_INSTALLMENT_COUNT,
  defaultBulkDateRange,
  distributeDueDates,
  findInstallmentCollision,
  formatMoneyInput,
  inferBulkDateMode,
  planBulkInstallmentNumbers,
  spreadDueDates,
  splitBilledAmounts,
} from '../src/lib/quotationIncomes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(INCOMES_TABLE, 'incomes');
assert.equal(INCOME_PAYMENT_RECORDS_BUCKET, 'income-payment-records');
assert.equal(
  incomePaymentRecordStoragePath('proj-1', '收據 (v2).pdf', 'abc'),
  'proj-1/abc/v2.pdf',
);
assert.equal(isAllowedPaymentRecordFile({ name: 'slip.pdf', type: 'application/pdf', size: 10 }), null);
assert.match(
  isAllowedPaymentRecordFile({ name: 'virus.exe', type: 'application/x-msdownload', size: 10 }) ?? '',
  /不支援/,
);
assert.deepEqual([...INCOME_TYPE_PRESETS], ['主要收入', '後加項目', '代付項目']);
assert.deepEqual([...INCOME_PAYMENT_METHODS], ['Transfer', 'Cash', 'Cheque']);
assert.deepEqual([...INCOME_PAYMENT_STATUSES], ['Pending Check', 'Received', 'Not Received']);

assert.equal(hasFilledPaymentAmount(''), false);
assert.equal(hasFilledPaymentAmount('0'), true);
assert.equal(parseMoney(''), 0);
assert.equal(parseMoney('12000.5'), 12000.5);
assert.equal(parseMoney(-1), null);
assert.equal(parseInstallmentNumber(''), null);
assert.equal(parseInstallmentNumber('2'), 2);
assert.equal(parseInstallmentNumber('0'), null);
assert.equal(computeOutstanding(10000, 3000, 500), 6500);
assert.equal(computeOutstanding(1000, 1200, 0), 0);
assert.equal(nextInstallmentNumber([{ installmentNumber: 1 }, { installmentNumber: 3 }]), 4);
assert.equal(
  nextInstallmentNumber(
    [
      { type: '主要收入', installmentNumber: 2 },
      { type: '後加項目', installmentNumber: 5 },
    ],
    '主要收入',
  ),
  3,
);
assert.equal(nextInstallmentNumber([], '後加項目'), 1);
assert.equal(DEFAULT_BULK_INSTALLMENT_COUNT, 2);
assert.deepEqual(defaultBulkDateRange('2026-03-01', '2026-09-01'), { start: '2026-03-01', end: '2026-09-01' });
assert.deepEqual(defaultBulkDateRange('2026-09-01', '2026-03-01'), { start: '2026-03-01', end: '2026-09-01' });
assert.equal(DEFAULT_BULK_DATE_MODE, 'monthly');
assert.equal(BULK_DATE_MODE_LABELS.even, '按平均日數');
assert.equal(BULK_DATE_MODE_LABELS.weekly, '每週重複');
assert.equal(BULK_DATE_MODE_LABELS.monthly, '每月重複');
assert.equal(BULK_DATE_MODE_LABELS.quarterly, '每季重複');
assert.equal(BULK_DATE_MODE_LABELS.yearly, '每年重複');
assert.deepEqual(spreadDueDates('2026-01-01', '2026-04-01', 2), ['2026-01-01', '2026-04-01']);
assert.deepEqual(spreadDueDates('2026-01-01', '2026-01-31', 3), ['2026-01-01', '2026-01-16', '2026-01-31']);
assert.deepEqual(spreadDueDates('2026-01-01', '2026-01-01', 2), ['2026-01-01', '2026-01-01']);
assert.deepEqual(
  distributeDueDates({ mode: 'even', start: '2026-01-01', end: '2026-01-31', count: 3 }),
  ['2026-01-01', '2026-01-16', '2026-01-31'],
);
assert.deepEqual(
  distributeDueDates({ mode: 'weekly', start: '2026-01-06', count: 4 }),
  ['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27'],
);
assert.deepEqual(
  distributeDueDates({ mode: 'monthly', start: '2026-01-15', count: 3 }),
  ['2026-01-15', '2026-02-15', '2026-03-15'],
);
assert.deepEqual(
  distributeDueDates({ mode: 'monthly', start: '2026-01-31', count: 3 }),
  ['2026-01-31', '2026-02-28', '2026-03-31'],
);
assert.deepEqual(
  distributeDueDates({ mode: 'quarterly', start: '2026-01-31', count: 3 }),
  ['2026-01-31', '2026-04-30', '2026-07-31'],
);
assert.deepEqual(
  distributeDueDates({ mode: 'yearly', start: '2024-02-29', count: 3 }),
  ['2024-02-29', '2025-02-28', '2026-02-28'],
);
assert.equal(inferBulkDateMode(['2026-01-06', '2026-01-13', '2026-01-20']), 'weekly');
assert.equal(inferBulkDateMode(['2026-01-31', '2026-02-28', '2026-03-31']), 'monthly');
assert.equal(inferBulkDateMode(['2026-01-31', '2026-04-30', '2026-07-31']), 'quarterly');
assert.equal(inferBulkDateMode(['2024-02-29', '2025-02-28', '2026-02-28']), 'yearly');
assert.equal(inferBulkDateMode(['2026-01-01', '2026-01-16', '2026-01-31']), 'even');
assert.equal(inferBulkDateMode(['2026-01-01', '2026-01-10', '2026-03-03']), null);
assert.deepEqual(splitBilledAmounts(10000, 2), [5000, 5000]);
assert.deepEqual(splitBilledAmounts(10000, 3), [3333.33, 3333.33, 3333.34]);
assert.equal(formatMoneyInput(3333.34), '3333.34');
assert.deepEqual(
  planBulkInstallmentNumbers({
    projectRows: [{ type: '主要收入', installmentNumber: 2 }],
    type: '主要收入',
    count: 2,
  }),
  [3, 4],
);
assert.deepEqual(
  planBulkInstallmentNumbers({
    projectRows: [
      { id: 'a', type: '主要收入', installmentNumber: 3 },
      { id: 'b', type: '主要收入', installmentNumber: 4 },
    ],
    type: '主要收入',
    count: 3,
    editingIds: ['a', 'b'],
    keepNumbers: [3, 4],
  }),
  [3, 4, 5],
);
assert.equal(
  findInstallmentCollision(
    [{ id: 'x', type: '主要收入', installmentNumber: 2 }],
    '主要收入',
    [2, 3],
  ),
  2,
);
assert.equal(
  findInstallmentCollision(
    [{ id: 'x', type: '主要收入', installmentNumber: 2 }],
    '主要收入',
    [2, 3],
    ['x'],
  ),
  null,
);
assert.equal(validateBulkIncomeInput({
  type: '主要收入',
  totalAmount: '',
  startDate: '',
  endDate: '',
  installmentCount: '2',
  rows: [
    { dueDate: '2026-01-01', installmentNumber: '1', billedAmount: '100' },
    { dueDate: '2026-02-01', installmentNumber: '2', billedAmount: '100' },
  ],
}), null);
assert.equal(validateBulkIncomeInput({
  type: '主要收入',
  totalAmount: '200',
  startDate: '2026-01-01',
  endDate: '2026-02-01',
  installmentCount: '2',
  rows: [
    { dueDate: '2026-01-01', installmentNumber: '1', billedAmount: '100' },
    { dueDate: '2026-02-01', installmentNumber: '2', billedAmount: '100' },
  ],
}), null);
assert.equal(billedSumMatchesTotal('200', [{ billedAmount: '100' }, { billedAmount: '100' }]), true);
assert.equal(billedSumMatchesTotal('200', [{ billedAmount: '80' }, { billedAmount: '100' }]), false);
assert.equal(validateBulkIncomeInput({
  type: '主要收入',
  totalAmount: '200',
  startDate: '2026-01-01',
  endDate: '2026-02-01',
  installmentCount: '2',
  rows: [
    { dueDate: '2026-01-01', installmentNumber: '1', billedAmount: '80' },
    { dueDate: '2026-02-01', installmentNumber: '2', billedAmount: '100' },
  ],
}), BULK_BILLED_TOTAL_MISMATCH);
assert.equal(validateBulkIncomeInput({
  type: '主要收入',
  totalAmount: '',
  installmentCount: '1',
  rows: [{ dueDate: '', installmentNumber: '1', billedAmount: '100' }],
}), '第 1 期請選擇到期日');
assert.equal(validateBulkIncomeInput({
  type: '主要收入',
  totalAmount: '',
  installmentCount: '1',
  rows: [{ dueDate: '2026-01-01', installmentNumber: '1', billedAmount: '' }],
}), '第 1 期請填寫應收金額');
assert.equal(formatIncomeMoney(1200), '$1,200.00 HKD');
assert.equal(formatIncomeDate('2026-09-04'), '2026/09/04');

assert.equal(validateIncomeInput({
  type: '',
  installmentNumber: '',
  billedAmount: '100',
  paymentAmount: '0',
  badDebt: '0',
  paymentMethod: '',
  paymentStatus: 'Not Received',
}), '請選擇收入類型');
assert.equal(validateIncomeInput({
  type: '主要收入',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '',
  paymentDate: '',
  badDebt: '0',
  paymentMethod: '',
  paymentStatus: '',
}), null);
assert.equal(validateIncomeInput({
  type: '主要收入',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '500',
  paymentDate: '',
  paymentMethod: 'Transfer',
  paymentStatus: 'Received',
}), '請選擇收款日期');
assert.equal(validateIncomeInput({
  type: '主要收入',
  installmentNumber: '1',
  billedAmount: '100',
  dueDate: '2026-09-04',
  paymentAmount: '500',
  paymentDate: '2026-09-10',
  paymentMethod: 'Transfer',
  paymentStatus: 'Received',
}), null);

assert.deepEqual(
  summarizeIncomes([
    {
      id: 'a',
      quotationClientProjectId: 'p1',
      type: '訂金',
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
      quotationClientProjectId: 'p1',
      type: '尾款',
      billedAmount: 2000,
      paymentAmount: 0,
      paymentStatus: 'Not Received',
      outstanding: 1800,
      badDebt: 200,
      createdAt: '',
      updatedAt: '',
    },
  ]),
  { billed: 3000, received: 400, outstanding: 2400, badDebt: 200 },
);

const grouped = groupIncomesByType([
  {
    id: 'b',
    quotationClientProjectId: 'p1',
    type: '後加項目',
    billedAmount: 800,
    paymentAmount: 200,
    outstanding: 600,
    badDebt: 0,
    createdAt: '2026-09-02',
    updatedAt: '2026-09-02',
  },
  {
    id: 'a1',
    quotationClientProjectId: 'p1',
    type: '主要收入',
    billedAmount: 1000,
    paymentAmount: 400,
    outstanding: 600,
    badDebt: 0,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'a2',
    quotationClientProjectId: 'p1',
    type: '主要收入',
    billedAmount: 2000,
    paymentAmount: 0,
    outstanding: 1800,
    badDebt: 200,
    createdAt: '2026-09-03',
    updatedAt: '2026-09-03',
  },
]);
assert.deepEqual(grouped.map((group) => group.type), ['主要收入', '後加項目']);
assert.deepEqual(grouped[0].rows.map((row) => row.id), ['a1', 'a2']);
assert.deepEqual(grouped[0].summary, { billed: 3000, received: 400, outstanding: 2400, badDebt: 200 });
assert.deepEqual(grouped[1].summary, { billed: 800, received: 200, outstanding: 600, badDebt: 0 });

const migration = read('supabase/migrations/20260904025648_create_incomes.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.incomes/);
assert.match(migration, /quotation_client_project_id text NOT NULL/);
assert.match(migration, /REFERENCES public\.quotation_client_project\(id\) ON DELETE RESTRICT/);
assert.match(migration, /installment_number integer/);
assert.match(migration, /billed_amount numeric\(14, 2\)/);
assert.match(migration, /payment_amount numeric\(14, 2\)/);
assert.match(migration, /payment_method text/);
assert.match(migration, /'Transfer', 'Cash', 'Cheque'/);
assert.match(migration, /'Pending Check', 'Received', 'Not Received'/);
assert.match(migration, /outstanding numeric\(14, 2\) GENERATED ALWAYS AS/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);

const fileMigration = read('supabase/migrations/20260904033535_incomes_payment_record_file.sql');
assert.match(fileMigration, /payment_record_file_name text/);
assert.match(fileMigration, /payment_record_file_url text/);
assert.match(fileMigration, /payment_record_storage_path text/);
assert.match(fileMigration, /INSERT INTO storage\.buckets/);
assert.match(fileMigration, /'income-payment-records'/);

const statusMigration = read('supabase/migrations/20260904055557_incomes_optional_status_and_types.sql');
assert.match(statusMigration, /ALTER COLUMN payment_status DROP NOT NULL/);
assert.match(statusMigration, /payment_status IS NULL OR payment_status IN/);
assert.match(statusMigration, /'主要收入', '後加項目', '代付項目'/);

const paymentDateMigration = read('supabase/migrations/20260904060756_incomes_payment_date.sql');
assert.match(paymentDateMigration, /ADD COLUMN IF NOT EXISTS payment_date date/);

const hook = read('src/hooks/useQuotationIncomes.ts');
assert.match(hook, /INCOMES_TABLE/);
assert.match(hook, /INCOME_PAYMENT_RECORDS_BUCKET/);
assert.match(hook, /quotation_client_project_id/);
assert.match(hook, /payment_record_storage_path/);
assert.match(hook, /payment_date/);
assert.match(hook, /uploadIncomePaymentRecordFile/);
assert.match(hook, /const addIncome/);
assert.match(hook, /const updateIncome/);
assert.match(hook, /const deleteIncome/);
assert.match(hook, /const saveBulkIncomes/);

const tab = read('src/components/quotation/PitchingIncomeTab.tsx');
assert.match(tab, /useQuotationIncomes/);
assert.match(tab, /addIncome/);
assert.match(tab, /updateIncome/);
assert.match(tab, /deleteIncome/);
assert.match(tab, /DeleteConfirmModal/);
assert.match(tab, /rounded-full/);
assert.match(tab, /ariaLabel="收款方式"/);
assert.match(tab, /ariaLabel="收款狀態"/);
assert.match(tab, /aria-label="備註"/);
assert.match(tab, /aria-label="收款紀錄檔案"/);
assert.match(tab, /paymentRecordAction/);
assert.match(tab, /新增單項收入/);
assert.match(tab, /新增整項收入/);
assert.match(tab, /編輯整項/);
assert.match(tab, /PitchingBulkIncomeDialog/);
assert.match(tab, /signedDate/);
assert.match(tab, /handoverDate/);
assert.match(tab, /saveBulkIncomes/);
assert.match(tab, /DEFAULT_INCOME_TYPE/);
assert.match(tab, /nextInstallmentNumber\(rows, type\)/);
assert.match(tab, /款項資訊/);
assert.match(tab, /完成收款/);
assert.match(tab, /於完成收款時填寫/);
assert.match(tab, /aria-label="收款日期"/);
assert.match(tab, /groupIncomesByType/);
assert.match(tab, /應收合計/);
assert.match(tab, /查看附件/);
assert.match(tab, /paymentRecordFileUrl/);
assert.match(tab, /FileText/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /PitchingIncomeTab/);
assert.match(pitching, /id: 'budget', label: '預計收入支出'[\s\S]*id: 'income', label: '收入'/);
assert.match(pitching, /<PitchingIncomeTab/);
assert.match(pitching, /signedDate=\{draft\.signedDate\}/);
assert.match(pitching, /handoverDate=\{draft\.handoverDate\}/);

const bulk = read('src/components/quotation/PitchingBulkIncomeDialog.tsx');
assert.match(bulk, /新增整項收入/);
assert.match(bulk, /編輯整項收入/);
assert.match(bulk, /DEFAULT_BULK_INSTALLMENT_COUNT/);
assert.match(bulk, /DEFAULT_BULK_DATE_MODE/);
assert.match(bulk, /distributeDueDates/);
assert.match(bulk, /planBulkInstallmentNumbers/);
assert.match(bulk, /mode="range"/);
assert.match(bulk, /mode="single"/);
assert.match(bulk, /setPickingEnd\(true\)/);
assert.match(bulk, /to: undefined/);
assert.match(bulk, /triggerDate/);
assert.match(bulk, /BULK_BILLED_TOTAL_MISMATCH/);
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
assert.match(bulk, /應收金額 Billed \*/);
assert.doesNotMatch(bulk, /總金額 Total \*/);
assert.doesNotMatch(bulk, /日期範圍 Date range \*/);
assert.doesNotMatch(bulk, /第 \$\{index \+ 1\} 期期數/);

const project = read('src/components/quotation/ProjectModule.tsx');
assert.match(project, /PitchingDetail/);

console.log('quotation incomes: ok');
