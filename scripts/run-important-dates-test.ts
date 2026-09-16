import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  brandFromProjectType,
  buildImportantDateEvents,
  defaultBrandFilters,
  defaultKindFilters,
  eventsInRange,
  filterImportantDateEvents,
  importantDateProjectHash,
  monthGridDays,
  periodRange,
  periodTitle,
  sectionFromBrand,
  shiftPeriod,
  startOfLocalWeek,
  summarizeImportantDates,
  weekDays,
} from '../src/lib/importantDates';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const types = [
  { id: 'type-bwl', code: 'bwl_event', display: 'BWL 活動', section: 'quotation' as const },
  { id: 'type-bwt', code: 'bwt_web', display: 'BWT 網頁', section: 'system-dev' as const },
];

assert.equal(brandFromProjectType('type-bwl', types), 'BWL');
assert.equal(brandFromProjectType('bwt_web', types), 'BWT');
assert.equal(brandFromProjectType('', types), null);
assert.equal(sectionFromBrand('BWL'), 'quotation');
assert.equal(sectionFromBrand('BWT'), 'system-dev');
assert.deepEqual(defaultBrandFilters('quotation'), { BWL: true, BWT: false });
assert.deepEqual(defaultBrandFilters('system-dev'), { BWL: false, BWT: true });
assert.deepEqual(defaultKindFilters(), {
  project: true,
  income: true,
  expense: true,
  schedule: true,
});

const events = buildImportantDateEvents({
  today: '2026-09-16',
  types,
  projects: [
    {
      id: 'p-bwl',
      pitchingId: 'BWL-E26-001',
      displayName: 'BWL 活動',
      clientName: 'Acme',
      projectTypeId: 'type-bwl',
      inquiryDate: '2026-09-01',
      signedDate: '2026-09-10',
      handoverDate: '',
      contractStartDate: '2026-09-10',
      contractEndDate: '2026-10-10',
      mainPmName: 'Ada',
      status: 'confirmed',
    },
    {
      id: 'p-bwt',
      pitchingId: 'BWT-W26-002',
      displayName: 'BWT 網站',
      projectTypeId: 'bwt_web',
      inquiryDate: '2026-09-03',
      status: 'initial',
    },
  ],
  incomes: [
    {
      id: 'inc-1',
      quotationClientProjectId: 'p-bwl',
      type: '主要收入',
      installmentNumber: 1,
      dueDate: '2026-09-15',
      billedAmount: 12000,
      outstanding: 12000,
      paymentStatus: 'Not Received',
    },
    {
      id: 'inc-miss',
      quotationClientProjectId: 'missing',
      dueDate: '2026-09-15',
    },
  ],
  expenses: [
    {
      id: 'exp-1',
      relatedId: 'hub-bwt',
      supplierLabel: 'Hosting',
      installmentNumber: 2,
      dueDate: '2026-09-18',
      billedAmount: 800,
      outstanding: 0,
      paymentStatus: 'Paid',
    },
  ],
  schedules: [
    {
      id: 'sch-1',
      title: '初稿提交',
      date: '2026-09-16',
      relatedProjectId: 'hub-bwl',
    },
  ],
  hubLinks: [
    { id: 'hub-bwl', relatedId: 'p-bwl' },
    { id: 'hub-bwt', relatedId: 'p-bwt' },
  ],
});

assert.equal(events.some((event) => event.id === 'income:inc-miss'), false);
assert.deepEqual(
  new Set(
    events
      .filter((event) => event.kind === 'project' && event.projectId === 'p-bwl')
      .map((event) => event.title),
  ),
  new Set(['詢價日期', '簽約日期', '合約開始', '合約結束']),
);

const income = events.find((event) => event.id === 'income:inc-1');
assert.ok(income);
assert.equal(income?.brand, 'BWL');
assert.equal(income?.title, '主要收入 第1期');
assert.equal(income?.overdue, true);
assert.equal(income?.section, 'quotation');
assert.equal(importantDateProjectHash(income!), 'quotation/projects?id=p-bwl');

