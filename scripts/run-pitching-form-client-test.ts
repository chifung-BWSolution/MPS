import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePitchingFormClient } from '../src/data/pitchingData';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pitchingSrc = readFileSync(join(root, 'src/components/quotation/PitchingModule.tsx'), 'utf8');
const projectSrc = readFileSync(join(root, 'src/components/quotation/ProjectModule.tsx'), 'utf8');
const clientModalSrc = readFileSync(join(root, 'src/components/crm/ClientFormModal.tsx'), 'utf8');

const formModalSrc = pitchingSrc.slice(
  pitchingSrc.indexOf('export function PitchingFormModal'),
  pitchingSrc.indexOf('function PitchingList'),
);

assert.match(formModalSrc, /客戶 Customer/);
assert.match(pitchingSrc, /resolvePitchingFormClient/);
assert.doesNotMatch(pitchingSrc, /c\.label === record\.clientName/);
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

const projectTitle = 'BWL P2 Project Sheet 項目收入及支出記錄表 2025/26';
const stub = { value: 'client-stub', label: projectTitle };
const real = { value: 'client-real', label: 'Acme Ltd' };

assert.deepEqual(
  resolvePitchingFormClient({ clientId: undefined, clientName: '—', displayName: projectTitle }, [stub]),
  { clientId: '', clientName: '' },
);
assert.deepEqual(
  resolvePitchingFormClient({ clientId: '', clientName: projectTitle, displayName: projectTitle }, [stub]),
  { clientId: '', clientName: '' },
);
assert.deepEqual(
  resolvePitchingFormClient({ clientId: 'client-stub', clientName: '—', displayName: projectTitle }, [stub]),
  { clientId: '', clientName: '' },
);
assert.deepEqual(
  resolvePitchingFormClient({ clientId: 'client-real', clientName: 'Acme Ltd', displayName: 'Acme Ltd' }, [real]),
  { clientId: 'client-real', clientName: 'Acme Ltd' },
);

console.log('pitching form client: ok');
