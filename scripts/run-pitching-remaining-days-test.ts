import assert from 'node:assert/strict';
import {
  calendarDaysBetween,
  calcRemainingDays,
  localTodayIso,
} from '../src/data/pitchingData';

assert.equal(calendarDaysBetween('2026-08-25', '2026-08-25'), 0);
assert.equal(calendarDaysBetween('2026-08-21', '2026-08-25'), 4);
assert.equal(calendarDaysBetween('2027-03-08', '2026-08-25'), -195);
assert.equal(calendarDaysBetween('bad', '2026-08-25'), null);

assert.equal(calcRemainingDays('2026-08-25', 'initial', '2026-08-25'), 30);
assert.equal(calcRemainingDays('2026-08-21', 'initial', '2026-08-25'), 26);
assert.equal(calcRemainingDays('2026-08-20', 'initial', '2026-08-25'), 25);
assert.equal(calcRemainingDays('2026-07-26', 'initial', '2026-08-25'), 0);
assert.equal(calcRemainingDays('2026-07-25', 'initial', '2026-08-25'), -1);

// Confirmed / future inquiry dates used to render "—" because status !== initial.
assert.equal(calcRemainingDays('2027-03-08', 'confirmed', '2026-08-25'), 225);
assert.equal(calcRemainingDays('2027-03-01', 'confirmed', '2026-08-25'), 218);
assert.equal(calcRemainingDays('2026-08-13', 'following_up', '2026-08-25'), 18);
assert.equal(calcRemainingDays('2026-08-13', 'closed', '2026-08-25'), 18);

assert.equal(calcRemainingDays('', 'initial', '2026-08-25'), null);
assert.equal(calcRemainingDays('not-a-date', 'initial', '2026-08-25'), null);
assert.equal(calcRemainingDays('2026-08-25T16:00:00.000Z', 'confirmed', '2026-08-25'), 30);

const today = localTodayIso();
assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(calcRemainingDays(today, 'initial'), 30);

console.log('pitching remaining days: ok');