const expense = events.find((event) => event.id === 'expense:exp-1');
assert.ok(expense);
assert.equal(expense?.brand, 'BWT');
assert.equal(expense?.title, 'Hosting 第2期');
assert.equal(expense?.section, 'system-dev');
assert.equal(importantDateProjectHash(expense!), 'system-dev/pitching?id=p-bwt');

const schedule = events.find((event) => event.id === 'schedule:sch-1');
assert.ok(schedule);
assert.equal(schedule?.title, '初稿提交');
assert.equal(schedule?.brand, 'BWL');

const bwlOnly = filterImportantDateEvents(events, { BWL: true, BWT: false }, defaultKindFilters());
assert.equal(bwlOnly.every((event) => event.brand !== 'BWT'), true);
assert.ok(bwlOnly.some((event) => event.kind === 'income'));
assert.equal(bwlOnly.some((event) => event.kind === 'expense'), false);

const incomeOnly = filterImportantDateEvents(
  events,
  { BWL: true, BWT: true },
  { project: false, income: true, expense: false, schedule: false },
);
assert.deepEqual(incomeOnly.map((event) => event.id), ['income:inc-1']);

const none = filterImportantDateEvents(events, { BWL: false, BWT: false }, defaultKindFilters());
assert.equal(none.length, 0);

const cursor = new Date(2026, 8, 16);
assert.deepEqual(periodRange(cursor, 'month'), { start: '2026-09-01', end: '2026-09-30' });
assert.deepEqual(periodRange(cursor, 'week'), { start: '2026-09-14', end: '2026-09-20' });
assert.equal(periodTitle(cursor, 'month'), '九月 2026');
assert.equal(periodTitle(cursor, 'week'), '9/14–9/20, 2026');
assert.equal(formatLocalMonth(shiftPeriod(cursor, 'month', 1)), '2026-10');
assert.equal(weekDays(cursor).length, 7);
assert.equal(startOfLocalWeek(cursor).getDay(), 1);
assert.ok(monthGridDays(cursor).length >= 35);

const september = eventsInRange(events, '2026-09-01', '2026-09-30');
const stats = summarizeImportantDates(september, '2026-09-01', '2026-09-30', '2026-09-16');
assert.equal(stats.incomeCount, 1);
assert.equal(stats.overdueIncomeCount, 1);
assert.ok(stats.projectCount >= 2);

const menu = read('src/context/AppContext.tsx');
assert.match(menu, /id: 'important-dates'/);
assert.match(menu, /label: '重要日子'/);
assert.match(menu, /const quotationSectionSubMenus/);

const quotationModule = read('src/components/quotation/QuotationModule.tsx');
assert.match(quotationModule, /ImportantDatesModule/);
assert.match(quotationModule, /subModule === 'important-dates'/);

const page = read('src/components/quotation/ImportantDatesModule.tsx');
assert.match(page, /defaultBrandFilters\(moduleId\)/);
assert.match(page, /useState<ImportantDateView>\('month'\)/);
assert.match(page, /IMPORTANT_DATE_BRANDS/);
assert.match(page, /IMPORTANT_DATE_KIND_LABELS/);

const lib = read('src/lib/importantDates.ts');
assert.match(lib, /項目日期/);
assert.match(lib, /收入到期/);
assert.match(lib, /支出到期/);
assert.match(lib, /自訂排程/);
assert.match(lib, /section === 'system-dev' \? 'BWT' : 'BWL'/);

const hook = read('src/hooks/useImportantDates.ts');
assert.match(hook, /INCOMES_TABLE/);
assert.match(hook, /EXPENSES_TABLE/);
assert.match(hook, /SCHEDULES_TABLE/);
assert.match(hook, /related_type', 'quotation_client'/);

console.log('important dates: ok');

function formatLocalMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
