import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(existsSync(join(root, 'src/hooks/useQuotations.ts')), false);
assert.equal(existsSync(join(root, 'src/components/quotation/QuotationItemsManagement.tsx')), false);
assert.equal(existsSync(join(root, 'src/components/quotation/QuotationPreview.tsx')), false);
assert.equal(existsSync(join(root, 'src/components/quotation/QuotationInlineEditor.tsx')), false);
assert.equal(existsSync(join(root, 'src/lib/quotation-pdf.ts')), false);
assert.equal(existsSync(join(root, 'src/lib/quotationAiApi.ts')), false);
assert.equal(existsSync(join(root, 'src/components/quotation/ClientRequirementsQuestionnaire.tsx')), false);
assert.equal(existsSync(join(root, 'src/data/clientRequirementsQuestionnaire.ts')), false);
assert.equal(existsSync(join(root, 'supabase/functions/generate-quotation-services/index.ts')), false);

const menu = read('src/context/AppContext.tsx');
assert.doesNotMatch(menu, /id: 'new', label: '新建報價單'/);
assert.doesNotMatch(menu, /id: 'items', label: '報價項目'/);
assert.match(menu, /id: 'list', label: '報價單列表'/);
assert.match(menu, /sub === 'new' \|\| sub === 'items'/);
assert.match(menu, /subModule: 'list'/);

const data = read('src/data/quotationData.ts');
assert.doesNotMatch(data, /export const quotationEntries/);
assert.doesNotMatch(data, /export const clientProjects/);

const cache = read('src/lib/queryCache.ts');
assert.doesNotMatch(cache, /quotation_entry/);
assert.doesNotMatch(cache, /quotations:/);

const migration = read('supabase/migrations/20260907084555_drop_quotation_entry.sql');
assert.match(migration, /DROP TABLE IF EXISTS public\.quotation_entry CASCADE/);

const liveSources = [
  'src/components/quotation/QuotationModule.tsx',
  'src/hooks/useQuotationDocs.ts',
  'src/lib/queryCache.ts',
].map(read).join('\n');
assert.doesNotMatch(liveSources, /from\('quotation_entry'\)/);
assert.doesNotMatch(liveSources, /QUOTATION_ENTRY_TABLE/);

console.log('drop quotation generation: ok');
