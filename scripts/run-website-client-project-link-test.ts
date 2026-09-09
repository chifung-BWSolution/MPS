import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clientProjectSelectLabel,
  linkedClientProjectId,
  nextClientProjectIdForWebsite,
  syncWebsiteClientProjectLink,
  toClientProjectSelectOptions,
  UNLINKED_CLIENT_PROJECT_OPTION,
} from '../src/lib/websiteClientProjectLink';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(clientProjectSelectLabel({ displayName: '智豐網站改版' }), '智豐網站改版');
assert.equal(
  clientProjectSelectLabel({ displayName: '智豐網站改版', clientName: '智豐' }),
  '智豐網站改版 (智豐)',
);
assert.equal(
  clientProjectSelectLabel({ displayName: '智豐', clientName: '智豐' }),
  '智豐',
);
assert.equal(clientProjectSelectLabel({ displayName: '', clientName: '—' }), '未命名');

const options = toClientProjectSelectOptions([
  { id: 'p1', displayName: '提案A', clientName: '客戶甲', pitchingId: 'MPS-1' },
]);
assert.equal(options[0]?.value, UNLINKED_CLIENT_PROJECT_OPTION.value);
assert.equal(options[0]?.label, '尚未連結');
assert.equal(options.some((o) => o.value === 'p1' && o.label === '提案A (客戶甲)'), true);
assert.match(options[1]?.keywords || '', /MPS-1/);

assert.equal(
  linkedClientProjectId(
    [
      { id: 'p1', webandsystemListId: 'ws_other' },
      { id: 'p2', webandsystemListId: 'ws_1' },
    ],
    'ws_1',
  ),
  'p2',
);
assert.equal(linkedClientProjectId([{ id: 'p1' }], 'ws_1'), '');

assert.equal(nextClientProjectIdForWebsite('client', '  p1  '), 'p1');
assert.equal(nextClientProjectIdForWebsite('client', ''), '');
assert.equal(nextClientProjectIdForWebsite('internal', 'p1'), '');

const calls: Array<{ id: string; webandsystemListId: string }> = [];
const updateRecord = async (id: string, data: { webandsystemListId: string }) => {
  calls.push({ id, ...data });
  return { error: null };
};

const records = [
  { id: 'old', webandsystemListId: 'ws_1' },
  { id: 'keep', webandsystemListId: 'ws_other' },
  { id: 'next', webandsystemListId: undefined },
];

async function runLinkCases() {
  const linked = await syncWebsiteClientProjectLink({
    websiteId: 'ws_1',
    nextProjectId: 'next',
    records,
    updateRecord,
  });
  assert.equal(linked.error, null);
  assert.deepEqual(calls, [
    { id: 'old', webandsystemListId: '' },
    { id: 'next', webandsystemListId: 'ws_1' },
  ]);

  calls.length = 0;
  const unchanged = await syncWebsiteClientProjectLink({
    websiteId: 'ws_1',
    nextProjectId: 'old',
    records,
    updateRecord,
  });
  assert.equal(unchanged.error, null);
  assert.deepEqual(calls, []);

  calls.length = 0;
  const cleared = await syncWebsiteClientProjectLink({
    websiteId: 'ws_1',
    nextProjectId: '',
    records,
    updateRecord,
  });
  assert.equal(cleared.error, null);
  assert.deepEqual(calls, [{ id: 'old', webandsystemListId: '' }]);

  const missing = await syncWebsiteClientProjectLink({
    websiteId: '',
    nextProjectId: 'next',
    records,
    updateRecord,
  });
  assert.equal(missing.error?.message, '缺少網站 ID');
}

const websiteModal = read('src/components/website/WebsiteFormModal.tsx');
assert.match(websiteModal, /WebsiteClientProjectSelectField/);
assert.match(websiteModal, /projectCategory === 'client' && !lockProjectCategory/);
assert.match(websiteModal, /quotationClientProjectId/);
assert.match(websiteModal, /websiteId/);
assert.match(websiteModal, /data-fixed-overlay/);

const fieldSrc = read('src/components/website/WebsiteClientProjectSelectField.tsx');
assert.match(fieldSrc, /SearchableSelect/);
assert.match(fieldSrc, /新增客戶項目/);
assert.match(fieldSrc, /hideWebsiteField/);
assert.match(fieldSrc, /toClientProjectSelectOptions/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
const formModalSrc = pitching.slice(
  pitching.indexOf('export function PitchingFormModal'),
  pitching.indexOf('function PitchingList'),
);
assert.match(formModalSrc, /hideWebsiteField/);
assert.match(formModalSrc, /!hideWebsiteField &&/);

const websiteModule = read('src/components/website/WebsiteModule.tsx');
assert.match(websiteModule, /syncWebsiteClientProjectLink/);
assert.match(websiteModule, /websiteId=\{editingSite\.id\}/);

const sourceDialog = read('src/components/project/ProjectSourceDialog.tsx');
assert.match(sourceDialog, /syncWebsiteClientProjectLink/);
assert.match(sourceDialog, /websiteId=\{mode === 'edit'/);

await runLinkCases();
console.log('website client project link: ok');
