import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CURRENCY,
  HKD_PER_UNIT,
  SYSTEM_CURRENCIES,
  amountsToHkd,
  convertCurrency,
  convertMoneyInput,
  formatFxHint,
  formatMoney,
  fromHkd,
  isSystemCurrency,
  moneyInputFromHkd,
  parseSystemCurrency,
  toHkd,
} from '../src/lib/currency.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.deepEqual([...SYSTEM_CURRENCIES], ['HKD', 'RMB', 'USD']);
assert.equal(DEFAULT_CURRENCY, 'HKD');
assert.equal(HKD_PER_UNIT.HKD, 1);
assert.equal(HKD_PER_UNIT.RMB, 1.15);
assert.equal(HKD_PER_UNIT.USD, 7.8);

assert.equal(toHkd(100, 'HKD'), 100);
assert.equal(toHkd(100, 'RMB'), 115);
assert.equal(toHkd(100, 'USD'), 780);
assert.equal(fromHkd(115, 'RMB'), 100);
assert.equal(fromHkd(780, 'USD'), 100);
assert.equal(convertCurrency(115, 'HKD', 'RMB'), 100);
assert.equal(convertCurrency(100, 'USD', 'RMB'), 678.26);
assert.equal(convertMoneyInput('100', 'RMB', 'HKD'), '115.00');
assert.equal(convertMoneyInput('', 'USD', 'HKD'), '');
assert.equal(moneyInputFromHkd(780, 'USD'), '100.00');
assert.equal(moneyInputFromHkd(0, 'USD', { emptyIfZero: true }), '');
assert.deepEqual(amountsToHkd({ billedAmount: 10, paymentAmount: 4, badDebt: 1 }, 'RMB'), {
  billedAmount: 11.5,
  paymentAmount: 4.6,
  badDebt: 1.15,
});
assert.equal(parseSystemCurrency('USD'), 'USD');
assert.equal(parseSystemCurrency('yen'), 'HKD');
assert.equal(isSystemCurrency('RMB'), true);
assert.equal(formatMoney(1200), '$1,200.00 HKD');
assert.match(formatFxHint('RMB'), /1\.15/);

const backlink = read('src/lib/backlinkCurrency.ts');
assert.match(backlink, /HKD_PER_UNIT/);
assert.doesNotMatch(backlink, /export const USD_HKD_RATE = 7\.8/);

const migration = read('supabase/migrations/20260908102418_income_expense_currency.sql');
assert.match(migration, /ALTER TABLE public\.incomes/);
assert.match(migration, /ALTER TABLE public\.expenses/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'HKD'/);
assert.match(migration, /'HKD', 'RMB', 'USD'/);

const picker = read('src/components/ui/currency-picker.tsx');
assert.match(picker, /export function CurrencyPicker/);
assert.match(picker, /aria-label="貨幣"/);
assert.match(picker, /export function StoredHkdHint/);

for (const file of [
  'src/components/quotation/PitchingIncomeTab.tsx',
  'src/components/quotation/PitchingExpenseTab.tsx',
  'src/components/quotation/PitchingBulkIncomeDialog.tsx',
  'src/components/quotation/PitchingBulkExpenseDialog.tsx',
]) {
  const source = read(file);
  assert.match(source, /CurrencyPicker/);
  assert.match(source, /toHkd|amountsToHkd/);
}

console.log('currency: ok');
