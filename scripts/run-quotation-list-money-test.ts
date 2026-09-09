import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildProjectActuals,
  CLIENT_PROJECT_INFO_METRIC_LABELS,
  clientProjectInfoMetrics,
  computeGp,
  estimatedMoneyFor,
  formatProfitRatioPercent,
  formatQuotationListMoney,
  isActualClientProjectMetricsStatus,
  profitRatioPercent,
  projectActualsFor,
  quotationListGpClass,
  QUOTATION_LIST_COLUMN_COUNT,
  sumEstimatedExpenses,
} from '../src/lib/quotationListMoney.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hookSrc = readFileSync(join(root, 'src/hooks/useQuotationProjectActuals.ts'), 'utf8');
const pitchingSrc = readFileSync(join(root, 'src/components/quotation/PitchingModule.tsx'), 'utf8');
const projectSrc = readFileSync(join(root, 'src/components/quotation/ProjectModule.tsx'), 'utf8');
const metricsSrc = readFileSync(join(root, 'src/components/quotation/PitchingInfoMetricsRow.tsx'), 'utf8');

assert.equal(QUOTATION_LIST_COLUMN_COUNT, 11);
assert.match(hookSrc, /INCOMES_TABLE/);
assert.match(hookSrc, /EXPENSES_TABLE/);
assert.match(hookSrc, /related_type.*quotation_client/);
assert.match(hookSrc, /EXPENSE_RELATED_TYPE_PROJECT/);
assert.match(hookSrc, /billed_amount/);
assert.match(projectSrc, /useQuotationProjectActuals/);
assert.match(projectSrc, /moneyColumns="actual"/);
assert.match(pitchingSrc, /estimatedMoneyFor/);
assert.match(pitchingSrc, /moneyColumns="estimated"/);
assert.match(pitchingSrc, /QUOTATION_LIST_COLUMN_COUNT/);
assert.match(projectSrc, /QUOTATION_LIST_COLUMN_COUNT/);
assert.doesNotMatch(pitchingSrc, /useQuotationProjectActuals/);
assert.match(pitchingSrc, /PitchingInfoMetricsRow/);
assert.match(pitchingSrc, /activeTab === 'info'/);
assert.match(metricsSrc, /useQuotationProjectActualsFor/);
assert.match(metricsSrc, /clientProjectInfoMetrics/);
assert.match(hookSrc, /useQuotationProjectActualsFor/);

assert.equal(sumEstimatedExpenses([]), 0);
assert.equal(sumEstimatedExpenses([{ amount: 1200 }, { amount: 800.5 }]), 2000.5);
assert.equal(computeGp(10000, 3500), 6500);
assert.equal(computeGp(1000, 1500), -500);

assert.deepEqual(estimatedMoneyFor({}), { income: null, expense: null, gp: null });
assert.deepEqual(
  estimatedMoneyFor({ estimatedIncome: 20000, estimatedExpenses: [{ amount: 5000 }, { amount: 2500 }] }),
  { income: 20000, expense: 7500, gp: 12500 },
);
assert.deepEqual(
  estimatedMoneyFor({ estimatedExpenses: [{ amount: 3000 }] }),
  { income: null, expense: 3000, gp: -3000 },
);
assert.deepEqual(
  estimatedMoneyFor({ estimatedIncome: 0, estimatedExpenses: [] }),
  { income: 0, expense: 0, gp: 0 },
);

const actuals = buildProjectActuals(
  [
    { quotation_client_project_id: 'q1', billed_amount: 8000 },
    { quotation_client_project_id: 'q1', billed_amount: '2000.25' },
    { quotation_client_project_id: 'q2', billed_amount: 5000 },
  ],
  [
    { id: 'p1', related_id: 'q1' },
    { id: 'p2', related_id: 'q2' },
    { id: 'p3', related_id: 'q3' },
  ],
  [
    { related_id: 'p1', billed_amount: 1500 },
    { related_id: 'p1', billed_amount: 500 },
    { related_id: 'p2', billed_amount: 9000 },
  ],
);

assert.deepEqual(actuals.q1, { income: 10000.25, expense: 2000, gp: 8000.25 });
assert.deepEqual(actuals.q2, { income: 5000, expense: 9000, gp: -4000 });
assert.equal(actuals.q3, undefined);
assert.deepEqual(projectActualsFor('q3', actuals), { income: 0, expense: 0, gp: 0 });
assert.deepEqual(projectActualsFor('missing', {}), { income: 0, expense: 0, gp: 0 });

assert.match(formatQuotationListMoney(1234.5), /^\$/);
assert.equal(quotationListGpClass(1200), 'text-emerald-600');
assert.equal(quotationListGpClass(-50), 'text-rose-600');
assert.equal(quotationListGpClass(0), '');
assert.equal(quotationListGpClass(null), '');

assert.equal(isActualClientProjectMetricsStatus('confirmed'), true);
assert.equal(isActualClientProjectMetricsStatus('initial'), false);
assert.equal(isActualClientProjectMetricsStatus('following_up'), false);
assert.equal(isActualClientProjectMetricsStatus('closed'), false);
assert.equal(profitRatioPercent(10000, 2500), 25);
assert.equal(profitRatioPercent(0, 0), null);
assert.equal(profitRatioPercent(null, 100), null);
assert.equal(formatProfitRatioPercent(25), '25.0%');
assert.equal(formatProfitRatioPercent(null), '—');

const estimated = estimatedMoneyFor({
  estimatedIncome: 20000,
  estimatedExpenses: [{ amount: 5000 }],
});
const confirmedMetrics = clientProjectInfoMetrics({
  status: 'confirmed',
  estimated,
  actuals: { income: 10000, expense: 2000, gp: 8000 },
});
assert.equal(confirmedMetrics.mode, 'actual');
assert.equal(confirmedMetrics.income, 10000);
assert.equal(confirmedMetrics.expense, 2000);
assert.equal(confirmedMetrics.gp, 8000);
assert.equal(confirmedMetrics.ratio, 80);
assert.equal(confirmedMetrics.labels.income, CLIENT_PROJECT_INFO_METRIC_LABELS.actual.income);
assert.equal(confirmedMetrics.labels.ratio, CLIENT_PROJECT_INFO_METRIC_LABELS.actual.ratio);

const pitchingMetrics = clientProjectInfoMetrics({
  status: 'following_up',
  estimated,
  actuals: { income: 10000, expense: 2000, gp: 8000 },
});
assert.equal(pitchingMetrics.mode, 'estimated');
assert.equal(pitchingMetrics.income, 20000);
assert.equal(pitchingMetrics.expense, 5000);
assert.equal(pitchingMetrics.gp, 15000);
assert.equal(pitchingMetrics.ratio, 75);
assert.equal(pitchingMetrics.labels.income, CLIENT_PROJECT_INFO_METRIC_LABELS.estimated.income);
assert.equal(pitchingMetrics.labels.gp, CLIENT_PROJECT_INFO_METRIC_LABELS.estimated.gp);
assert.equal(pitchingMetrics.labels.ratio, CLIENT_PROJECT_INFO_METRIC_LABELS.estimated.ratio);

console.log('quotation list money: ok');
