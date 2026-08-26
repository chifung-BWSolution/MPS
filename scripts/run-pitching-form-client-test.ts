import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pitchingSrc = readFileSync(join(root, 'src/components/quotation/PitchingModule.tsx'), 'utf8');
const projectSrc = readFileSync(join(root, 'src/components/quotation/ProjectModule.tsx'), 'utf8');
const clientModalSrc = readFileSync(join(root, 'src/components/crm/ClientFormModal.tsx'), 'utf8');

const formModalSrc = pitchingSrc.slice(
  pitchingSrc.indexOf('export function PitchingFormModal'),
  pitchingSrc.indexOf('function PitchingList'),
);

assert.match(formModalSrc, /客戶 Customer/);
assert.match(formModalSrc, /ClientFormModal/);
assert.match(formModalSrc, /新增客戶/);
assert.match(formModalSrc, /onCreateClient/);
assert.match(formModalSrc, /overlayClassName="z-\[120\]"/);
assert.match(formModalSrc, /toQuotationClientSelectOption\(client\)/);
assert.match(formModalSrc, /負責 PM \*/);
assert.match(formModalSrc, /請選擇負責 PM/);
assert.doesNotMatch(formModalSrc, /EMPTY_STAFF_OPTION/);
assert.doesNotMatch(formModalSrc, /公司名稱 \(中文\)/);
assert.doesNotMatch(formModalSrc, /公司名稱 \(Eng\)/);
assert.doesNotMatch(formModalSrc, /公司名稱來自客戶列表/);
assert.match(formModalSrc, /companyNamesForClient/);
assert.match(formModalSrc, /ClientWebsiteSelectField/);

assert.match(pitchingSrc, /onCreateClient=\{addClient\}/);
assert.match(projectSrc, /onCreateClient=\{addClient\}/);
assert.match(projectSrc, /addClient/);

assert.match(clientModalSrc, /overlayClassName/);
assert.match(clientModalSrc, /z-\[100\]/);

console.log('pitching form client: ok');
