import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BV_RATIO_FILTER_LABELS,
  DEFAULT_BV_ALLOCATION_SORT_DIR,
  DEFAULT_BV_ALLOCATION_SORT_KEY,
  DEFAULT_BV_RATIO_FILTER,
  classifyBvRatioStatus,
  companyBvDetailRow,
  filterBvAllocations,
  formatBvPercent,
  formatBvStaffNames,
  groupBvAllocations,
  listBvStaffNames,
  isLinkedWebsiteListing,
  nextBvAllocationSort,
  projectStatusLabel,
  remapLinkedWebsiteBvProjectId,
  sortBvAllocations,
  summarizeBvAllocations,
  uniqueBvStaffOptions,
  type BvAllocationProjectInfo,
  type BvAllocationStaffRow,
} from '../src/lib/financeBvAllocation.ts';
import { BV_RATIO_TOTAL, COMPANY_BV_LABEL, COMPANY_BV_RATIO } from '../src/lib/quotationBv.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const app = read('src/context/AppContext.tsx');
assert.match(app, /id: 'finance'/);
assert.match(app, /label: '會計財務'/);
const financeMenu = app.match(/id: 'finance',[\s\S]*?subMenus: \[([\s\S]*?)\],\s*\},/);
assert.ok(financeMenu);
assert.match(financeMenu[1], /^\s*\{\s*id: 'bv-allocation',\s*label: 'BV 分配' \}/);

const finance = read('src/components/finance/FinanceModule.tsx');
assert.match(finance, /BvAllocationPage/);
assert.match(finance, /case 'bv-allocation'/);

const page = read('src/components/finance/BvAllocationPage.tsx');
assert.match(page, /useFinanceBvAllocation/);
assert.match(page, /BV 分配/);
assert.match(page, /quotation_bv/);
assert.match(page, /Ratio = 100%/);
assert.match(page, /Ratio < 100%/);
assert.match(page, /Ratio > 100%/);
assert.match(page, /expandedId/);
assert.match(page, /companyBvDetailRow/);
assert.match(page, /QuotationBvBulkPanel/);
assert.match(page, /批量設定/);
assert.match(page, /useQuotationBv/);
assert.match(page, /label="人員"/);
assert.match(page, /sortKey="staffNames"/);
assert.match(page, /group\.staffNames/);
assert.match(page, /staffNameItems/);
assert.match(page, /<Star /);
assert.match(page, /aria-label="主要 PM"/);
assert.doesNotMatch(page, /FinanceSortableTh label="主要 PM"/);
assert.match(page, /<td className="px-4 py-3">\s*<span onClick=\{\(event\) => event\.stopPropagation\(\)\}>\s*<FinanceProjectLink/);
assert.doesNotMatch(page, /<td className="px-4 py-3" onClick=\{\(event\) => event\.stopPropagation\(\)\}>/);

const hook = read('src/hooks/useFinanceBvAllocation.ts');
assert.match(hook, /QUOTATION_BV_TABLE/);
assert.match(hook, /BV_SOURCE_RELATED_TYPES/);
assert.match(hook, /groupBvAllocations/);
assert.match(hook, /project_id/);
assert.match(hook, /staff:staffs!staff_id/);
assert.match(hook, /from\(PROJECTS_TABLE\)/);
assert.match(hook, /webandsystem_list_id/);
assert.match(hook, /main_pm_id/);
assert.match(hook, /mainPmId/);

assert.equal(DEFAULT_BV_RATIO_FILTER, 'all');
assert.equal(DEFAULT_BV_ALLOCATION_SORT_KEY, 'signedDate');
assert.equal(DEFAULT_BV_ALLOCATION_SORT_DIR, 'desc');
assert.equal(BV_RATIO_FILTER_LABELS.equal, 'BV = 100%（已完成）');
assert.equal(BV_RATIO_FILTER_LABELS.under, 'BV < 100%（未完成）');
assert.equal(BV_RATIO_FILTER_LABELS.over, 'BV > 100%（超額）');
assert.equal(classifyBvRatioStatus(100), 'equal');
assert.equal(classifyBvRatioStatus(99.99), 'under');
assert.equal(classifyBvRatioStatus(100.01), 'over');
assert.equal(formatBvPercent(70), '70%');
assert.equal(projectStatusLabel('confirmed'), '確認項目');
assert.equal(companyBvDetailRow().staffName, COMPANY_BV_LABEL);
assert.equal(companyBvDetailRow().bvRatio, COMPANY_BV_RATIO);

function staff(
  partial: Partial<BvAllocationStaffRow> & Pick<BvAllocationStaffRow, 'id' | 'projectId' | 'staffId'>,
): BvAllocationStaffRow {
  return {
    staffName: partial.staffName ?? partial.staffId,
    bvRatio: 35,
    ...partial,
  };
}

function project(
  partial: Partial<BvAllocationProjectInfo> & Pick<BvAllocationProjectInfo, 'projectId' | 'projectName'>,
): BvAllocationProjectInfo {
  return { ...partial };
}

