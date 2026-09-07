import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUOTATION_DOC_TYPES_TABLE } from '../src/lib/quotationDocs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(QUOTATION_DOC_TYPES_TABLE, 'quotation_doc_types');

const menu = read('src/context/AppContext.tsx');
assert.match(menu, /id: 'quotation'/);
assert.match(menu, /id: 'doc-types'/);
assert.match(menu, /label: '文件類型', section: '設置'/);

const module = read('src/components/quotation/QuotationModule.tsx');
assert.match(module, /QuotationDocTypesSettings/);
assert.match(module, /subModule === 'doc-types'/);

const hook = read('src/hooks/useQuotationDocTypes.ts');
assert.match(hook, /QUOTATION_DOC_TYPES_TABLE/);
assert.match(hook, /from\(QUOTATION_DOC_TYPES_TABLE\)/);
assert.match(hook, /const addType/);
assert.match(hook, /const updateType/);
assert.match(hook, /const deleteType/);
assert.match(hook, /const countUsage/);
assert.match(hook, /from\('quotation_docs'\)/);
assert.match(hook, /\.eq\('doc_type', id\)/);

const page = read('src/components/quotation/QuotationDocTypesSettings.tsx');
assert.match(page, /useQuotationDocTypes/);
assert.match(page, /新增類型/);
assert.match(page, /顯示名稱/);
assert.match(page, /countUsage/);
assert.match(page, /DeleteConfirmModal/);

const migration = read('supabase/migrations/20260907082750_create_quotation_doc_types.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.quotation_doc_types/);
assert.match(migration, /display text NOT NULL UNIQUE/);
assert.match(migration, /is_active boolean NOT NULL DEFAULT true/);
assert.match(migration, /created_at timestamptz NOT NULL DEFAULT now\(\)/);
assert.match(migration, /updated_at timestamptz NOT NULL DEFAULT now\(\)/);
assert.match(migration, /quotation_docs_doc_type_fkey/);
assert.match(migration, /REFERENCES public\.quotation_doc_types\(id\) ON DELETE RESTRICT/);
assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.quotation_doc_types TO authenticated/);

console.log('quotation doc types: ok');
