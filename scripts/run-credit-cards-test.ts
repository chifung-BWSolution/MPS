import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  creditCardYearOptions,
  formatCompanyOptionLabel,
  isCardExpiringSoon,
  isValidExpiry,
  isValidLastFour,
  joinExpiry,
  normalizeLastFour,
  splitExpiry,
} from '../src/lib/creditCards';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(normalizeLastFour('12ab34'), '1234');
assert.equal(isValidLastFour('4523'), true);
assert.equal(isValidLastFour('452'), false);
assert.equal(isValidExpiry('2026-08'), true);
assert.equal(isValidExpiry('2026-13'), false);
assert.equal(isValidExpiry('2026-8'), false);
assert.deepEqual(splitExpiry('2027-08'), { year: '2027', month: '08' });
assert.equal(joinExpiry('2027', '08'), '2027-08');
assert.equal(isValidExpiry(joinExpiry('2027', '08')), true);
assert.ok(creditCardYearOptions(new Date('2026-08-26T00:00:00Z')).includes('2026'));
assert.ok(creditCardYearOptions(new Date('2026-08-26T00:00:00Z'), '2019').includes('2019'));
assert.equal(
  formatCompanyOptionLabel({
    companyCode: 'BWD',
    companyNameEn: 'BWDesign Centre Limited',
  }),
  'BWD - BWDesign Centre Limited',
);

const now = new Date('2026-08-26T00:00:00Z');
assert.equal(isCardExpiringSoon('2026-08', now), true);
assert.equal(isCardExpiringSoon('2027-08', now), false);

const migration = read('supabase/migrations/20260826020000_create_credit_cards.sql');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.credit_cards/);
assert.match(migration, /company_list_id uuid NOT NULL/);
assert.match(migration, /REFERENCES public\.company_list\(uuid\)/);
assert.match(migration, /custodian_id uuid/);
assert.match(migration, /REFERENCES public\.staffs\(id\)/);
assert.match(migration, /last_four text NOT NULL/);
assert.doesNotMatch(migration, /BW Enterprise/);

const hook = read('src/hooks/useCreditCards.ts');
assert.match(hook, /CREDIT_CARDS_TABLE/);
assert.match(hook, /company_list!credit_cards_company_list_id_fkey/);
assert.match(hook, /staffs!credit_cards_custodian_id_fkey/);
assert.match(hook, /const addCard/);
assert.match(hook, /const updateCard/);
assert.match(hook, /const deleteCard/);

const settings = read('src/components/settings/CreditCardsSettings.tsx');
assert.match(settings, /useCompanies/);
assert.match(settings, /useActiveStaffOptions/);
assert.match(settings, /useCreditCards/);
assert.match(settings, /所屬公司 \*/);
assert.match(settings, /保管人/);
assert.match(settings, /SearchableSelect/);
assert.match(settings, /creditCardYearOptions/);
assert.match(settings, /CREDIT_CARD_MONTHS/);
assert.match(settings, /joinExpiry/);
assert.match(settings, /splitExpiry/);
assert.match(settings, /status\.toLowerCase\(\) === 'active'/);
assert.match(settings, /type="text"/);
assert.doesNotMatch(settings, /type="password"/);
assert.doesNotMatch(settings, /EyeOff/);
assert.doesNotMatch(settings, /showCardNumber/);
assert.doesNotMatch(settings, /useActiveStaffOptions\(\[draft\.custodianId\]\)/);
assert.doesNotMatch(settings, /BW Enterprise/);
assert.doesNotMatch(settings, /companyOptions = \['BW/);

const module = read('src/components/settings/SettingsModule.tsx');
assert.match(module, /CreditCardsSettings/);
assert.match(module, /{activeTab === 'credit-cards' && <CreditCardsSettings \/>}/);
assert.doesNotMatch(module, /function CreditCardsSection/);
assert.doesNotMatch(module, /companyOptions = \['BW Enterprise'/);

console.log('credit cards: ok');