const projects = new Map<string, BvAllocationProjectInfo>([
  [
    'p-complete',
    project({
      projectId: 'p-complete',
      projectName: 'Alpha Home',
      pitchingCode: 'BWA-001',
      mainPmId: 's-ada',
      mainPmName: 'Ada',
      signedDate: '2026-09-10',
      projectStatus: 'confirmed',
    }),
  ],
  [
    'p-under',
    project({
      projectId: 'p-under',
      projectName: 'Beta School',
      mainPmId: 's-ben',
      mainPmName: 'Ben',
      signedDate: '2026-08-01',
    }),
  ],
  [
    'p-over',
    project({
      projectId: 'p-over',
      projectName: 'Gamma Mall',
      mainPmId: 's-dan',
      mainPmName: 'Dan',
      signedDate: '2026-10-01',
    }),
  ],
  [
    'p-empty',
    project({
      projectId: 'p-empty',
      projectName: 'Delta Empty',
      signedDate: '2026-07-01',
    }),
  ],
]);

const groups = groupBvAllocations(
  [
    staff({ id: 'b1', projectId: 'p-complete', staffId: 's-ada', staffName: 'Ada', bvRatio: 40 }),
    staff({ id: 'b2', projectId: 'p-complete', staffId: 's-ben', staffName: 'Ben', bvRatio: 30 }),
    staff({ id: 'b3', projectId: 'p-under', staffId: 's-ada', staffName: 'Ada', bvRatio: 20 }),
    staff({ id: 'b4', projectId: 'p-over', staffId: 's-cara', staffName: 'Cara', bvRatio: 70 }),
    staff({ id: 'b5', projectId: 'p-over', staffId: 's-dan', staffName: 'Dan', bvRatio: 10 }),
  ],
  projects,
);

const byId = new Map(groups.map((group) => [group.projectId, group]));
assert.equal(byId.get('p-complete')?.totalRatio, BV_RATIO_TOTAL);
assert.equal(byId.get('p-complete')?.ratioStatus, 'equal');
assert.equal(byId.get('p-complete')?.staffCount, 2);
assert.equal(byId.get('p-complete')?.staffNames, 'Ada、Ben');
assert.deepEqual(byId.get('p-complete')?.staffNameItems, [
  { staffId: 's-ada', staffName: 'Ada', isMainPm: true },
  { staffId: 's-ben', staffName: 'Ben', isMainPm: false },
]);
assert.equal(byId.get('p-under')?.totalRatio, 50);
assert.equal(byId.get('p-under')?.ratioStatus, 'under');
assert.equal(byId.get('p-under')?.staffNames, 'Ada');
assert.deepEqual(byId.get('p-under')?.staffNameItems, [
  { staffId: 's-ada', staffName: 'Ada', isMainPm: false },
]);
assert.equal(byId.get('p-over')?.totalRatio, 110);
assert.equal(byId.get('p-over')?.ratioStatus, 'over');
assert.equal(byId.get('p-over')?.staffNames, 'Dan、Cara');
assert.deepEqual(byId.get('p-over')?.staffNameItems, [
  { staffId: 's-dan', staffName: 'Dan', isMainPm: true },
  { staffId: 's-cara', staffName: 'Cara', isMainPm: false },
]);
assert.equal(byId.get('p-empty')?.staffCount, 0);
assert.equal(byId.get('p-empty')?.staff.length, 0);
assert.equal(byId.get('p-empty')?.staffNames, '');
assert.deepEqual(byId.get('p-empty')?.staffNameItems, []);
assert.equal(byId.get('p-empty')?.totalRatio, COMPANY_BV_RATIO);
assert.equal(byId.get('p-empty')?.ratioStatus, 'under');
assert.equal(formatBvStaffNames([]), '');
assert.equal(
  formatBvStaffNames([
    staff({ id: 'z1', projectId: 'p-empty', staffId: 's-ghost', staffName: 'Ghost', bvRatio: 0 }),
    staff({ id: 'z2', projectId: 'p-empty', staffId: 's-ada', staffName: 'Ada', bvRatio: 40 }),
    staff({ id: 'z3', projectId: 'p-empty', staffId: 's-ben', staffName: 'Ben', bvRatio: 20 }),
  ]),
  'Ada、Ben',
);
assert.equal(
  formatBvStaffNames(
    [
      staff({ id: 'z2', projectId: 'p-empty', staffId: 's-ada', staffName: 'Ada', bvRatio: 40 }),
      staff({ id: 'z3', projectId: 'p-empty', staffId: 's-ben', staffName: 'Ben', bvRatio: 20 }),
    ],
    { id: 's-ben' },
  ),
  'Ben、Ada',
);
assert.deepEqual(
  listBvStaffNames(
    [
      staff({ id: 'z2', projectId: 'p-empty', staffId: 's-ada', staffName: 'Ada', bvRatio: 40 }),
      staff({ id: 'z3', projectId: 'p-empty', staffId: 's-ben', staffName: 'Ben', bvRatio: 20 }),
    ],
    { name: 'Ben' },
  ),
  [
    { staffId: 's-ben', staffName: 'Ben', isMainPm: true },
    { staffId: 's-ada', staffName: 'Ada', isMainPm: false },
  ],
);

