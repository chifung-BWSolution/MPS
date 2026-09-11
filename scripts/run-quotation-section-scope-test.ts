import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildQuotationProjectHash,
  openQuotationProjectDetail,
  quotationSectionModuleFromHash,
} from '../src/lib/quotationProjectNavigation';
import {
  allowedProjectTypesForSection,
  filterBySectionProjectTypes,
  isQuotationSectionModule,
  MARKET_PROJECT_TYPES,
  matchesSectionProjectTypes,
  mergeScopedProjectTypes,
  projectTypeOptionsForSection,
  SYSTEM_DEV_PROJECT_TYPES,
} from '../src/lib/quotationSectionScope';

assert.equal(isQuotationSectionModule('quotation'), true);
assert.equal(isQuotationSectionModule('system-dev'), true);
assert.equal(isQuotationSectionModule('website'), false);

assert.deepEqual([...allowedProjectTypesForSection('quotation')], ['bwl_event', 'bwg_gift']);
assert.deepEqual([...allowedProjectTypesForSection('system-dev')], ['bwl_event', 'bwt_web']);
assert.deepEqual(
  projectTypeOptionsForSection('quotation').map((opt) => opt.id),
  [...MARKET_PROJECT_TYPES],
);
assert.deepEqual(
  projectTypeOptionsForSection('system-dev').map((opt) => opt.id),
  [...SYSTEM_DEV_PROJECT_TYPES],
);

assert.equal(matchesSectionProjectTypes(['bwl_event'], MARKET_PROJECT_TYPES), true);
assert.equal(matchesSectionProjectTypes(['bwg_gift'], MARKET_PROJECT_TYPES), true);
assert.equal(matchesSectionProjectTypes(['bwt_web'], MARKET_PROJECT_TYPES), false);
assert.equal(matchesSectionProjectTypes(['bwt_system'], MARKET_PROJECT_TYPES), false);
assert.equal(matchesSectionProjectTypes(['bwl_event', 'bwt_web'], MARKET_PROJECT_TYPES), true);
assert.equal(matchesSectionProjectTypes([], MARKET_PROJECT_TYPES), true);

assert.equal(matchesSectionProjectTypes(['bwt_web'], SYSTEM_DEV_PROJECT_TYPES), true);
assert.equal(matchesSectionProjectTypes(['bwg_gift'], SYSTEM_DEV_PROJECT_TYPES), false);

const rows = [
  { id: '1', projectTypes: ['bwl_event'] as const },
  { id: '2', projectTypes: ['bwt_web'] as const },
  { id: '3', projectTypes: ['bwg_gift'] as const },
  { id: '4', projectTypes: ['bwt_system'] as const },
  { id: '5', projectTypes: [] as const },
];
assert.deepEqual(
  filterBySectionProjectTypes(rows, MARKET_PROJECT_TYPES).map((row) => row.id),
  ['1', '3', '5'],
);
assert.deepEqual(
  filterBySectionProjectTypes(rows, SYSTEM_DEV_PROJECT_TYPES).map((row) => row.id),
  ['1', '2', '5'],
);

assert.deepEqual(
  mergeScopedProjectTypes(['bwl_event', 'bwt_web'], ['bwg_gift'], MARKET_PROJECT_TYPES),
  ['bwg_gift', 'bwt_web'],
);
assert.deepEqual(
  mergeScopedProjectTypes(['bwl_event', 'bwg_gift'], ['bwt_web'], SYSTEM_DEV_PROJECT_TYPES),
  ['bwt_web', 'bwg_gift'],
);

assert.equal(quotationSectionModuleFromHash('#quotation/pitching'), 'quotation');
assert.equal(quotationSectionModuleFromHash('#system-dev/projects?id=abc'), 'system-dev');
assert.equal(quotationSectionModuleFromHash('#dashboard/overview'), 'quotation');

const location = { pathname: '/app', search: '', hash: '' };
Object.defineProperty(globalThis, 'window', {
  value: { location, history: { replaceState() {} } },
  configurable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  },
  configurable: true,
});

openQuotationProjectDetail('proj-1', 'confirmed');
assert.equal(location.hash, '#quotation/projects?id=proj-1');
assert.equal(buildQuotationProjectHash('proj-2', 'initial'), 'quotation/pitching?id=proj-2');

location.hash = '#system-dev/pitching';
openQuotationProjectDetail('proj-sys', 'confirmed');
assert.equal(location.hash, '#system-dev/projects?id=proj-sys');
assert.equal(buildQuotationProjectHash('proj-sys', 'initial'), 'system-dev/pitching?id=proj-sys');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const menu = readFileSync(join(root, 'src/context/AppContext.tsx'), 'utf8');
assert.match(menu, /id: 'quotation'/);
assert.match(menu, /label: '市場項目管理'/);
assert.match(menu, /id: 'system-dev'/);
assert.match(menu, /label: '系統開發管理'/);
assert.doesNotMatch(menu, /label: '項目管理'/);

const home = readFileSync(join(root, 'src/components/home.tsx'), 'utf8');
assert.match(home, /case 'system-dev'/);
assert.match(home, /sectionModule="system-dev"/);

const quotationModule = readFileSync(join(root, 'src/components/quotation/QuotationModule.tsx'), 'utf8');
assert.match(quotationModule, /QuotationSectionProvider/);

console.log('quotation section scope: ok');
