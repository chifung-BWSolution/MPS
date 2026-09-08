import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PitchingProjectType, PitchingStatus } from '../src/data/pitchingData';
import {
  defaultQuotationListSortDir,
  nextQuotationListSort,
  sortQuotationListRecords,
} from '../src/lib/quotationListSort';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pitchingSrc = readFileSync(join(root, 'src/components/quotation/PitchingModule.tsx'), 'utf8');
const projectSrc = readFileSync(join(root, 'src/components/quotation/ProjectModule.tsx'), 'utf8');
const headerSrc = readFileSync(
  join(root, 'src/components/quotation/QuotationListSortHeader.tsx'),
  'utf8',
);

assert.match(pitchingSrc, /useQuotationListSort/);
assert.match(pitchingSrc, /QuotationClientProjectTableHeaders/);
assert.match(projectSrc, /useQuotationListSort/);
assert.match(projectSrc, /QuotationClientProjectTableHeaders/);
assert.match(headerSrc, /依\$\{label\}排序/);
assert.match(headerSrc, /aria-sort/);
assert.match(headerSrc, /查詢日期/);
assert.match(headerSrc, /剩餘天數/);
assert.match(headerSrc, /項目類型/);
assert.match(headerSrc, /提案顯示名稱/);
assert.match(headerSrc, /相關客戶/);
assert.match(headerSrc, /負責 PM/);
assert.match(headerSrc, /狀態/);
assert.match(headerSrc, /預計收入/);
assert.match(headerSrc, /總收入/);
assert.ok(headerSrc.indexOf('提案顯示名稱') < headerSrc.indexOf('相關客戶'));
assert.ok(headerSrc.indexOf('相關客戶') < headerSrc.indexOf('負責 PM'));
assert.match(pitchingSrc, /formatRelatedClientName\(record\)/);
assert.match(projectSrc, /formatRelatedClientName\(record\)/);
assert.match(pitchingSrc, /moneyColumns="estimated"/);
assert.match(projectSrc, /moneyColumns="actual"/);
assert.match(pitchingSrc, /estimatedMoneyFor/);
assert.match(projectSrc, /useQuotationProjectActuals/);
assert.match(projectSrc, /projectActualsFor/);
assert.doesNotMatch(pitchingSrc, /useQuotationProjectActuals/);
assert.match(pitchingSrc, /colSpan=\{QUOTATION_LIST_COLUMN_COUNT\}/);
assert.match(projectSrc, /colSpan=\{QUOTATION_LIST_COLUMN_COUNT\}/);

assert.equal(defaultQuotationListSortDir('inquiryDate'), 'desc');
assert.equal(defaultQuotationListSortDir('remainingDays'), 'desc');
assert.equal(defaultQuotationListSortDir('income'), 'desc');
assert.equal(defaultQuotationListSortDir('expense'), 'desc');
assert.equal(defaultQuotationListSortDir('gp'), 'desc');
assert.equal(defaultQuotationListSortDir('displayName'), 'asc');

assert.deepEqual(nextQuotationListSort('inquiryDate', 'desc', 'inquiryDate'), {
  key: 'inquiryDate',
  dir: 'asc',
});
assert.deepEqual(nextQuotationListSort('inquiryDate', 'asc', 'inquiryDate'), {
  key: 'inquiryDate',
  dir: 'desc',
});
assert.deepEqual(nextQuotationListSort('inquiryDate', 'desc', 'displayName'), {
  key: 'displayName',
  dir: 'asc',
});
assert.deepEqual(nextQuotationListSort('inquiryDate', 'desc', 'income'), {
  key: 'income',
  dir: 'desc',
});

function row(partial: {
  id: string;
  inquiryDate?: string;
  status?: PitchingStatus;
  projectTypes?: PitchingProjectType[];
  displayName?: string;
  clientName?: string;
  mainPmName?: string;
  income?: number | null;
  expense?: number | null;
  gp?: number | null;
}) {
  return {
    inquiryDate: '',
    status: 'initial' as PitchingStatus,
    projectTypes: [] as PitchingProjectType[],
    displayName: '',
    clientName: '',
    mainPmName: '',
    ...partial,
  };
}

const rows = [
  row({
    id: 'a',
    inquiryDate: '2026-08-01',
    status: 'closed',
    projectTypes: ['bwt_web'],
    displayName: 'Zeta',
    clientName: 'Zeta Bank',
    mainPmName: 'Chris',
  }),
  row({
    id: 'b',
    inquiryDate: '2026-08-20',
    status: 'initial',
    projectTypes: ['bwl_event'],
    displayName: 'Alpha',
    clientName: 'Alpha Air',
    mainPmName: 'Ada',
  }),
  row({
    id: 'c',
    inquiryDate: '',
    status: 'following_up',
    displayName: 'Missing date',
    clientName: '—',
    mainPmName: '',
  }),
];

const byDateDesc = sortQuotationListRecords(rows, 'inquiryDate', 'desc', '2026-08-25');
assert.deepEqual(
  byDateDesc.map((r) => r.id),
  ['b', 'a', 'c'],
);

const byDateAsc = sortQuotationListRecords(rows, 'inquiryDate', 'asc', '2026-08-25');
assert.deepEqual(
  byDateAsc.map((r) => r.id),
  ['a', 'b', 'c'],
);

const byNameAsc = sortQuotationListRecords(rows, 'displayName', 'asc', '2026-08-25');
assert.deepEqual(
  byNameAsc.map((r) => r.id),
  ['b', 'c', 'a'],
);

const byPmAsc = sortQuotationListRecords(rows, 'mainPm', 'asc', '2026-08-25');
assert.deepEqual(
  byPmAsc.map((r) => r.id),
  ['b', 'a', 'c'],
);

const byStatusAsc = sortQuotationListRecords(rows, 'status', 'asc', '2026-08-25');
assert.deepEqual(
  byStatusAsc.map((r) => r.id),
  ['b', 'c', 'a'],
);

const byDaysDesc = sortQuotationListRecords(rows, 'remainingDays', 'desc', '2026-08-25');
assert.deepEqual(
  byDaysDesc.map((r) => r.id),
  ['b', 'a', 'c'],
);

const byTypeAsc = sortQuotationListRecords(rows, 'projectTypes', 'asc', '2026-08-25');
assert.deepEqual(
  byTypeAsc.map((r) => r.id),
  ['b', 'a', 'c'],
);

const byClientAsc = sortQuotationListRecords(rows, 'clientName', 'asc', '2026-08-25');
assert.deepEqual(
  byClientAsc.map((r) => r.id),
  ['b', 'a', 'c'],
);

const moneyRows = [
  row({ id: 'high', income: 20000, expense: 4000, gp: 16000 }),
  row({ id: 'low', income: 5000, expense: 8000, gp: -3000 }),
  row({ id: 'empty', income: null, expense: null, gp: null }),
];
assert.deepEqual(
  sortQuotationListRecords(moneyRows, 'income', 'desc').map((r) => r.id),
  ['high', 'low', 'empty'],
);
assert.deepEqual(
  sortQuotationListRecords(moneyRows, 'gp', 'asc').map((r) => r.id),
  ['low', 'high', 'empty'],
);

console.log('quotation list sort: ok');