const leftover = groupBvAllocations(
  [
    staff({ id: 'gone', projectId: 'p-empty', staffId: 's-ghost', staffName: 'Ghost', bvRatio: 0 }),
  ],
  projects,
);
assert.equal(leftover.find((row) => row.projectId === 'p-empty')?.staffNames, '');
assert.equal(leftover.find((row) => row.projectId === 'p-empty')?.staffCount, 0);

assert.deepEqual(filterBvAllocations(groups, { ratioStatus: 'equal' }).map((row) => row.projectId), [
  'p-complete',
]);
assert.deepEqual(filterBvAllocations(groups, { ratioStatus: 'under' }).map((row) => row.projectId), [
  'p-under',
  'p-empty',
]);
assert.deepEqual(filterBvAllocations(groups, { search: 'Delta Empty' }).map((row) => row.projectId), [
  'p-empty',
]);
assert.deepEqual(filterBvAllocations(groups, { ratioStatus: 'over' }).map((row) => row.projectId), [
  'p-over',
]);
assert.deepEqual(filterBvAllocations(groups, { search: 'BWA-001' }).map((row) => row.projectId), [
  'p-complete',
]);
assert.deepEqual(filterBvAllocations(groups, { staffId: 's-ada' }).map((row) => row.projectId), [
  'p-complete',
  'p-under',
]);

const stats = summarizeBvAllocations(groups);
assert.equal(stats.total, 4);
assert.equal(stats.equal, 1);
assert.equal(stats.under, 2);
assert.equal(stats.over, 1);

assert.deepEqual(
  uniqueBvStaffOptions(groups).map((row) => row.id),
  ['s-ada', 's-ben', 's-cara', 's-dan'],
);

assert.deepEqual(
  sortBvAllocations(groups, 'signedDate', 'desc').map((row) => row.projectId),
  ['p-over', 'p-complete', 'p-under', 'p-empty'],
);
assert.deepEqual(
  sortBvAllocations(groups, 'totalRatio', 'asc').map((row) => row.projectId),
  ['p-empty', 'p-under', 'p-complete', 'p-over'],
);
assert.deepEqual(nextBvAllocationSort('signedDate', 'desc', 'signedDate'), {
  key: 'signedDate',
  dir: 'asc',
});
assert.deepEqual(nextBvAllocationSort('signedDate', 'desc', 'projectName'), {
  key: 'projectName',
  dir: 'asc',
});

const linkedProjects = new Map<string, BvAllocationProjectInfo>([
  [
    'p-qcp',
    project({
      projectId: 'p-qcp',
      projectName: 'CityU 交換系統',
      relatedType: 'quotation_client',
      relatedId: 'qcp-1',
      quotationClientProjectId: 'qcp-1',
      websiteId: 'site-1',
    }),
  ],
  [
    'p-web',
    project({
      projectId: 'p-web',
      projectName: 'City University of Hong Kong 系統',
      relatedType: 'webandsystem',
      relatedId: 'site-1',
      websiteId: 'site-1',
    }),
  ],
  [
    'p-web-only',
    project({
      projectId: 'p-web-only',
      projectName: 'Standalone site',
      relatedType: 'webandsystem',
      relatedId: 'site-2',
      websiteId: 'site-2',
    }),
  ],
]);

assert.equal(isLinkedWebsiteListing(linkedProjects.get('p-web'), linkedProjects.values()), true);
assert.equal(isLinkedWebsiteListing(linkedProjects.get('p-web-only'), linkedProjects.values()), false);
assert.equal(isLinkedWebsiteListing(linkedProjects.get('p-qcp'), linkedProjects.values()), false);
assert.equal(remapLinkedWebsiteBvProjectId('p-web', linkedProjects), 'p-qcp');
assert.equal(remapLinkedWebsiteBvProjectId('p-web-only', linkedProjects), 'p-web-only');
assert.equal(remapLinkedWebsiteBvProjectId('p-qcp', linkedProjects), 'p-qcp');

const linkedGroups = groupBvAllocations(
  [
    staff({ id: 'wb1', projectId: 'p-web', staffId: 's-lee', staffName: 'Lee', bvRatio: 70 }),
    staff({ id: 'qb1', projectId: 'p-qcp', staffId: 's-ada', staffName: 'Ada', bvRatio: 40 }),
  ],
  linkedProjects,
);
assert.deepEqual(
  linkedGroups.map((row) => row.projectId).sort(),
  ['p-qcp', 'p-web-only'],
);
const cityu = linkedGroups.find((row) => row.projectId === 'p-qcp');
assert.equal(cityu?.staffCount, 2);
assert.deepEqual(cityu?.staff.map((row) => row.staffId).sort(), ['s-ada', 's-lee']);
assert.equal(cityu?.staffNames, 'Lee、Ada');

console.log('finance bv allocation: ok');
