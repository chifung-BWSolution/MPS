import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUOTATION_LIST_DOC_TYPE_IDS } from '../src/lib/quotationDocs';
import {
  allowedStatusTargets,
  hasQualifyingQuotationDoc,
  isAllowedStatusTransition,
  missingConfirmedFields,
  missingFollowingUpFields,
  needsConversionPopup,
} from '../src/lib/clientProjectStatus';

assert.deepEqual(allowedStatusTargets('initial'), ['following_up', 'closed']);
assert.deepEqual(allowedStatusTargets('following_up'), ['initial', 'confirmed', 'closed']);
assert.deepEqual(allowedStatusTargets('confirmed'), ['following_up', 'initial', 'closed']);
assert.deepEqual(allowedStatusTargets('closed'), ['initial', 'following_up', 'confirmed']);

assert.equal(isAllowedStatusTransition('initial', 'confirmed'), false);
assert.equal(isAllowedStatusTransition('initial', 'following_up'), true);
assert.equal(isAllowedStatusTransition('initial', 'closed'), true);
assert.equal(isAllowedStatusTransition('following_up', 'initial'), true);
assert.equal(isAllowedStatusTransition('confirmed', 'following_up'), true);
assert.equal(isAllowedStatusTransition('closed', 'confirmed'), true);

assert.equal(needsConversionPopup('initial', 'following_up'), true);
assert.equal(needsConversionPopup('following_up', 'confirmed'), true);
assert.equal(needsConversionPopup('closed', 'following_up'), true);
assert.equal(needsConversionPopup('closed', 'confirmed'), true);
assert.equal(needsConversionPopup('initial', 'closed'), false);
assert.equal(needsConversionPopup('following_up', 'closed'), false);
assert.equal(needsConversionPopup('confirmed', 'closed'), false);
assert.equal(needsConversionPopup('following_up', 'initial'), false);
assert.equal(needsConversionPopup('confirmed', 'following_up'), false);
assert.equal(needsConversionPopup('confirmed', 'initial'), false);
assert.equal(needsConversionPopup('closed', 'initial'), false);
assert.equal(needsConversionPopup('initial', 'confirmed'), false);

assert.deepEqual(missingFollowingUpFields({}), ['estimated_income', 'estimated_expenses']);
assert.deepEqual(missingFollowingUpFields({ estimatedIncome: 0, estimatedExpenses: [] }), [
  'estimated_expenses',
]);
assert.deepEqual(
  missingFollowingUpFields({
    estimatedIncome: 1000,
    estimatedExpenses: [{ id: '1', name: '  ', amount: 10, currency: 'HKD' }],
  }),
  ['estimated_expenses'],
);
assert.deepEqual(
  missingFollowingUpFields({
    estimatedIncome: 1000,
    estimatedExpenses: [{ id: '1', name: '設計', amount: 0, currency: 'HKD' }],
  }),
  [],
);

const readyBudget = {
  estimatedIncome: 20000,
  estimatedExpenses: [{ id: '1', name: '外包', amount: 5000, currency: 'HKD' }],
};
assert.deepEqual(missingConfirmedFields(readyBudget, []), [
  'signed_date',
  'handover_date',
  'quotation_doc',
]);
assert.deepEqual(
  missingConfirmedFields(
    { ...readyBudget, signedDate: '2026-09-01', handoverDate: '2026-10-01' },
    [{ docTypeId: 'other' }],
  ),
  ['quotation_doc'],
);
assert.deepEqual(
  missingConfirmedFields(
    { ...readyBudget, signedDate: '2026-09-01', handoverDate: '2026-10-01' },
    [{ docTypeId: QUOTATION_LIST_DOC_TYPE_IDS[0] }],
  ),
  [],
);
assert.equal(hasQualifyingQuotationDoc([{ docTypeId: QUOTATION_LIST_DOC_TYPE_IDS[1] }]), true);
assert.equal(hasQualifyingQuotationDoc([{ docTypeId: 'nope' }]), false);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /PitchingStatusConversionModal/);
assert.match(pitching, /allowedStatusTargets\(record\.status\)/);
assert.match(pitching, /needsConversionPopup/);
assert.match(pitching, /openQuotationProjectDetail\(record\.id, status\)/);
assert.match(pitching, /will become admin-only later/);
assert.match(pitching, /<PitchingStatusBadge status=\{record\.status\} \/>/);
assert.doesNotMatch(pitching, /onStatusChange=\{/);
assert.doesNotMatch(pitching, /function PitchingList\([\s\S]*onStatusChange/);

const project = read('src/components/quotation/ProjectModule.tsx');
assert.match(project, /PitchingStatusBadge/);
assert.doesNotMatch(project, /PitchingStatusSelect/);
assert.doesNotMatch(project, /onStatusChange/);
assert.doesNotMatch(project, /updateStatus/);

const modal = read('src/components/quotation/PitchingStatusConversionModal.tsx');
assert.match(modal, /簽約日期/);
assert.match(modal, /交付日期/);
assert.match(modal, /QUOTATION_LIST_DOC_TYPE_IDS|isQuotationListDocType/);
assert.match(modal, /QuotationDocFormDialog/);
assert.match(modal, /estimatedIncome/);
assert.match(modal, /estimatedExpenses/);

console.log('pitching status flow: ok');
