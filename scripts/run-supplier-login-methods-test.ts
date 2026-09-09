import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const migration = read('supabase/migrations/20260908092647_supplier_login_methods.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.supplier_login_methods/);
assert.match(migration, /supplier_id\s+text NOT NULL REFERENCES public\.suppliers\(id\) ON DELETE CASCADE/);
assert.match(migration, /login_method_id\s+uuid NOT NULL REFERENCES public\.vchannel_login_methods\(id\) ON DELETE CASCADE/);
assert.match(migration, /PRIMARY KEY \(supplier_id, login_method_id\)/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);

const types = read('src/types/marketingOps.ts');
assert.match(types, /loginMethodIds: string\[\]/);
assert.match(types, /linkedLoginMethods: SupplierLinkedLoginMethod\[\]/);

const hook = read('src/hooks/useWebPageSuppliers.ts');
assert.match(hook, /JOIN_TABLE = 'supplier_login_methods'/);
assert.match(hook, /from\('vchannel_login_methods'\)/);
assert.match(hook, /async function syncSupplierLoginMethods/);
assert.match(hook, /data\.loginMethodIds/);

const page = read('src/components/supplier/WebPageSupplierModule.tsx');
assert.match(page, /VchannelLoginMethodPicker/);
assert.match(page, /loginMethodIds/);
assert.match(page, /linkedLoginMethods/);

console.log('supplier login methods: ok');
