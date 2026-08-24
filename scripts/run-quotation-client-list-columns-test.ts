import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterQuotationClients,
  quotationClientSelectLabel,
  selectLatestProjectsByClient,
  toQuotationClientSelectOption,
  type QuotationClient,
} from '../src/data/quotationClientList';
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
assert.match(crmSrc, /filterQuotationClients/);
assert.match(crmSrc, /所有品牌/);
assert.match(crmSrc, /brandFilter/);
assert.match(crmSrc, /setBrandFilter/);
assert.match(crmSrc, /aria-label="篩選品牌"/);
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
assert.match(pitchingSrc, /toQuotationClientSelectOption/);
assert.doesNotMatch(pitchingSrc, /label: c\.companyNameZh/);
assert.match(projectSrc, /readSelectedQuotationProjectId/);
assert.match(projectSrc, /toQuotationClientSelectOption/);
assert.doesNotMatch(projectSrc, /label: c\.companyNameZh/);

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

const sampleClients: QuotationClient[] = [
  {
    id: 'c-bwt',
    displayName: 'BWT 客戶',
    companyNameZh: 'BWT 公司',
    companyNameEn: 'BWT Co',
    brandIds: ['brand-bwt'],
    contactPerson: 'Amy',
    phone: '',
    email: '',
    address: '',
    inquiryDate: '2026-01-01',
    status: 'active',
    latestProject: { id: 'p1', displayName: 'BWT SEM', status: 'confirmed' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'c-bwl',
    displayName: 'BWL 客戶',
    companyNameZh: 'BWL 公司',
    companyNameEn: 'BWL Co',
    brandIds: ['brand-bwl', 'brand-bwt'],
    contactPerson: 'Ben',
    phone: '',
    email: '',
    address: '',
    inquiryDate: '2026-01-02',
    status: 'prospect',
    latestProject: { id: 'p2', displayName: 'BWL branding design', status: 'initial' },
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'c-none',
    displayName: '無品牌客戶',
    companyNameZh: '獨立公司',
    companyNameEn: 'Indie Co',
    brandIds: [],
    contactPerson: 'Cara',
    phone: '',
    email: '',
    address: '',
    inquiryDate: '2026-01-03',
    status: 'inactive',
    latestProject: null,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  },
];

assert.deepEqual(
  filterQuotationClients(sampleClients).map((c) => c.id),
  ['c-bwt', 'c-bwl', 'c-none'],
);
assert.deepEqual(
  filterQuotationClients(sampleClients, { brandFilter: 'brand-bwt' }).map((c) => c.id),
  ['c-bwt', 'c-bwl'],
);
assert.deepEqual(
  filterQuotationClients(sampleClients, { brandFilter: 'brand-bwl' }).map((c) => c.id),
  ['c-bwl'],
);
assert.deepEqual(
  filterQuotationClients(sampleClients, {
    brandFilter: 'brand-bwt',
    statusFilter: 'prospect',
  }).map((c) => c.id),
  ['c-bwl'],
);
assert.deepEqual(
  filterQuotationClients(sampleClients, { brandFilter: 'missing-brand' }).map((c) => c.id),
  [],
);

assert.equal(
  quotationClientSelectLabel({
    displayName: 'CityU Jane',
    companyNameZh: '香港城市大學',
    companyNameEn: 'City University of Hong Kong',
    contactPerson: 'Jane',
  }),
  '香港城市大學',
);
assert.equal(
  quotationClientSelectLabel({
    displayName: 'CityU Jane',
    companyNameZh: '   ',
    companyNameEn: 'City University of Hong Kong',
    contactPerson: 'Jane',
  }),
  'City University of Hong Kong',
);
assert.equal(
  quotationClientSelectLabel({
    displayName: 'HK event Pro Jane 1234',
    companyNameZh: '',
    companyNameEn: '',
    contactPerson: 'Jane',
  }),
  'HK event Pro Jane 1234',
);
assert.equal(
  quotationClientSelectLabel({
    displayName: '   ',
    companyNameZh: '',
    companyNameEn: '',
    contactPerson: 'Jane CHEUNG',
  }),
  'Jane CHEUNG',
);
assert.equal(
  quotationClientSelectLabel({
    displayName: '',
    companyNameZh: '',
    companyNameEn: '',
    contactPerson: '',
  }),
  '未命名客戶',
);

const enOnlyOption = toQuotationClientSelectOption({
  id: 'c-en',
  displayName: 'CityU Jane',
  companyNameZh: '',
  companyNameEn: 'City University of Hong Kong',
  contactPerson: 'Jane',
});
assert.equal(enOnlyOption.value, 'c-en');
assert.equal(enOnlyOption.label, 'City University of Hong Kong');
assert.match(enOnlyOption.keywords, /City University of Hong Kong/);
assert.match(enOnlyOption.keywords, /CityU Jane/);
assert.equal(enOnlyOption.companyNameZh, '');
assert.equal(enOnlyOption.companyNameEn, 'City University of Hong Kong');

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
