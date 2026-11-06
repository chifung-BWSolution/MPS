import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  annualFeePaymentStatusLabel,
  buildAnnualFeeGroups,
  formatAnnualFeeNextDueLabel,
  isAnnualFeeDefaultRow,
  summarizeAnnualFeeGroups,
} from '../src/lib/annualFeeIncomes.ts';
import type { FinanceIncomeRow } from '../src/lib/financeLedgers.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const app = read('src/context/AppContext.tsx');
const financeMenu = app.match(/id: 'finance',[\s\S]*?subMenus: \[([\s\S]*?)\],\s*\},/);
assert.ok(financeMenu);
assert.match(financeMenu[1], /id: 'recurring'[\s\S]*id: 'annual-fees',\s*label: '年度收費'\s*\},?\s*$/);

const finance = read('src/components/finance/FinanceModule.tsx');
assert.match(finance, /AnnualFeesPage/);
assert.match(finance, /case 'annual-fees'/);

const page = read('src/components/finance/AnnualFeesPage.tsx');
assert.match(page, /useFinanceIncomes/);
assert.match(page, /年度收費/);
assert.match(page, /IncomeEditDialog/);
assert.match(page, /顯示全部期數/);
assert.match(page, /sticky top-\[calc\(48px\+var\(--app-banner-h\)\)\]/);

const pitching = read('src/components/quotation/PitchingIncomeTab.tsx');
assert.match(pitching, /IncomeEditDialog/);
assert.doesNotMatch(pitching, /<CrudModal/);

const AS_OF = '2026-09-17';

function income(partial: Partial<FinanceIncomeRow> & { id: string }): FinanceIncomeRow {
  return {
    kind: 'income',
    projectName: 'Alpha',
    clientName: 'Acme',
    quotationClientProjectId: 'project-a',
    projectTypeKey: 'bwt_web',
    typeLabel: '主要收入',
    billedAmount: 100,
    paymentAmount: 0,
    outstanding: 100,
    badDebt: 0,
    createdAt: '',
    currency: 'HKD',
    ...partial,
  };
}

const rows = [
  income({
    id: 'paid-past',
    billedAmount: 100,
    paymentAmount: 100,
    outstanding: 0,
    dueDate: '2026-08-01',
  }),
  income({
    id: 'overdue-open',
    billedAmount: 200,
    paymentAmount: 120,
    outstanding: 80,
    dueDate: '2026-09-01',
  }),
  income({
    id: 'overdue-paid',
    billedAmount: 50,
    paymentAmount: 50,
    outstanding: 0,
    dueDate: '2026-09-10',
  }),
  income({
    id: 'today-a',
    billedAmount: 300,
    outstanding: 300,
    dueDate: '2026-09-17',
    installmentNumber: 4,
  }),
  income({
    id: 'today-b',
    billedAmount: 40,
    outstanding: 40,
    dueDate: '2026-09-17',
    installmentNumber: 5,
  }),
  income({
    id: 'future',
    billedAmount: 500,
    outstanding: 500,
    dueDate: '2026-12-01',
  }),
  income({
    id: 'undated',
    billedAmount: 10,
    outstanding: 10,
  }),
  income({
    id: 'system-overdue',
    projectName: 'Gamma',
    clientName: 'North',
    quotationClientProjectId: 'project-b',
    projectTypeKey: 'bwt_system',
    billedAmount: 90,
    outstanding: 90,
    dueDate: '2026-08-15',
  }),
  income({
    id: 'system-next',
    projectName: 'Beta',
    clientName: 'Beacon',
    quotationClientProjectId: 'project-c',
    projectTypeKey: 'bwt_system',
    billedAmount: 70,
    outstanding: 70,
    dueDate: '2026-10-01',
  }),
  income({
    id: 'gift',
    projectName: 'Gift',
    clientName: 'Acme',
    quotationClientProjectId: 'project-d',
    projectTypeKey: 'bwg_gift',
    billedAmount: 999,
    outstanding: 999,
    dueDate: '2026-09-01',
  }),
  income({
    id: 'settled-only',
    projectName: 'Settled',
    clientName: 'Quiet',
    quotationClientProjectId: 'project-e',
    projectTypeKey: 'bwt_web',
    billedAmount: 43000,
    paymentAmount: 43000,
    outstanding: 0,
    dueDate: '2026-01-01',
  }),
];

assert.equal(isAnnualFeeDefaultRow(income({ id: 'x', dueDate: '2026-09-01', outstanding: 80 }), AS_OF), true);
assert.equal(isAnnualFeeDefaultRow(income({ id: 'x', dueDate: '2026-09-01', outstanding: 0 }), AS_OF), false);
assert.equal(isAnnualFeeDefaultRow(income({ id: 'x', dueDate: '2026-09-17', outstanding: 0 }), AS_OF), true);
assert.equal(isAnnualFeeDefaultRow(income({ id: 'x', outstanding: 10 }), AS_OF), false);

const groups = buildAnnualFeeGroups(rows, { asOf: AS_OF });
assert.deepEqual(groups.map((group) => group.projectId), ['project-a', 'project-c', 'project-b']);
assert.equal(groups.some((group) => group.projectId === 'project-e'), false);

const alpha = groups[0];
assert.equal(alpha.totalBilled, 1200);
assert.equal(alpha.installmentCount, 7);
assert.equal(alpha.nextDueDate, '2026-09-17');
assert.equal(alpha.nextBilledAmount, 340);
assert.equal(alpha.expiredOutstanding, 80);
assert.equal(alpha.upcomingAmount, 420);
assert.deepEqual(alpha.defaultRows.map((row) => row.id), ['overdue-open', 'today-a', 'today-b', 'future']);
assert.deepEqual(alpha.rows.map((row) => row.id), [
  'paid-past',
  'overdue-open',
  'overdue-paid',
  'today-a',
  'today-b',
  'future',
  'undated',
]);

const beta = groups[1];
assert.equal(beta.nextDueDate, '2026-10-01');
assert.equal(beta.upcomingAmount, 70);

const gamma = groups[2];
assert.equal(gamma.nextDueDate, undefined);
assert.equal(gamma.upcomingAmount, 90);
assert.equal(formatAnnualFeeNextDueLabel(gamma), '已逾期');
assert.equal(formatAnnualFeeNextDueLabel(alpha), '2026/09/17');
assert.deepEqual(gamma.defaultRows.map((row) => row.id), ['system-overdue']);

assert.equal(annualFeePaymentStatusLabel({ paymentStatus: undefined, paymentAmount: 0 }), '未付款');
assert.equal(annualFeePaymentStatusLabel({ paymentStatus: null, paymentAmount: null }), '未付款');
assert.equal(annualFeePaymentStatusLabel({ paymentStatus: 'Received', paymentAmount: 0 }), '已收款 Received');
assert.equal(annualFeePaymentStatusLabel({ paymentStatus: undefined, paymentAmount: 100 }), '—');

assert.deepEqual(
  buildAnnualFeeGroups(rows, { asOf: AS_OF, search: 'beacon' }).map((group) => group.projectId),
  ['project-c'],
);
assert.deepEqual(
  buildAnnualFeeGroups(rows, { asOf: AS_OF, projectType: 'bwt_web' }).map((group) => group.projectId),
  ['project-a'],
);
assert.deepEqual(
  buildAnnualFeeGroups(rows, { asOf: AS_OF, projectType: 'bwg_gift' }).map((group) => group.projectId),
  [],
);

const summary = summarizeAnnualFeeGroups(groups);
assert.equal(summary.projectCount, 3);
assert.equal(summary.totalBilled, 1360);
assert.equal(summary.upcomingAmount, 580);
