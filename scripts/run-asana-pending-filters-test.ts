import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASANA_CASE_CLOSED_REASONS,
  formatAsanaCaseClosedComment,
  formatAsanaCaseReopenedComment,
  isAsanaTaskCaseClosed,
  isAsanaTaskExpired,
  matchesAsanaPendingFilters,
} from '../src/lib/asanaPendingFilters';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.deepEqual(ASANA_CASE_CLOSED_REASONS, [
  '客戶沒有回覆',
  '客戶純粹為了取得報價單',
  '客戶預算不足',
  '客戶已選擇其他公司',
  '客戶要求超出服務範圍',
  '高風險項目，放棄跟進',
  '已超過客人招標死線',
  '長時間未有PM跟進',
]);

assert.equal(isAsanaTaskCaseClosed(''), false);
assert.equal(isAsanaTaskCaseClosed('   '), false);
assert.equal(isAsanaTaskCaseClosed(null), false);
assert.equal(isAsanaTaskCaseClosed('客戶沒有回覆'), true);
assert.equal(formatAsanaCaseClosedComment('客戶沒有回覆', 'Mak Wai Ki'), '放棄跟進（Mak Wai Ki）：客戶沒有回覆');
assert.equal(formatAsanaCaseReopenedComment('Mak Wai Ki'), '已取消放棄跟進（Mak Wai Ki）');
assert.equal(formatAsanaCaseClosedComment('客戶預算不足', ''), '放棄跟進（MPS）：客戶預算不足');

assert.equal(isAsanaTaskExpired('2026-08-25', '2026-08-25'), false);
assert.equal(isAsanaTaskExpired('2026-07-12', '2026-08-25'), false);
assert.equal(isAsanaTaskExpired('2026-07-11', '2026-08-25'), true);
assert.equal(isAsanaTaskExpired('2026-07-10', '2026-08-25'), true);
assert.equal(isAsanaTaskExpired('', '2026-08-25'), false);

const openFresh = { imported: false, inquiryDate: '2026-08-25', caseClosedReason: '' };
const importedExpired = {
  imported: true,
  inquiryDate: '2026-07-01',
  caseClosedReason: '',
};
const closedFresh = {
  imported: false,
  inquiryDate: '2026-08-20',
  caseClosedReason: '客戶預算不足',
};

const defaults = {
  importFilter: 'pending' as const,
  expiredFilter: 'all' as const,
  caseClosedFilter: 'pending' as const,
};

assert.equal(matchesAsanaPendingFilters(openFresh, defaults, '2026-08-25'), true);
assert.equal(matchesAsanaPendingFilters(importedExpired, defaults, '2026-08-25'), false);
assert.equal(matchesAsanaPendingFilters(closedFresh, defaults, '2026-08-25'), false);

assert.equal(
  matchesAsanaPendingFilters(importedExpired, { ...defaults, importFilter: 'imported' }, '2026-08-25'),
  true,
);
assert.equal(
  matchesAsanaPendingFilters(openFresh, { ...defaults, importFilter: 'imported' }, '2026-08-25'),
  false,
);
assert.equal(
  matchesAsanaPendingFilters(importedExpired, { ...defaults, importFilter: 'all' }, '2026-08-25'),
  true,
);

assert.equal(
  matchesAsanaPendingFilters(importedExpired, { ...defaults, importFilter: 'all', expiredFilter: 'expired' }, '2026-08-25'),
  true,
);
assert.equal(
  matchesAsanaPendingFilters(openFresh, { ...defaults, expiredFilter: 'expired' }, '2026-08-25'),
  false,
);
assert.equal(
  matchesAsanaPendingFilters(openFresh, { ...defaults, expiredFilter: 'not_expired' }, '2026-08-25'),
  true,
);

assert.equal(
  matchesAsanaPendingFilters(closedFresh, { ...defaults, caseClosedFilter: 'closed' }, '2026-08-25'),
  true,
);
assert.equal(
  matchesAsanaPendingFilters(openFresh, { ...defaults, caseClosedFilter: 'closed' }, '2026-08-25'),
  false,
);
assert.equal(
  matchesAsanaPendingFilters(closedFresh, { ...defaults, caseClosedFilter: 'all' }, '2026-08-25'),
  true,
);

const migration = read('supabase/migrations/20260911092638_asana_synced_tasks_case_closed_reason.sql');
assert.match(migration, /asana_synced_tasks/);
assert.match(migration, /case_closed_reason text/);

const hook = read('src/hooks/useAsanaSyncedTasks.ts');
assert.match(hook, /case_closed_reason/);
assert.match(hook, /updateCaseClosedReason/);
assert.match(hook, /closeAsanaSyncedTask/);

const sync = read('supabase/functions/_shared/asana-pitching.ts');
assert.match(sync, /case_closed_reason is user-set/);
assert.match(sync, /updateAsanaTask/);
assert.match(sync, /createAsanaTaskComment/);
assert.match(sync, /formatAsanaCaseClosedComment/);
assert.doesNotMatch(sync, /case_closed_reason:/);

const closeFn = read('supabase/functions/asana-close-synced-task/index.ts');
assert.match(closeFn, /updateAsanaTask/);
assert.match(closeFn, /createAsanaTaskComment/);
assert.match(closeFn, /completed: closing/);
assert.match(closeFn, /asana_synced_tasks/);

const api = read('src/lib/asanaPitchingApi.ts');
assert.match(api, /asana-close-synced-task/);
assert.match(api, /closeAsanaSyncedTask/);

const pending = read('src/components/quotation/AsanaPendingModule.tsx');
assert.match(pending, /取消跟進/);
assert.match(pending, /expiredFilter/);
assert.match(pending, /caseClosedFilter/);
assert.match(pending, /value="imported"/);
assert.match(pending, /value="not_expired"/);
assert.match(pending, /value="closed"/);
assert.match(pending, /colSpan=\{8\}/);
assert.doesNotMatch(pending, />\s*狀態\s*</);

console.log('asana pending filters: ok');
