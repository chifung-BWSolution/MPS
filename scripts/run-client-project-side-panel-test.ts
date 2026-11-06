import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  billingStillShort,
  buildBillingBrief,
  buildKeyDateRows,
  deliverableExtraLabel,
  deliverablePhotoPreview,
  deliverablesSectionVisible,
  hasMediaPublications,
  incomeBriefLabel,
} from '../src/lib/clientProjectSidePanel';
import { completionPhotosFromDocs } from '../src/lib/quotationDocs';
import { projectIncomesKey, publishProjectData, subscribeProjectData } from '../src/lib/projectDataBus';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const dates = buildKeyDateRows(
  {
    inquiryDate: '2026-01-05',
    signedDate: '',
    handoverDate: null,
    contractStartDate: '2026-02-01T00:00:00Z',
    contractEndDate: 'not-a-date',
    servicePeriods: {
      revision: { startDate: '2026-03-01', endDate: '' },
      testing: { endDate: '2026-04-01' },
      warranty: { startDate: '   ', endDate: '2026-06-30' },
    },
  },
  [
    { id: 'late', title: ' 尾聲 ', date: '2026-08-01' },
    { id: 'blank-date', title: '沒有日期', date: null },
    { id: 'early', title: '', date: '2026-01-20' },
    { id: 'mid', title: '彩排', date: '2026-05-02' },
  ],
);

assert.deepEqual(
  dates.map((row) => [row.kind, row.label, row.date]),
  [
    ['project', '查詢日期', '2026-01-05'],
    ['project', '合約開始日期', '2026-02-01'],
    ['project', '可修改期開始日期', '2026-03-01'],
    ['project', '測試期結束日期', '2026-04-01'],
    ['project', '保養期結束日期', '2026-06-30'],
    ['schedule', '排程', '2026-01-20'],
    ['schedule', '彩排', '2026-05-02'],
    ['schedule', '尾聲', '2026-08-01'],
  ],
);
assert.deepEqual(buildKeyDateRows({}, []), []);

const today = '2026-05-01';
const billing = buildBillingBrief(
  [
    {
      id: 'paid',
      type: '主要收入',
      installmentNumber: 1,
      billedAmount: 3000,
      dueDate: '2026-03-01',
      outstanding: 0,
      paymentStatus: 'Received',
      currency: 'HKD',
    },
    {
      id: 'overdue',
      type: '主要收入',
      installmentNumber: 2,
      billedAmount: 4000,
      dueDate: '2026-04-01',
      outstanding: 4000,
      paymentStatus: 'Not Received',
    },
    {
      id: 'next',
      type: '主要收入',
      installmentNumber: 3,
      billedAmount: 5000,
      dueDate: '2026-05-01',
      outstanding: 2000,
      paymentStatus: 'Pending Check',
      currency: 'USD',
    },
    {
      id: 'later',
      type: '後加項目',
      installmentNumber: 1,
      billedAmount: 800,
      dueDate: '2026-06-01',
      outstanding: 800,
      paymentStatus: 'Not Received',
    },
    {
      id: 'undated',
      type: '代付項目',
      billedAmount: 100,
      outstanding: 100,
    },
  ],
  today,
);

assert.equal(billing.next?.id, 'next');
assert.equal(billing.next?.dueDate, '2026-05-01');
assert.equal(billing.next?.billedAmount, 5000);
assert.equal(billing.next?.currency, 'USD');
assert.equal(billing.next?.overdue, false);
assert.equal(billing.next?.isNext, true);
assert.equal(billingStillShort(billing.next!), true);
assert.deepEqual(
  billing.rows.map((row) => [row.id, row.isNext, row.open]),
  [
    ['paid', false, false],
    ['overdue', false, true],
    ['next', true, true],
    ['later', false, true],
    ['undated', false, true],
  ],
);
assert.equal(incomeBriefLabel('主要收入', 3), '主要收入 第3期');
assert.equal(incomeBriefLabel('  ', null), '收入');

const onlyOverdue = buildBillingBrief(
  [
    { id: 'older', type: '主要收入', installmentNumber: 1, billedAmount: 10, dueDate: '2026-01-01', outstanding: 10, paymentStatus: 'Not Received' },
    { id: 'newer', type: '主要收入', installmentNumber: 2, billedAmount: 20, dueDate: '2026-02-01', outstanding: 20, paymentStatus: 'Not Received' },
  ],
  today,
);
assert.equal(onlyOverdue.next?.id, 'older');
assert.equal(onlyOverdue.next?.overdue, true);

const settled = buildBillingBrief(
  [{ id: 'done', type: '主要收入', installmentNumber: 1, billedAmount: 10, dueDate: '2026-01-01', outstanding: 10, paymentStatus: 'Received' }],
  today,
);
assert.equal(settled.next, null);
assert.equal(settled.rows[0]?.open, false);

