import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterProjectSelectItems,
  kindsInItems,
  projectSelectKindLabel,
  type ProjectSelectItem,
} from '../src/lib/searchableProjectSelect';

const items: ProjectSelectItem[] = [
  { id: 'q1', name: 'BWT System - 綜合醫療體檢中心 - Milk +852 6808 1326', kind: 'quotation_client', relatedId: 'qc-1' },
  { id: 'w1', name: 'BWT System Portal', kind: 'website', relatedId: 'ws-1' },
  { id: 's1', name: 'BWT Internal Tool', kind: 'system', relatedId: 'sys-1' },
  { id: 'v1', name: 'BWA Video Channel', kind: 'vchannel', relatedId: 'vc-1' },
];

assert.deepEqual(kindsInItems(items), [
  'website',
  'system',
  'quotation_client',
  'vchannel',
]);
assert.deepEqual(kindsInItems([{ id: 's1', name: 'Leo Tse' }]), []);

assert.equal(filterProjectSelectItems(items, '', 'all').length, 4);
assert.deepEqual(
  filterProjectSelectItems(items, 'BWT', 'all').map((item) => item.id),
  ['q1', 'w1', 's1'],
);
assert.deepEqual(
  filterProjectSelectItems(items, 'BWT', 'quotation_client').map((item) => item.id),
  ['q1'],
);
assert.deepEqual(
  filterProjectSelectItems(items, 'BWT', 'website').map((item) => item.id),
  ['w1'],
);
assert.deepEqual(
  filterProjectSelectItems(items, 'BWT', 'system').map((item) => item.id),
  ['s1'],
);
assert.deepEqual(
  filterProjectSelectItems(items, '綜合醫療體檢中心', 'quotation_client').map((item) => item.id),
  ['q1'],
);
assert.equal(filterProjectSelectItems(items, '綜合醫療體檢中心', 'website').length, 0);
assert.equal(projectSelectKindLabel('all'), '全部');
assert.equal(projectSelectKindLabel('quotation_client'), '客戶項目');
assert.equal(projectSelectKindLabel('website'), '網站');
assert.equal(projectSelectKindLabel('system'), '系統');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const selectSrc = read('src/components/day-report/SearchableProjectSelect.tsx');
assert.match(selectSrc, /showTypeFilters/);
assert.match(selectSrc, /kindFilter/);
assert.match(selectSrc, /projectSelectKindLabel/);
assert.match(selectSrc, /KindBadge/);
assert.doesNotMatch(selectSrc, /relatedTypeFilter/);
assert.doesNotMatch(selectSrc, /自訂/);

const submitSrc = read('src/components/day-report/SubmitReportPage.tsx');
assert.match(submitSrc, /toProjectSelectItem/);
assert.doesNotMatch(submitSrc, /relatedType: p\.relatedType/);

const overviewSrc = read('src/components/project/ProjectOverview.tsx');
assert.match(overviewSrc, /key: 'website'/);
assert.doesNotMatch(overviewSrc, /key: 'manual'/);
assert.doesNotMatch(overviewSrc, /setCategoryFilter/);
assert.doesNotMatch(overviewSrc, /內部項目/);

console.log('searchable project select filters: ok');
