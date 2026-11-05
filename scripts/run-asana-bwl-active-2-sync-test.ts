import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20261105022810_add_bwl_active_2_asana_pending_sync.sql'),
  'utf8',
);

assert.match(migration, /1210778431910916/);
assert.match(migration, /1211379536259396/);
assert.match(migration, /6649488167653/);
assert.match(migration, /BWL Active 2 真客 緊密互動 Design Pitching/);
assert.match(migration, /BWL Active 2A Website 高機會投標 Pitching/);
assert.match(migration, /ARRAY\['bwl_event'\]/);
assert.match(migration, /'created_from'/);
assert.match(migration, /sync_year_from[\s\S]*2026/);
assert.doesNotMatch(migration, /bwg_gift/);
assert.doesNotMatch(migration, /1211381923073269/);
assert.doesNotMatch(migration, /1210779088346126/);

const website = migration.slice(migration.indexOf("'1211379536259396'"));
assert.match(website, /true,\s*\n\s*NULL,\s*\n\s*'狀態'/);

console.log('asana bwl active 2 sync: ok');
