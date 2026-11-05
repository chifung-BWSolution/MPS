import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LABOUR_COST_LABEL,
  LABOUR_HOURLY_RATE,
  attributeHoursToClientProjects,
  formatHourSharePercent,
  groupStaffLabour,
  hourSharePercent,
  labourCost,
  relatedIdsForClientProject,
  sumStaffLabourCost,
} from '../src/lib/clientProjectLabour.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(LABOUR_HOURLY_RATE, 500);
assert.equal(labourCost(2.5), 1250);
assert.equal(labourCost(0), 0);
assert.equal(labourCost(1.5) + labourCost(1), labourCost(2.5));
assert.equal(hourSharePercent(2.5, 0), null);
assert.equal(formatHourSharePercent(null), '—');
assert.equal(formatHourSharePercent(41.7), '41.7%');

const hubs = [
  { id: 'hub-q1', relatedType: 'quotation_client', relatedId: 'q1' },
  { id: 'hub-w1', relatedType: 'webandsystem', relatedId: 'w1' },
];
assert.deepEqual(relatedIdsForClientProject({ id: 'q1', webandsystemListId: 'w1' }, hubs), [
  'q1',
  'hub-q1',
  'w1',
  'hub-w1',
]);
assert.deepEqual(relatedIdsForClientProject({ id: 'q3', webandsystemListId: null }, hubs), ['q3']);

const attributed = attributeHoursToClientProjects(
  [
    { relatedId: 'q1', hours: 1 },
    { relatedId: 'hub-q1', hours: 0.5 },
    { relatedId: 'w1', hours: 2 },
    { relatedId: 'hub-w1', hours: 1 },
    { relatedId: 'asana-task', hours: 8 },
    { relatedId: 'q3', hours: 4 },
    { relatedId: null, hours: 3 },
  ],
  [
    { id: 'q1', webandsystemListId: 'w1' },
    { id: 'q2', webandsystemListId: 'w1' },
    { id: 'q3', webandsystemListId: null },
  ],
  hubs,
);
assert.equal(attributed.get('q1'), 4.5);
assert.equal(attributed.get('q2'), 3);
assert.equal(attributed.get('q3'), 4);
assert.equal(attributed.has('asana-task'), false);

const groups = groupStaffLabour([
  { staffId: 'a', hours: 1.5 },
  { staffId: 'a', hours: 1 },
  { staffId: 'b', hours: 3.5 },
]);
const staffA = groups.find((group) => group.staffId === 'a');
const staffB = groups.find((group) => group.staffId === 'b');
assert.ok(staffA);
assert.ok(staffB);
assert.equal(staffA.totalHours, 2.5);
assert.equal(staffA.tasks.reduce((sum, task) => sum + task.labourCost, 0), staffA.labourCost);
assert.equal(staffA.labourCost, 1250);
assert.equal(staffA.ratio, 41.7);
assert.equal(staffB.totalHours, 3.5);
assert.equal(staffB.tasks.reduce((sum, task) => sum + task.labourCost, 0), staffB.labourCost);
assert.equal(staffB.labourCost, 1750);
assert.equal(staffB.ratio, 58.3);
assert.equal((staffA.ratio ?? 0) + (staffB.ratio ?? 0), 100);
assert.equal(sumStaffLabourCost(groups), labourCost(staffA.totalHours + staffB.totalHours));

const hoursTab = read('src/components/quotation/PitchingWorkHoursTab.tsx');
assert.match(hoursTab, /showLabour = Boolean\(projectId\) && !websiteId/);
assert.match(hoursTab, /人工成本/);
assert.match(hoursTab, /占比/);
assert.match(hoursTab, /relatedIdsForClientProject/);
assert.doesNotMatch(hoursTab, /from\('expenses'\)/);

const costTab = read('src/components/quotation/PitchingCostAnalysisTab.tsx');
assert.match(costTab, /useClientProjectLabourHours/);
assert.match(costTab, /LABOUR_COST_LABEL/);
assert.match(costTab, /useQuotationExpenses/);
assert.equal(LABOUR_COST_LABEL, '人工成本 Labour');

const hook = read('src/hooks/useQuotationProjectActuals.ts');
assert.match(hook, /day_report_entries/);
assert.match(hook, /fetchLabourHours/);
assert.doesNotMatch(hook, /from\('expenses'\)\.insert|from\('expenses'\)\.upsert/);

console.log('client project labour: ok');
