import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PITCHING_CURRENCY } from '../src/data/pitchingData';

assert.equal(PITCHING_CURRENCY, 'HKD');

const hook = readFileSync(new URL('../src/hooks/useQuotationClientProjects.ts', import.meta.url), 'utf8');
assert.doesNotMatch(hook, /estimated_income_currency/);
assert.doesNotMatch(hook, /row\.company_name_en/);
assert.doesNotMatch(hook, /row\.company_name_zh/);
assert.match(hook, /quotation_client_list \( company_name_zh, company_name_en \)/);

const asana = readFileSync(
  new URL('../supabase/functions/_shared/asana-pitching.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(asana, /asana_status_label/);

const budget = readFileSync(
  new URL('../src/components/quotation/PitchingBudgetTab.tsx', import.meta.url),
  'utf8',
);
assert.doesNotMatch(budget, /currencyDraft/);
assert.match(budget, /PITCHING_CURRENCY/);

console.log('pitching cleanup: ok');
