import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const migration = read(
  'supabase/migrations/20260825070000_quotation_client_projects_open_is_active.sql',
);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.trg_sync_projects_from_quotation_client/);
assert.match(
  migration,
  /\(COALESCE\(NEW\.status, ''\) IS DISTINCT FROM 'closed'\)/,
);
assert.doesNotMatch(
  migration,
  /\(COALESCE\(NEW\.status, ''\) = 'confirmed'\)/,
);
assert.match(
  migration,
  /WHERE p\.related_type = 'quotation_client'/,
);
assert.match(
  migration,
  /is_active = \(COALESCE\(p\.status, ''\) IS DISTINCT FROM 'closed'\)/,
);

const dayReport = read('src/components/day-report/DayReportModule.tsx');
assert.match(dayReport, /useProjects\(\{ activeOnly: true \}\)/);

const categories = read('src/components/day-report/WorkCategoriesManager.tsx');
assert.match(categories, /必須選擇一個未結案的客戶項目/);

console.log('quotation client open is_active: ok');
