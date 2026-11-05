import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20261105020645_add_bwt_active_2_asana_pending_sync.sql'),
  'utf8',
);

assert.match(migration, /1208704092427508/);
assert.match(migration, /1208704092427578/);
assert.match(migration, /6649488167653/);
assert.match(migration, /BWT Active 2 真客 Pitching Proposal/);
assert.match(migration, /BWT Active 2A 重大項目投標 Key Pitching/);
assert.match(migration, /ARRAY\['bwt_web', 'bwt_system'\]/);
assert.match(migration, /'created_from'/);
assert.match(migration, /sync_year_from[\s\S]*2026/);
assert.doesNotMatch(migration, /bwg_gift/);
assert.doesNotMatch(migration, /1208705575047961/);
assert.doesNotMatch(migration, /1208705576408348/);

const fn = readFileSync(join(root, 'supabase/functions/sync-asana-pitching/index.ts'), 'utf8');
assert.match(fn, /\.eq\("enabled", true\)/);
assert.doesNotMatch(fn, /1208704092427508/);

console.log('asana bwt active 2 sync: ok');
