import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260915024835_split_mixed_project_types_from_title.sql'),
  'utf8',
);

assert.match(migration, /DISABLE TRIGGER trg_assign_pitching_code/);
assert.match(migration, /ENABLE TRIGGER trg_assign_pitching_code/);
assert.match(migration, /網站\|網頁\|website/);
assert.match(migration, /系統\|程式\|system\|網店/);
assert.match(migration, /活動\|event/);
assert.match(migration, /BWT-S26-001/);
assert.match(migration, /ARRAY\['bwt_system'\]/);
assert.match(migration, /quotation_client_project/);
assert.doesNotMatch(migration, /allocate_pitching_code/);

console.log('split mixed project types: ok');
