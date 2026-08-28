import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function filterStaffInUsers(staff, userStaffIds) {
  const allowed = userStaffIds instanceof Set ? userStaffIds : new Set(userStaffIds);
  return staff.filter((s) => !!s.id && allowed.has(s.id));
}

const jane = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const extra = '33333333-3333-4333-8333-333333333333';

const staff = [
  { id: jane, name: 'Jane' },
  { id: other, name: 'Other' },
  { id: extra, name: 'Extra' },
];

assert.deepEqual(
  filterStaffInUsers(staff, [jane, other]).map((s) => s.id),
  [jane, other],
);
assert.deepEqual(
  filterStaffInUsers(staff, new Set([jane])).map((s) => s.name),
  ['Jane'],
);
assert.deepEqual(filterStaffInUsers(staff, []), []);
assert.deepEqual(filterStaffInUsers([{ id: '' }, { id: jane }], [jane]).map((s) => s.id), [jane]);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lookupSrc = readFileSync(join(root, 'src/components/day-report/userStaffLookup.ts'), 'utf8');
const inspectionSrc = readFileSync(join(root, 'src/components/day-report/WorkInspection.tsx'), 'utf8');
const dashboardSrc = readFileSync(join(root, 'src/components/day-report/TeamDashboard.tsx'), 'utf8');
const todayTeamSrc = readFileSync(join(root, 'src/components/day-report/DayReportModule.tsx'), 'utf8');
const todayTeamFn = todayTeamSrc.slice(
  todayTeamSrc.indexOf('function TodayTeamReports()'),
  todayTeamSrc.indexOf('function WorkCalendar()'),
);

assert.match(lookupSrc, /from\('users'\)/);
assert.match(lookupSrc, /select\('staff_id'\)/);
assert.match(inspectionSrc, /filterStaffInUsers/);
assert.match(dashboardSrc, /filterStaffInUsers/);
assert.match(todayTeamFn, /filterStaffInUsers/);

console.log('user staff lookup tests passed');
