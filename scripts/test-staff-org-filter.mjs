import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STAFF_ORG_ALL,
  STAFF_ORG_UNASSIGNED_BRAND,
  STAFF_ORG_UNASSIGNED_COMPANY,
  STAFF_ORG_UNASSIGNED_TEAM,
  brandsForCompany,
  companyOptionValue,
  distinctTeamNames,
  matchesStaffOrgFilter,
  nextBrandAfterCompanyChange,
  nextTeamAfterScopeChange,
} from '../src/components/day-report/staffOrgFilter.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inspectionSrc = readFileSync(join(root, 'src/components/day-report/WorkInspection.tsx'), 'utf8');
const dashboardSrc = readFileSync(join(root, 'src/components/day-report/TeamDashboard.tsx'), 'utf8');
const todayTeamSrc = readFileSync(join(root, 'src/components/day-report/DayReportModule.tsx'), 'utf8');
const todayTeamFn = todayTeamSrc.slice(
  todayTeamSrc.indexOf('function TodayTeamReports()'),
  todayTeamSrc.indexOf('function WorkCalendar()'),
);

assert.match(inspectionSrc, /company_list_id/);
assert.match(inspectionSrc, /brand_list_id/);
assert.match(inspectionSrc, /StaffOrgFilterSelects/);
assert.doesNotMatch(inspectionSrc, /fetchStaffIdsByDepartment/);
assert.doesNotMatch(inspectionSrc, /ownDepartment/);

assert.match(dashboardSrc, /company_list_id/);
assert.match(dashboardSrc, /StaffOrgFilterSelects/);
assert.doesNotMatch(dashboardSrc, /fetchStaffIdsByDepartment/);
assert.doesNotMatch(dashboardSrc, /ownDepartment/);
assert.doesNotMatch(dashboardSrc, /isAdminRole/);

assert.match(todayTeamFn, /company_list_id/);
assert.match(todayTeamFn, /brand_list_id/);
assert.match(todayTeamFn, /StaffOrgFilterSelects/);
assert.match(inspectionSrc, /fetchUserStaffIds/);
assert.match(dashboardSrc, /fetchUserStaffIds/);
assert.match(todayTeamFn, /fetchUserStaffIds/);
assert.doesNotMatch(todayTeamFn, /userDepartment/);
assert.doesNotMatch(todayTeamFn, /canSwitchDepartment/);
assert.doesNotMatch(todayTeamFn, /selectedDepartment/);

const staff = [
  { company_list_id: 'co-1', brand_list_id: 'br-1', team_name: '行銷' },
  { company_list_id: 'co-1', brand_list_id: 'br-2', team_name: '設計' },
  { company_list_id: 'co-2', brand_list_id: 'br-3', team_name: '行銷' },
  { company_list_id: null, brand_list_id: null, team_name: null },
];

assert.equal(
  staff.filter((s) => matchesStaffOrgFilter(s, {
    companyId: STAFF_ORG_ALL,
    brandId: STAFF_ORG_ALL,
    teamName: STAFF_ORG_ALL,
  })).length,
  4,
  'all filters show everyone',
);

assert.deepEqual(
  staff.filter((s) => matchesStaffOrgFilter(s, {
    companyId: 'co-1',
    brandId: STAFF_ORG_ALL,
    teamName: STAFF_ORG_ALL,
  })).map((s) => s.team_name),
  ['行銷', '設計'],
);

assert.deepEqual(
  staff.filter((s) => matchesStaffOrgFilter(s, {
    companyId: 'co-1',
    brandId: 'br-1',
    teamName: STAFF_ORG_ALL,
  })).map((s) => s.team_name),
  ['行銷'],
);

assert.deepEqual(
  staff.filter((s) => matchesStaffOrgFilter(s, {
    companyId: STAFF_ORG_ALL,
    brandId: STAFF_ORG_ALL,
    teamName: '行銷',
  })).map((s) => s.company_list_id),
  ['co-1', 'co-2'],
);

assert.equal(
  staff.filter((s) => matchesStaffOrgFilter(s, {
    companyId: STAFF_ORG_UNASSIGNED_COMPANY,
    brandId: STAFF_ORG_UNASSIGNED_BRAND,
    teamName: STAFF_ORG_UNASSIGNED_TEAM,
  })).length,
  1,
);

const brands = [
  { id: 'br-1', companyId: 'co-1' },
  { id: 'br-2', companyId: 'co-1' },
  { id: 'br-3', companyId: 'co-2' },
];

assert.deepEqual(
  brandsForCompany(brands, 'co-1').map((b) => b.id),
  ['br-1', 'br-2'],
);
assert.equal(nextBrandAfterCompanyChange('br-3', brands, 'co-1'), STAFF_ORG_ALL);
assert.equal(nextBrandAfterCompanyChange('br-1', brands, 'co-1'), 'br-1');
assert.equal(nextTeamAfterScopeChange('設計', ['行銷']), STAFF_ORG_ALL);
assert.equal(nextTeamAfterScopeChange('行銷', ['行銷', '設計']), '行銷');
assert.deepEqual(distinctTeamNames(staff), ['行銷', '設計'].sort((a, b) => a.localeCompare(b, 'zh-Hant')));
assert.equal(companyOptionValue({ uuid: 'uuid-1', id: 'legacy' }), 'uuid-1');
assert.equal(companyOptionValue({ id: 'legacy' }), 'legacy');

console.log('staff org filter tests passed');
