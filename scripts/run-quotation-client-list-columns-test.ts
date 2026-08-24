import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectLatestProjectsByClient } from '../src/data/quotationClientList';
import {
  buildQuotationProjectHash,
  buildQuotationProjectHref,
  openQuotationProjectDetail,
  readSelectedQuotationProjectId,
  SELECTED_QUOTATION_PROJECT_KEY,
} from '../src/lib/quotationProjectNavigation';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const crmSrc = readFileSync(join(root, 'src/components/crm/CRMModule.tsx'), 'utf8');
const hookSrc = readFileSync(join(root, 'src/hooks/useQuotationClientList.ts'), 'utf8');
const pitchingSrc = readFileSync(join(root, 'src/components/quotation/PitchingModule.tsx'), 'utf8');
const projectSrc = readFileSync(join(root, 'src/components/quotation/ProjectModule.tsx'), 'utf8');

const headers = [...crmSrc.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((match) => match[1]);
assert.deepEqual(headers, [
  '顯示名稱',
  '品牌',
  '公司名稱',
  '聯絡人',
  '電話',
  '最近項目',
  '狀態',
  '操作',
]);

assert.match(crmSrc, /function BrandBadge/);
assert.match(crmSrc, /bg-teal-50 text-teal-700/);
assert.match(crmSrc, /latestProject\.displayName/);
assert.match(crmSrc, /buildQuotationProjectHref/);
assert.match(crmSrc, /target="_blank"/);
assert.match(crmSrc, /rel="noopener noreferrer"/);
assert.doesNotMatch(crmSrc, /openQuotationProjectDetail/);
assert.match(crmSrc, /min-w-\[7\.5rem\]/);
assert.match(crmSrc, /whitespace-nowrap min-w-\[7\.5rem\]/);
assert.doesNotMatch(crmSrc, /client\.projectCount/);
assert.doesNotMatch(crmSrc, />項目<\/th>/);

assert.match(hookSrc, /selectLatestProjectsByClient/);
assert.match(hookSrc, /display_name, status, inquiry_date, updated_at, created_at/);
assert.doesNotMatch(hookSrc, /fetchProjectCounts/);

assert.match(pitchingSrc, /readSelectedQuotationProjectId/);
assert.match(projectSrc, /readSelectedQuotationProjectId/);

const latest = selectLatestProjectsByClient([
  {
    id: 'old',
    clientId: 'c1',
    displayName: '舊項目',
    status: 'closed',
    inquiryDate: '2024-01-01',
    updatedAt: '2025-12-01T00:00:00.000Z',
  },
  {
    id: 'new',
    clientId: 'c1',
    displayName: '最新網站改版',
    status: 'confirmed',
    inquiryDate: '2025-06-01',
    updatedAt: '2025-06-02T00:00:00.000Z',
  },
  {
    id: 'other',
    clientId: 'c2',
    displayName: '活動提案',
    status: 'initial',
    inquiryDate: '2023-01-01',
  },
]);
assert.equal(latest.c1?.id, 'new');
assert.equal(latest.c1?.displayName, '最新網站改版');
assert.equal(latest.c2?.displayName, '活動提案');

const store = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
};
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage, configurable: true });
Object.defineProperty(globalThis, 'window', {
  value: {
    location: { pathname: '/app', search: '', hash: '' },
    history: { replaceState() {} },
  },
  configurable: true,
});

const calls: Array<[string, string?]> = [];
openQuotationProjectDetail('proj-1', 'confirmed', (module, sub) => calls.push([module, sub]));
assert.deepEqual(calls[0], ['quotation', 'projects']);
assert.equal(readSelectedQuotationProjectId(), 'proj-1');
assert.equal(store.get(SELECTED_QUOTATION_PROJECT_KEY), 'proj-1');

openQuotationProjectDetail('proj-2', 'initial', (module, sub) => calls.push([module, sub]));
assert.deepEqual(calls[1], ['quotation', 'pitching']);
assert.equal(readSelectedQuotationProjectId(), 'proj-2');

assert.equal(buildQuotationProjectHash('proj-1', 'confirmed'), 'quotation/projects?project=proj-1');
assert.equal(buildQuotationProjectHash('proj-2', 'initial'), 'quotation/pitching?project=proj-2');
assert.equal(buildQuotationProjectHref('proj-1', 'confirmed'), '/app#quotation/projects?project=proj-1');
assert.equal(
  readSelectedQuotationProjectId('#quotation/projects?project=from-hash'),
  'from-hash',
);

console.log('quotation client list columns: ok');
