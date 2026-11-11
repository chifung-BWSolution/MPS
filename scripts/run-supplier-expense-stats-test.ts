import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateSupplierExpenseStats } from '../src/lib/supplierExpenseStats.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const stats = aggregateSupplierExpenseStats([
  { supplier_id: 's1', related_id: 'p1', billed_amount: 1000 },
  { supplier_id: 's1', related_id: 'p1', billed_amount: '250.5' },
  { supplier_id: 's1', related_id: 'p2', billed_amount: 10 },
  { supplier_id: 's2', related_id: 'p2', billed_amount: 80 },
  { supplier_id: '  ', related_id: 'p9', billed_amount: 999 },
  { supplier_id: 's3', related_id: '  ', billed_amount: 40 },
  { supplier_id: 's3', related_id: 'p3', billed_amount: 'nope' },
]);

assert.deepEqual(stats.get('s1'), { projectCount: 2, cooperationAmount: 1260.5 });
assert.deepEqual(stats.get('s2'), { projectCount: 1, cooperationAmount: 80 });
assert.deepEqual(stats.get('s3'), { projectCount: 1, cooperationAmount: 40 });
assert.equal(stats.has(''), false);

const hook = read('src/hooks/useSupplierExpenseStats.ts');
assert.match(hook, /EXPENSES_TABLE/);
assert.match(hook, /EXPENSE_RELATED_TYPE_PROJECT/);
assert.match(hook, /supplier_id, related_id, billed_amount/);
assert.match(hook, /aggregateSupplierExpenseStats/);

const page = read('src/components/supplier/WebPageSupplierModule.tsx');
assert.match(page, /登入方式<\/th>\s*<th[^>]*>項目數<\/th>\s*<th[^>]*>合作金額<\/th>/);
assert.match(page, /useSupplierExpenseStats/);
assert.match(page, /projectCount/);
assert.match(page, /cooperationAmount/);

console.log('supplier expense stats: ok');
