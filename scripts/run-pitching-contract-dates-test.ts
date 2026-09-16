import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SIGNED_QUOTATION_CONTRACT_DOC_TYPE_ID,
  contractDatesFromProject,
  isSignedQuotationContractDocType,
  signedContractProjectDates,
  validateContractDates,
} from '../src/lib/quotationDocs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(validateContractDates('2026-01-10', '2026-01-09'), '合約結束日期不可早於開始日期');
assert.equal(validateContractDates('2026-01-10', '2026-01-11'), null);
assert.equal(validateContractDates(undefined, '2026-01-11'), null);
assert.deepEqual(contractDatesFromProject({ contractStartDate: '2026-02-01', contractEndDate: '2026-12-31' }), {
  contractStartDate: '2026-02-01',
  contractEndDate: '2026-12-31',
});
assert.equal(isSignedQuotationContractDocType(SIGNED_QUOTATION_CONTRACT_DOC_TYPE_ID), true);
assert.equal(isSignedQuotationContractDocType('d2b6c029-5850-43b5-80fd-5855b5c80699'), false);
assert.deepEqual(
  signedContractProjectDates({
    docTypeId: SIGNED_QUOTATION_CONTRACT_DOC_TYPE_ID,
    contractStartDate: '2026-03-01',
    contractEndDate: '2026-09-01',
  }),
  { contractStartDate: '2026-03-01', contractEndDate: '2026-09-01' },
);
assert.equal(
  signedContractProjectDates({
    docTypeId: 'd2b6c029-5850-43b5-80fd-5855b5c80699',
    contractStartDate: '2026-03-01',
    contractEndDate: '2026-09-01',
  }),
  null,
);

const migration = read('supabase/migrations/20260916084852_quotation_client_project_contract_dates.sql');
assert.match(migration, /ADD COLUMN IF NOT EXISTS contract_start_date date/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS contract_end_date date/);

const hook = read('src/hooks/useQuotationClientProjects.ts');
assert.match(hook, /contract_start_date: string \| null/);
assert.match(hook, /contract_end_date: string \| null/);
assert.match(hook, /contractStartDate: optionalIsoDate\(row\.contract_start_date\)/);
assert.match(hook, /contractEndDate: optionalIsoDate\(row\.contract_end_date\)/);
assert.match(hook, /contract_start_date: optionalIsoDate\(data\.contractStartDate\) \?\? null/);
assert.match(hook, /contract_end_date: optionalIsoDate\(data\.contractEndDate\) \?\? null/);
assert.match(hook, /\| 'contractStartDate'/);
assert.match(hook, /\| 'contractEndDate'/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /合約開始日期 Contract Start Date/);
assert.match(pitching, /合約結束日期 Contract End Date/);
assert.match(pitching, /label="合約開始日期"/);
assert.match(pitching, /label="合約結束日期"/);
assert.match(pitching, /contractStartDate: form\.contractStartDate/);
assert.match(pitching, /contractEndDate: form\.contractEndDate/);
assert.match(pitching, /\{draft\.contractStartDate \|\| '—'\}/);
assert.match(pitching, /\{draft\.contractEndDate \|\| '—'\}/);

const dialog = read('src/components/quotation/QuotationDocFormDialog.tsx');
assert.match(dialog, /isSignedQuotationContractDocType\(draft\.docTypeId\)/);
assert.match(dialog, /合約開始日期/);
assert.match(dialog, /合約結束日期/);
assert.match(dialog, /contractStartDate/);
assert.match(dialog, /contractEndDate/);

const tab = read('src/components/quotation/PitchingDocsTab.tsx');
assert.match(tab, /signedContractProjectDates/);
assert.match(tab, /updateRecord\(projectId, contractPatch\)/);

const list = read('src/components/quotation/QuotationDocsList.tsx');
assert.match(list, /signedContractProjectDates/);
assert.match(list, /updateRecord\(projectId, contractPatch\)/);

console.log('pitching contract dates: ok');
