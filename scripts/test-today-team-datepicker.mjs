import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addCalendarDays,
  parseLocalDateStr,
  toLocalDateStr,
} from '../src/lib/sundayWeek.ts';
import { localDateString } from '../src/services/staffIdentity.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/components/day-report/DayReportModule.tsx'), 'utf8');
const todayTeamFn = src.slice(
  src.indexOf('function TodayTeamReports()'),
  src.indexOf('function WorkCalendar()'),
);

assert.match(todayTeamFn, /useState\(\(\) => localDateString\(\)\)/);
assert.match(todayTeamFn, /DayPickerCalendar/);
assert.match(todayTeamFn, /\.eq\('report_date', targetDate\)/);
assert.doesNotMatch(todayTeamFn, /\.eq\('report_date', todayStr\)/);
assert.match(todayTeamFn, /回到今天/);
assert.match(todayTeamFn, /此日期尚無提交匯報/);

const today = localDateString();
assert.match(today, /^\d{4}-\d{2}-\d{2}$/);

const parsed = parseLocalDateStr('2026-08-28');
assert.equal(toLocalDateStr(parsed), '2026-08-28');
assert.equal(toLocalDateStr(addCalendarDays(parsed, -1)), '2026-08-27');
assert.equal(toLocalDateStr(addCalendarDays(parsed, 1)), '2026-08-29');

console.log('today-team datepicker tests passed');
