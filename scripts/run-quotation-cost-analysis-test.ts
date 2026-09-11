import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UNCATEGORIZED_COST_LABEL,
  PROFIT_SLICE_LABEL,
  amountDelta,
  buildCostAnalysis,
  buildIncomeDoughnut,
  costDeltaTone,
  costSliceColorMap,
  formatSignedMoney,
  formatSignedPercent,
  groupCostAmounts,
  percentChange,
  sliceSharePercent,
} from '../src/lib/quotationCostAnalysis.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.deepEqual(
  groupCostAmounts([
    { name: '設計', amount: 1000 },
    { name: ' 設計 ', amount: 500 },
    { name: '', amount: 200 },
    { name: 'Hosting', amount: 0 },
  ]),
  [
    { name: '設計', amount: 1500 },
    { name: UNCATEGORIZED_COST_LABEL, amount: 200 },
  ],
);

assert.equal(percentChange(100, 120), 20);
assert.equal(percentChange(100, 80), -20);
assert.equal(percentChange(0, 50), null);
assert.equal(percentChange(0, 0), 0);
assert.equal(amountDelta(100, 80), -20);
assert.equal(formatSignedPercent(12.5), '+12.5%');
assert.equal(formatSignedPercent(-8), '-8.0%');
assert.equal(formatSignedMoney(1200), '+$1,200.00');
assert.equal(formatSignedMoney(-1200), '-$1,200.00');

const analysis = buildCostAnalysis({
  estimatedIncome: 20000,
  estimatedExpenses: [
    { name: '設計', amount: 5000 },
    { name: 'Hosting', amount: 1000 },
  ],
  actualIncome: 18000,
  actualExpenses: [
    { name: '設計', amount: 6000 },
    { name: '外包', amount: 2000 },
  ],
  estimatedExpenseCount: 2,
  actualExpenseCount: 2,
  actualIncomeCount: 1,
});

assert.equal(analysis.estimatedExpense, 6000);
assert.equal(analysis.actualExpense, 8000);
assert.equal(analysis.counts.actualIncomes, 1);

const revenue = analysis.rows.find((row) => row.key === 'revenue');
assert.equal(revenue?.estimated, 20000);
assert.equal(revenue?.actual, 18000);
assert.equal(revenue?.delta, -2000);
assert.equal(revenue?.deltaPercent, -10);
assert.equal(costDeltaTone(revenue!), 'down');

const design = analysis.rows.find((row) => row.key === 'cost:設計');
assert.equal(design?.estimated, 5000);
assert.equal(design?.actual, 6000);
assert.equal(costDeltaTone(design!), 'down');

const hosting = analysis.rows.find((row) => row.key === 'cost:hosting');
assert.equal(hosting?.estimated, 1000);
assert.equal(hosting?.actual, null);

const extra = analysis.rows.find((row) => row.key === 'cost:外包');
assert.equal(extra?.estimated, null);
assert.equal(extra?.actual, 2000);

const expense = analysis.rows.find((row) => row.key === 'expense');
assert.equal(expense?.estimated, 6000);
assert.equal(expense?.actual, 8000);
assert.equal(costDeltaTone(expense!), 'down');

const profit = analysis.rows.find((row) => row.key === 'profit');
assert.equal(profit?.estimated, 14000);
assert.equal(profit?.actual, 10000);
assert.equal(costDeltaTone(profit!), 'down');

const margin = analysis.rows.find((row) => row.key === 'margin');
assert.equal(margin?.estimated, 70);
assert.equal(margin?.actual, 55.56);
assert.equal(margin?.format, 'percent');

const colors = costSliceColorMap(['設計', 'Hosting', '外包']);
const estimatedDonut = buildIncomeDoughnut(20000, analysis.estimatedCosts, colors);
assert.equal(estimatedDonut.income, 20000);
assert.equal(
  estimatedDonut.slices.reduce((sum, slice) => sum + slice.value, 0),
  20000,
);
assert.ok(estimatedDonut.slices.some((slice) => slice.name === PROFIT_SLICE_LABEL));
assert.equal(estimatedDonut.overspend, 0);
assert.equal(sliceSharePercent(5000, 20000), 25);

const overspendDonut = buildIncomeDoughnut(1000, [{ name: '設計', amount: 1500 }]);
assert.equal(overspendDonut.overspend, 500);
assert.equal(overspendDonut.slices.reduce((sum, slice) => sum + slice.value, 0), 1000);
assert.ok(!overspendDonut.slices.some((slice) => slice.kind === 'profit'));

const emptyDonut = buildIncomeDoughnut(null, [{ name: '設計', amount: 100 }]);
assert.deepEqual(emptyDonut.slices, []);
assert.equal(emptyDonut.overspend, 100);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /PitchingCostAnalysisTab/);
assert.match(pitching, /id: 'expense', label: '支出'[\s\S]*id: 'cost', label: '成本分析'/);
assert.match(pitching, /activeTab === 'cost'/);
assert.match(pitching, /estimatedIncome=\{record\.estimatedIncome\}/);
assert.match(pitching, /estimatedExpenses=\{record\.estimatedExpenses \?\? \[\]\}/);

const tab = read('src/components/quotation/PitchingCostAnalysisTab.tsx');
assert.match(tab, /export function PitchingCostAnalysisTab/);
assert.match(tab, /useQuotationIncomes/);
assert.match(tab, /useQuotationExpenses/);
assert.match(tab, /成本結構/);
assert.match(tab, /Estimated 預計/);
assert.match(tab, /Actual 實際/);
assert.match(tab, /差異 Diff/);
assert.match(tab, /預計成本結構/);
assert.match(tab, /實際成本結構/);
assert.match(tab, /整個圓環 = 預計收入/);
assert.match(tab, /整個圓環 = 實際收入/);
assert.match(tab, /innerRadius/);

console.log('quotation cost analysis tests passed');
