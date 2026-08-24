import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyClientDisplayNameAutofill,
  composeClientDisplayName,
  emptyQuotationClientInput,
  seedClientDisplayName,
} from '../src/data/quotationClientList';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modalSrc = readFileSync(join(root, 'src/components/crm/ClientFormModal.tsx'), 'utf8');
const hookSrc = readFileSync(join(root, 'src/hooks/useQuotationClientList.ts'), 'utf8');

const labels = [...modalSrc.matchAll(/block mb-1">([^<]+)<\/label>/g)].map((match) => match[1]);
assert.deepEqual(labels.slice(0, 8), [
  '所屬品牌 *',
  '公司名稱（中文）',
  '公司名稱（英文）',
  '聯絡人 *',
  '電話',
  '顯示名稱 *',
  '電郵',
  '地址',
]);

assert.doesNotMatch(modalSrc, /公司名稱（中文）\*/);
assert.match(modalSrc, /所屬品牌 \*/);
assert.match(modalSrc, /顯示名稱 \*/);
assert.match(modalSrc, /請填寫必填欄位（所屬品牌、聯絡人、顯示名稱）/);
assert.doesNotMatch(modalSrc, /請填寫必填欄位（公司名稱、聯絡人）/);
assert.match(modalSrc, /formData\.brandIds\.length === 0/);
assert.match(modalSrc, /seedClientDisplayName/);
assert.match(modalSrc, /applyClientDisplayNameAutofill/);
assert.doesNotMatch(modalSrc, /displayNameManual/);
assert.doesNotMatch(modalSrc, /isCreate && !displayNameManual/);
assert.match(hookSrc, /composeClientDisplayName\(input\)/);

assert.equal(
  composeClientDisplayName({
    companyNameZh: '新創科技有限公司',
    companyNameEn: 'TechStart Inc',
    contactPerson: '于建茹',
    phone: '+852 8494 1160',
  }),
  '新創科技有限公司 TechStart Inc 于建茹 +852 8494 1160',
);
assert.equal(
  composeClientDisplayName({
    companyNameZh: '',
    companyNameEn: '  ',
    contactPerson: '于建茹',
    phone: '+852 8494 1160',
  }),
  '于建茹 +852 8494 1160',
);
assert.equal(
  composeClientDisplayName({
    companyNameZh: '',
    companyNameEn: '',
    contactPerson: '',
    phone: '',
  }),
  '',
);

const seededEmpty = seedClientDisplayName({
  ...emptyQuotationClientInput(),
  companyNameZh: '新創科技',
  companyNameEn: 'TechStart',
  contactPerson: 'Amy Chen',
  phone: '+852 9123 4567',
});
assert.equal(seededEmpty.displayName, '新創科技 TechStart Amy Chen +852 9123 4567');

const seededKept = seedClientDisplayName({
  ...emptyQuotationClientInput(),
  displayName: '自訂名稱',
  companyNameZh: '新創科技',
  contactPerson: 'Amy Chen',
});
assert.equal(seededKept.displayName, '自訂名稱');

const base = {
  ...emptyQuotationClientInput(),
  companyNameZh: '舊公司',
  contactPerson: 'Amy',
  displayName: '自訂名稱',
};
assert.equal(
  applyClientDisplayNameAutofill(base, 'companyNameZh', '新公司').displayName,
  '自訂名稱',
);

const cleared = applyClientDisplayNameAutofill(base, 'displayName', '');
assert.equal(cleared.displayName, '');
assert.equal(
  applyClientDisplayNameAutofill(cleared, 'companyNameZh', '新公司').displayName,
  '新公司 Amy',
);
assert.equal(
  applyClientDisplayNameAutofill(cleared, 'email', 'a@b.com').displayName,
  '',
);

console.log('client form modal: ok');
