import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const menu = read('src/context/AppContext.tsx');
assert.match(menu, /id: 'supplier'/);
assert.match(menu, /id: 'web-suppliers'/);
assert.match(menu, /id: 'supplier-types'/);
assert.match(menu, /label: '供應商類型', section: '設置'/);

const module = read('src/components/supplier/SupplierModule.tsx');
assert.match(module, /SupplierTypesSettings/);
assert.match(module, /active === 'supplier-types'/);
assert.doesNotMatch(module, /此供應商子頁面已移除/);

const hook = read('src/hooks/useSupplierTypes.ts');
assert.match(hook, /from\('supplier_types'\)/);
assert.match(hook, /const addType/);
assert.match(hook, /const updateType/);
assert.match(hook, /const deleteType/);
assert.match(hook, /const countUsage/);
assert.match(hook, /countExact\('suppliers'/);
assert.match(hook, /countExact\('expenses'/);

const page = read('src/components/supplier/SupplierTypesSettings.tsx');
assert.match(page, /useSupplierTypes/);
assert.match(page, /SUPPLIER_TYPE_CATEGORIES/);
assert.match(page, /新增類型/);
assert.match(page, /顯示名稱/);
assert.match(page, /分類/);
assert.match(page, /countUsage/);
assert.match(page, /DeleteConfirmModal/);

const migration = read('supabase/migrations/20260903082743_expand_suppliers_and_create_supplier_types.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.supplier_types/);
assert.match(migration, /categories\s+text NOT NULL CHECK \(categories IN \('網站', '活動', '影片'\)\)/);
assert.match(migration, /UNIQUE \(categories, display_name\)/);

console.log('supplier types settings: ok');
