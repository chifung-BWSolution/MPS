import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20261113102806_add_bwl_wine_event_client_asana_pending_sync.sql'),
  'utf8',
);

assert.match(migration, /6985906817346/);
assert.match(migration, /6649488167653/);
assert.match(migration, /B2B Wine Event Client 跟進 商業客戶/);
assert.match(migration, /ARRAY\['bwl_event'\]/);
assert.match(migration, /'created_from'/);
assert.match(migration, /sync_year_from[\s\S]*2026/);
assert.match(migration, /'Work Status'/);
assert.match(migration, /true,\s*\n\s*NULL,\s*\n\s*'Work Status'/);
assert.doesNotMatch(migration, /1204991149926904/);
assert.doesNotMatch(migration, /bwg_gift/);
assert.doesNotMatch(migration, /bwt_web/);

console.log('asana bwl wine event client sync: ok');
