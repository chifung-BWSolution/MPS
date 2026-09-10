import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const hook = read('src/hooks/useQuotationClientProjects.ts');
assert.match(hook, /\.insert\(row\)/);
assert.match(hook, /select\('id, pitching_code, created_at, updated_at'\)/);
assert.doesNotMatch(hook, /MPS-\$\{/);
assert.doesNotMatch(hook, /pitching_code: data\.pitchingId/);

const asanaUi = read('src/components/quotation/AsanaPendingModule.tsx');
assert.doesNotMatch(asanaUi, /ASANA-\$\{/);

const asanaShared = read('supabase/functions/_shared/asana-pitching.ts');
assert.doesNotMatch(asanaShared, /ASANA-\$\{task\.gid/);

const migration = read(
  'supabase/migrations/20260910034452_pitching_code_from_inquiry_and_type.sql',
);
assert.match(migration, /bwt_system' = ANY\(p_types\) THEN 'BWT-S'/);
assert.match(migration, /bwl_event' = ANY\(p_types\) THEN 'BWL-E'/);
assert.match(migration, /bwg_gift' = ANY\(p_types\) THEN 'BWG-G'/);
assert.match(migration, /ELSE 'BWT-W'/);
assert.match(migration, /EXTRACT\(MONTH FROM p_inquiry_date\) >= 4/);
assert.match(migration, /ASANA-32248664/);
assert.match(migration, /trg_assign_pitching_code/);
assert.match(migration, /allocate_pitching_code/);

const reallocate = read(
  'supabase/migrations/20260910060003_pitching_code_reallocate_on_inquiry_date.sql',
);
assert.match(reallocate, /BEFORE INSERT OR UPDATE ON public\.quotation_client_project/);
assert.match(reallocate, /v_fy_label/);
assert.match(reallocate, /allocate_pitching_code/);

console.log('pitching code: ok');
