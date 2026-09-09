import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const shared = read('supabase/functions/_shared/asana-pitching.ts');
assert.match(shared, /"all" \| "pipeline"/);
assert.match(shared, /if \(mode === "all"\) return true;/);
assert.match(shared, /includeCompleted\?: boolean/);
assert.match(shared, /completed_since/);
assert.match(shared, /1970-01-01T00:00:00\.000Z/);

const fn = read('supabase/functions/sync-asana-pitching/index.ts');
assert.match(fn, /includeCompleted:\s*project\.sync_date_mode === "all"/);
assert.match(fn, /\.eq\("enabled", true\)/);
assert.doesNotMatch(fn, /project_gid === '1210520368067621'/);

const migration = read('supabase/migrations/20260909095810_asana_bwg_gift_sync.sql');
assert.match(migration, /1210520368067621/);
assert.match(migration, /6649488167653/);
assert.match(migration, /ARRAY\['bwg_gift'\]/);
assert.match(migration, /sync_date_mode[\s\S]*'all'/);
assert.match(migration, /sync_project_types_only[\s\S]*true/);
assert.match(migration, /sync_default_status[\s\S]*'initial'/);
assert.match(migration, /asana-pitching-daily/);
assert.match(migration, /functions\/v1\/sync-asana-pitching/);
assert.match(migration, /0 21 \* \* \*/);
assert.doesNotMatch(migration, /1210520368067646/);
assert.doesNotMatch(migration, /Bearer eyJ/);

const hook = read('src/hooks/useAsanaSyncedTasks.ts');
assert.match(hook, /sync_date_mode/);
assert.match(hook, /invokeAsanaPitchingSync/);

const api = read('src/lib/asanaPitchingApi.ts');
assert.match(api, /sync-asana-pitching/);
assert.match(api, /JSON\.stringify\(body\)/);

const pending = read('src/components/quotation/AsanaPendingModule.tsx');
assert.match(pending, /syncDateMode === 'all'/);
assert.match(pending, /同步全部任務/);

console.log('asana bwg sync: ok');