const undatedOnly = buildBillingBrief(
  [{ id: 'open', type: '主要收入', billedAmount: 90, outstanding: 90, paymentStatus: 'Not Received' }],
  today,
);
assert.equal(undatedOnly.next?.id, 'open');
assert.equal(undatedOnly.next?.dueDate, undefined);

assert.equal(hasMediaPublications(null), false);
assert.equal(hasMediaPublications(undefined), false);
assert.equal(hasMediaPublications([]), false);
assert.equal(hasMediaPublications([{ url: '  ' }]), false);
assert.equal(hasMediaPublications([{ url: 'https://news.example/a' }]), true);

const fivePhotos = [
  { id: 'a', createdAt: '2026-01-03' },
  { id: 'b', createdAt: '2026-01-01' },
  { id: 'c', createdAt: '2026-01-02' },
  { id: 'd', createdAt: '2026-01-04' },
  { id: 'e', createdAt: '2026-01-05' },
];
const preview = deliverablePhotoPreview(fivePhotos);
assert.deepEqual(preview.visible.map((photo) => photo.id), ['a', 'b', 'c']);
assert.equal(preview.extraCount, 2);
assert.equal(deliverableExtraLabel(preview.extraCount), '+2張');
assert.equal(deliverablePhotoPreview(fivePhotos.slice(0, 3)).extraCount, 0);
assert.equal(deliverablePhotoPreview([]).extraCount, 0);
assert.equal(deliverablesSectionVisible(false, 0), false);
assert.equal(deliverablesSectionVisible(true, 0), true);
assert.equal(deliverablesSectionVisible(false, 2), true);

const ordered = completionPhotosFromDocs([
  { id: 'other', docTypeId: 'not-photo', createdAt: '2026-01-01', fileName: 'skip' },
  { id: 'new', docTypeId: '932c07f2-abb7-47cf-ad48-e846ce13a6c7', createdAt: '2026-02-02', fileName: 'b' },
  { id: 'old', docTypeId: '932c07f2-abb7-47cf-ad48-e846ce13a6c7', createdAt: '2026-02-01', fileName: 'a' },
]);
assert.deepEqual(ordered.map((row) => row.id), ['old', 'new']);

let hits = 0;
const stop = subscribeProjectData(projectIncomesKey('p1'), () => { hits += 1; });
publishProjectData(projectIncomesKey('p1'));
publishProjectData(projectIncomesKey('other'));
assert.equal(hits, 1);
stop();
publishProjectData(projectIncomesKey('p1'));
assert.equal(hits, 1);

const pitching = read('src/components/quotation/PitchingModule.tsx');
const detail = pitching.slice(
  pitching.indexOf('export function PitchingDetail'),
  pitching.indexOf('export function PitchingModule'),
);
const infoBlock = detail.slice(detail.indexOf("activeTab === 'info'"), detail.indexOf("activeTab === 'schedule'"));
assert.match(detail, /<ClientProjectSidePanel/);
assert.doesNotMatch(infoBlock, /ClientProjectSidePanel/);
assert.ok(
  detail.indexOf("activeTab === 'cost'") < detail.indexOf('<ClientProjectSidePanel'),
  'the rail sits with the tab body, not inside one tab',
);

const panel = read('src/components/quotation/ClientProjectSidePanel.tsx');
assert.match(panel, /關鍵日期/);
assert.match(panel, /收款資料/);
assert.match(panel, /成果輸出/);
assert.match(panel, /下一筆收款/);
assert.match(panel, /deliverablesSectionVisible\(publications\.length > 0, photos\.length\)/);
assert.match(panel, /CompletionPhotoPreview/);
assert.match(panel, /deliverableExtraLabel\(photoPreview\.extraCount\)/);
assert.match(panel, /useSchedules\('quotation_client', projectId\)/);
assert.match(panel, /useQuotationIncomes\(projectId\)/);
assert.match(panel, /useQuotationDocs\(projectId\)/);

const docsHook = read('src/hooks/useQuotationDocs.ts');
assert.match(docsHook, /subscribeProjectData\(projectDocsKey\(projectId\)/);
assert.equal((docsHook.match(/publishProjectData\(projectDocsKey\(projectId\)\)/g) ?? []).length, 3);

const photosSection = read('src/components/quotation/CompletionPhotosSection.tsx');
assert.match(photosSection, /export function CompletionPhotoPreview/);
assert.match(photosSection, /completionPhotosFromDocs/);

const incomesHook = read('src/hooks/useQuotationIncomes.ts');
assert.match(incomesHook, /subscribeProjectData\(projectIncomesKey\(projectId\)/);
assert.equal((incomesHook.match(/publishProjectData\(projectIncomesKey\(projectId\)\)/g) ?? []).length, 6);

const schedulesHook = read('src/hooks/useSchedules.ts');
assert.match(schedulesHook, /subscribeProjectData\(projectSchedulesKey\(relatedType, relatedId\)/);
assert.equal((schedulesHook.match(/publishProjectData\(projectSchedulesKey\(relatedType, relatedId\)\)/g) ?? []).length, 3);

console.log('client project side panel: ok');
