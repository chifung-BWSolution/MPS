import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BV_RATIO_TOTAL,
  parseBvRatio,
  remainingBvRatio,
  sumBvRatios,
  wouldExceedBvTotal,
} from '../src/lib/quotationBv';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(parseBvRatio(''), null);
assert.equal(parseBvRatio(0), null);
assert.equal(parseBvRatio(100.01), null);
assert.equal(parseBvRatio(50), 50);
assert.equal(parseBvRatio('33.333'), 33.33);
assert.equal(sumBvRatios([50, 25, 25]), BV_RATIO_TOTAL);
assert.equal(remainingBvRatio([40, 20]), 40);
assert.equal(wouldExceedBvTotal(80, 30), true);
assert.equal(wouldExceedBvTotal(70, 30), false);

const migration = read('supabase/migrations/20260825110000_create_quotation_bv.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.quotation_bv/);
assert.match(migration, /quotation_client_project_id text NOT NULL/);
assert.match(migration, /staff_id uuid NOT NULL/);
assert.match(migration, /bv_ratio numeric\(6, 2\) NOT NULL/);
assert.match(migration, /REFERENCES public\.quotation_client_project\(id\)/);
assert.match(migration, /REFERENCES public\.staffs\(id\)/);
assert.match(migration, /INSERT INTO public\.quotation_bv/);
assert.match(migration, /SELECT p\.id, p\.main_pm_id, 100/);
assert.match(migration, /FROM public\.quotation_client_project p/);
assert.match(migration, /WHERE p\.main_pm_id IS NOT NULL/);

const hook = read('src/hooks/useQuotationBv.ts');
assert.match(hook, /QUOTATION_BV_TABLE/);
assert.match(hook, /quotation_client_project_id/);
assert.match(hook, /staff:staffs!staff_id/);
assert.match(hook, /const addRow/);
assert.match(hook, /const updateRow/);
assert.match(hook, /const deleteRow/);

const card = read('src/components/quotation/QuotationBvCard.tsx');
assert.match(card, /協作者 Collaborators/);
assert.match(card, /useQuotationBv/);
assert.match(card, /addRow/);
assert.match(card, /updateRow/);
assert.match(card, /deleteRow/);
assert.match(card, /DeleteConfirmModal/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /QuotationBvCard/);
assert.match(pitching, /<QuotationBvCard projectId=\{record\.id\} \/>/);
assert.match(pitching, /xl:grid-cols-\[minmax\(0,1fr\)_360px\]/);
assert.match(pitching, /label="提案描述"/);
assert.doesNotMatch(
  pitching,
  /border-t border-border pt-4[\s\S]*label="提案描述"/,
);

const project = read('src/components/quotation/ProjectModule.tsx');
assert.match(project, /PitchingDetail/);

console.log('quotation bv: ok');
