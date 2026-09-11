import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calendarDaysBetween,
  calcClientProjectProgress,
  calcRemainingDays,
  clientProjectProgressConfig,
  localTodayIso,
} from '../src/data/pitchingData';

assert.equal(calendarDaysBetween('2026-08-25', '2026-08-25'), 0);
assert.equal(calendarDaysBetween('2026-08-21', '2026-08-25'), 4);
assert.equal(calendarDaysBetween('2027-03-08', '2026-08-25'), -195);
assert.equal(calendarDaysBetween('bad', '2026-08-25'), null);

assert.equal(calcRemainingDays('2026-08-25', 'initial', '2026-08-25'), 45);
assert.equal(calcRemainingDays('2026-08-21', 'initial', '2026-08-25'), 41);
assert.equal(calcRemainingDays('2026-08-20', 'initial', '2026-08-25'), 40);
assert.equal(calcRemainingDays('2026-07-11', 'initial', '2026-08-25'), 0);
assert.equal(calcRemainingDays('2026-07-10', 'initial', '2026-08-25'), -1);

// Confirmed / future inquiry dates used to render "—" because status !== initial.
assert.equal(calcRemainingDays('2027-03-08', 'confirmed', '2026-08-25'), 240);
assert.equal(calcRemainingDays('2027-03-01', 'confirmed', '2026-08-25'), 233);
assert.equal(calcRemainingDays('2026-08-13', 'following_up', '2026-08-25'), 33);
assert.equal(calcRemainingDays('2026-08-13', 'closed', '2026-08-25'), 33);

assert.equal(calcRemainingDays('', 'initial', '2026-08-25'), null);
assert.equal(calcRemainingDays('not-a-date', 'initial', '2026-08-25'), null);
assert.equal(calcRemainingDays('2026-08-25T16:00:00.000Z', 'confirmed', '2026-08-25'), 45);

const today = localTodayIso();
assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(calcRemainingDays(today, 'initial'), 45);

assert.equal(calcClientProjectProgress('2026-09-10', '2026-09-20', '2026-09-09'), 'pending');
assert.equal(calcClientProjectProgress('2026-09-10', '2026-09-20', '2026-09-10'), 'in_progress');
assert.equal(calcClientProjectProgress('2026-09-10', '2026-09-20', '2026-09-15'), 'in_progress');
assert.equal(calcClientProjectProgress('2026-09-10', '2026-09-20', '2026-09-20'), 'in_progress');
assert.equal(calcClientProjectProgress('2026-09-10', '2026-09-20', '2026-09-21'), 'completed');
assert.equal(calcClientProjectProgress(undefined, '2026-09-20', '2026-09-21'), null);
assert.equal(calcClientProjectProgress('2026-09-10', undefined, '2026-09-15'), null);
assert.equal(calcClientProjectProgress('', '2026-09-20', '2026-09-21'), null);
assert.equal(clientProjectProgressConfig.pending.label, '待開始');
assert.equal(clientProjectProgressConfig.in_progress.label, '進行中');
assert.equal(clientProjectProgressConfig.completed.label, '已完成');

const pending = readFileSync(
  new URL('../src/components/quotation/AsanaPendingModule.tsx', import.meta.url),
  'utf8',
);
assert.match(pending, /RemainingDaysCell/);
assert.match(pending, /剩餘天數/);
assert.match(pending, /inquiryDate=\{task\.inquiryDate\}/);
assert.match(pending, /status="initial"/);
assert.match(pending, /colSpan=\{8\}/);
assert.doesNotMatch(pending, /區塊/);

console.log('pitching remaining days: ok');
