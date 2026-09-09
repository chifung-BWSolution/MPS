import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const migration = read(
  'supabase/migrations/20260909080749_rename_vchannel_login_methods_to_login_methods.sql',
);
assert.match(migration, /ALTER TABLE public\.vchannel_login_methods RENAME TO login_methods/);
assert.match(migration, /RENAME TO login_methods_pkey/);
assert.match(migration, /RENAME TO "Allow select on login_methods"/);
assert.match(migration, /COMMENT ON TABLE public\.login_methods/);
assert.match(migration, /Join: vchannel_accounts ↔ login_methods/);
assert.match(migration, /Join: suppliers ↔ login_methods/);
assert.match(migration, /vchannel_account_login_methods/);
assert.match(migration, /supplier_login_methods/);

const catalogHook = read('src/hooks/useVideoLoginMethods.ts');
assert.match(catalogHook, /TABLE = 'login_methods'/);
assert.doesNotMatch(catalogHook, /vchannel_login_methods/);

const accountHook = read('src/hooks/useVchannelAccounts.ts');
assert.match(accountHook, /JOIN_TABLE = 'vchannel_account_login_methods'/);
assert.match(accountHook, /from\('login_methods'\)/);
assert.doesNotMatch(accountHook, /from\('vchannel_login_methods'\)/);

const supplierHook = read('src/hooks/useWebPageSuppliers.ts');
assert.match(supplierHook, /JOIN_TABLE = 'supplier_login_methods'/);
assert.match(supplierHook, /from\('login_methods'\)/);
assert.doesNotMatch(supplierHook, /from\('vchannel_login_methods'\)/);

console.log('login_methods rename: ok');
