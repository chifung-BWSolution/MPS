import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_QUOTATION_LIST_QUERY,
  parseQuotationListQuery,
  readQuotationListQuery,
  writeQuotationListQueryParams,
} from '../src/lib/quotationListQuery';
import {
  buildInvoiceReceiptHash,
  buildQuotationProjectHash,
  openQuotationProjectDetail,
  setQuotationClientHash,
  setQuotationListHash,
} from '../src/lib/quotationProjectNavigation';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pitchingSrc = readFileSync(join(root, 'src/components/quotation/PitchingModule.tsx'), 'utf8');
const projectSrc = readFileSync(join(root, 'src/components/quotation/ProjectModule.tsx'), 'utf8');

assert.match(pitchingSrc, /useQuotationListQuery\('pitching'\)/);
assert.match(projectSrc, /useQuotationListQuery\('projects'\)/);
assert.match(pitchingSrc, /setQuery\(\{ q:/);
assert.match(projectSrc, /setQuery\(\{ q:/);
assert.match(pitchingSrc, /onSortChange: \(key, dir\) => setQuery\(\{ sort: key, dir \}\)/);
assert.match(projectSrc, /onSortChange: \(key, dir\) => setQuery\(\{ sort: key, dir \}\)/);
assert.match(pitchingSrc, /PitchingDealFilterSelect/);
assert.match(pitchingSrc, /PitchingStatusFilterSelect/);
assert.match(pitchingSrc, /PITCHING_LIST_STATUS_OPTIONS/);
assert.match(pitchingSrc, /全部項目狀態/);
assert.doesNotMatch(projectSrc, /PitchingDealFilterSelect/);
assert.doesNotMatch(projectSrc, /PitchingStatusFilterSelect/);
const pendingSrc = readFileSync(join(root, 'src/components/quotation/AsanaPendingModule.tsx'), 'utf8');
assert.doesNotMatch(pendingSrc, /PitchingDealFilterSelect/);
assert.doesNotMatch(pendingSrc, /PitchingStatusFilterSelect/);
assert.match(pitchingSrc, /matchesPitchingDealFilter/);
assert.match(pitchingSrc, /matchesPitchingStatusFilter/);
assert.match(projectSrc, /matchesClientProjectProgressFilter/);
assert.equal(DEFAULT_QUOTATION_LIST_QUERY.status, 'hide_failed');
assert.equal(DEFAULT_QUOTATION_LIST_QUERY.projectStatus, 'all');
assert.equal(DEFAULT_QUOTATION_LIST_QUERY.progress, 'all');

assert.deepEqual(parseQuotationListQuery(new URLSearchParams()), DEFAULT_QUOTATION_LIST_QUERY);
assert.deepEqual(
  parseQuotationListQuery(new URLSearchParams('q=acme&type=bwt_web&status=all&sort=displayName&dir=asc')),
  {
    q: 'acme',
    type: 'bwt_web',
    status: 'all',
    projectStatus: 'all',
    progress: 'all',
    sort: 'displayName',
    dir: 'asc',
  },
);
assert.deepEqual(
  parseQuotationListQuery(new URLSearchParams('status=show_failed')),
  { ...DEFAULT_QUOTATION_LIST_QUERY, status: 'show_failed' },
);
assert.deepEqual(
  parseQuotationListQuery(new URLSearchParams('projectStatus=following_up')),
  { ...DEFAULT_QUOTATION_LIST_QUERY, projectStatus: 'following_up' },
);
assert.deepEqual(
  parseQuotationListQuery(new URLSearchParams('progress=in_progress')),
  { ...DEFAULT_QUOTATION_LIST_QUERY, progress: 'in_progress' },
);
assert.deepEqual(
  parseQuotationListQuery(new URLSearchParams('status=confirmed&expired=all')),
  DEFAULT_QUOTATION_LIST_QUERY,
);
assert.deepEqual(
  parseQuotationListQuery(new URLSearchParams('projectStatus=confirmed')),
  DEFAULT_QUOTATION_LIST_QUERY,
);
assert.deepEqual(
  parseQuotationListQuery(new URLSearchParams('status=nope&sort=unknown&dir=sideways')),
  DEFAULT_QUOTATION_LIST_QUERY,
);

const written = new URLSearchParams();
writeQuotationListQueryParams(written, DEFAULT_QUOTATION_LIST_QUERY);
assert.equal(written.toString(), '');
writeQuotationListQueryParams(written, {
  q: '  acme  ',
  type: 'bwt_web',
  status: 'all',
  projectStatus: 'closed',
  progress: 'all',
  sort: 'income',
  dir: 'desc',
});
assert.equal(written.toString(), 'q=acme&type=bwt_web&status=all&projectStatus=closed&sort=income&dir=desc');
writeQuotationListQueryParams(written, {
  ...DEFAULT_QUOTATION_LIST_QUERY,
  status: 'show_failed',
  progress: 'completed',
});
assert.equal(written.toString(), 'status=show_failed&progress=completed');

assert.deepEqual(
  readQuotationListQuery('#quotation/projects?id=proj-1&q=acme&type=bwt_web&progress=pending&sort=displayName&dir=asc'),
  {
    q: 'acme',
    type: 'bwt_web',
    status: 'hide_failed',
    projectStatus: 'all',
    progress: 'pending',
    sort: 'displayName',
    dir: 'asc',
  },
);

const location = { pathname: '/app', search: '', hash: '' };
Object.defineProperty(globalThis, 'window', {
  value: {
    location,
    history: {
      state: null,
      replaceState(_state: unknown, _title: string, url: string) {
        const hashIndex = String(url).indexOf('#');
        location.hash = hashIndex >= 0 ? String(url).slice(hashIndex) : '';
      },
    },
  },
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

setQuotationListHash('projects', {
  q: 'acme',
  type: 'bwt_web',
  status: 'hide_failed',
  projectStatus: 'all',
  progress: 'pending',
  sort: 'displayName',
  dir: 'asc',
});
assert.equal(
  location.hash,
  '#quotation/projects?q=acme&type=bwt_web&progress=pending&sort=displayName&dir=asc',
);

openQuotationProjectDetail('proj-1', 'confirmed');
assert.equal(
  location.hash,
  '#quotation/projects?id=proj-1&q=acme&type=bwt_web&progress=pending&sort=displayName&dir=asc',
);

setQuotationClientHash('projects', null);
assert.equal(
  location.hash,
  '#quotation/projects?q=acme&type=bwt_web&progress=pending&sort=displayName&dir=asc',
);

assert.equal(
  buildQuotationProjectHash('proj-9', 'pitching', '#quotation/pitching?q=foo&sort=gp&dir=asc'),
  'quotation/pitching?id=proj-9&q=foo&sort=gp&dir=asc',
);
assert.equal(
  buildQuotationProjectHash('', 'pitching', '#quotation/pitching?id=proj-9&q=foo&sort=gp&dir=asc'),
  'quotation/pitching?q=foo&sort=gp&dir=asc',
);
assert.equal(
  buildInvoiceReceiptHash(
    'proj-1',
    'projects',
    'invoice',
    'inc-9',
    '#quotation/projects?id=proj-1&type=bwt_web',
  ),
  'quotation/projects?id=proj-1&doc=invoice&income=inc-9&type=bwt_web',
);

console.log('quotation list query: ok');
