import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterProjectSelectItems,
  projectSelectTypeLabel,
  relatedTypesInItems,
  type ProjectSelectItem,
} from '../src/lib/searchableProjectSelect';

const items: ProjectSelectItem[] = [
  { id: 'q1', name: 'BWT System - 綜合醫療體檢中心 - Milk +852 6808 1326', relatedType: 'quotation_client' },
  { id: 'w1', name: 'BWT System Portal', relatedType: 'webandsystem' },
  { id: 'v1', name: 'BWA Video Channel', relatedType: 'vchannel' },
  { id: 'm1', name: 'Internal standup', relatedType: 'manual' },
];

assert.deepEqual(relatedTypesInItems(items), [
  'webandsystem',
  'quotation_client',
  'vchannel',
  'manual',
]);
assert.deepEqual(relatedTypesInItems([{ id: 's1', name: 'Leo Tse' }]), []);

assert.equal(filterProjectSelectItems(items, '', 'all').length, 4);
assert.deepEqual(
  filterProjectSelectItems(items, 'BWT', 'all').map((item) => item.id),
  ['q1', 'w1'],
);
assert.deepEqual(
  filterProjectSelectItems(items, 'BWT', 'quotation_client').map((item) => item.id),
  ['q1'],
);
assert.deepEqual(
  filterProjectSelectItems(items, '綜合醫療體檢中心', 'quotation_client').map((item) => item.id),
  ['q1'],
);
assert.equal(filterProjectSelectItems(items, '綜合醫療體檢中心', 'webandsystem').length, 0);
assert.equal(projectSelectTypeLabel('all'), '全部');
assert.equal(projectSelectTypeLabel('quotation_client'), '客戶項目');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const selectSrc = read('src/components/day-report/SearchableProjectSelect.tsx');
assert.match(selectSrc, /showTypeFilters/);
assert.match(selectSrc, /relatedTypeFilter/);
assert.match(selectSrc, /projectSelectTypeLabel/);
assert.match(selectSrc, /RelatedTypeBadge/);

const submitSrc = read('src/components/day-report/DayReportModule.tsx');
assert.match(submitSrc, /relatedType: p\.relatedType/);
assert.doesNotMatch(submitSrc, /\$\{p\.name\}（\$\{relatedTypeLabels/);
assert.doesNotMatch(submitSrc, /Strip type suffix/);

console.log('searchable project select filters: ok');
