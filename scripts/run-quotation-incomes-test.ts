import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INCOMES_TABLE,
  INCOME_PAYMENT_METHODS,
  INCOME_PAYMENT_STATUSES,
  INCOME_TYPE_PRESETS,
  computeOutstanding,
  formatIncomeDate,
  formatIncomeMoney,
  nextInstallmentNumber,
  parseInstallmentNumber,
  parseMoney,
  summarizeIncomes,
  validateIncomeInput,
} from '../src/lib/quotationIncomes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(INCOMES_TABLE, 'incomes');
assert.deepEqual([...INCOME_TYPE_PRESETS], ['訂金', '分期', '尾款', '全額']);
assert.deepEqual([...INCOME_PAYMENT_METHODS], ['Transfer', 'Cash', 'Cheque']);
assert.deepEqual([...INCOME_PAYMENT_STATUSES], ['Pending Check', 'Received', 'Not Received']);

assert.equal(parseMoney(''), 0);
assert.equal(parseMoney('12000.5'), 12000.5);
assert.equal(parseMoney(-1), null);
assert.equal(parseInstallmentNumber(''), null);
assert.equal(parseInstallmentNumber('2'), 2);
assert.equal(parseInstallmentNumber('0'), null);
assert.equal(computeOutstanding(10000, 3000, 500), 6500);
assert.equal(computeOutstanding(1000, 1200, 0), 0);
assert.equal(nextInstallmentNumber([{ installmentNumber: 1 }, { installmentNumber: 3 }]), 4);
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
}), '請填寫收入類型');
assert.equal(validateIncomeInput({
  type: '訂金',
  installmentNumber: '1',
  billedAmount: '100',
  paymentAmount: '0',
  badDebt: '0',
  paymentMethod: 'Transfer',
  paymentStatus: 'Pending Check',
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

const hook = read('src/hooks/useQuotationIncomes.ts');
assert.match(hook, /INCOMES_TABLE/);
assert.match(hook, /quotation_client_project_id/);
assert.match(hook, /const addIncome/);
assert.match(hook, /const updateIncome/);
assert.match(hook, /const deleteIncome/);

const tab = read('src/components/quotation/PitchingIncomeTab.tsx');
assert.match(tab, /useQuotationIncomes/);
assert.match(tab, /addIncome/);
assert.match(tab, /updateIncome/);
assert.match(tab, /deleteIncome/);
assert.match(tab, /DeleteConfirmModal/);
assert.match(tab, /rounded-full/);
assert.match(tab, /ariaLabel="付款方式"/);
assert.match(tab, /ariaLabel="收款狀態"/);
assert.match(tab, /aria-label="備註"/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /PitchingIncomeTab/);
assert.match(pitching, /id: 'income', label: '收入'/);
assert.match(pitching, /<PitchingIncomeTab projectId=\{record\.id\} \/>/);

const project = read('src/components/quotation/ProjectModule.tsx');
assert.match(project, /PitchingDetail/);

console.log('quotation incomes: ok');
