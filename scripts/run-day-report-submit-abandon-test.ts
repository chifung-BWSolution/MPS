import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDayReportCompletionStatus,
  isAbandonedEmptyDayReport,
  toDayReportWeekCard,
} from '../src/lib/dayReportCompletion';

assert.equal(isAbandonedEmptyDayReport({ is_leave: false }, 0), true);
assert.equal(isAbandonedEmptyDayReport({ is_leave: false }, 1), false);
assert.equal(isAbandonedEmptyDayReport({ is_leave: true }, 0), false);
assert.equal(isAbandonedEmptyDayReport(null, 0), false);

const created = toDayReportWeekCard({
  id: 'r1',
  report_date: '2026-09-07',
  total_hours: 0,
  target_hours: 8,
  status: 'submitted',
  is_leave: false,
}, 0);
assert.equal(created.fillStatus, 'incomplete');
assert.equal(getDayReportCompletionStatus(created, 0), 'incomplete');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const submitSrc = readFileSync(join(root, 'src/components/day-report/SubmitReportPage.tsx'), 'utf8');
assert.match(submitSrc, /upsertLocalDbReport/);
assert.match(submitSrc, /abandonEmptyReport/);
assert.match(submitSrc, /isAbandonedEmptyDayReport/);
assert.match(submitSrc, /loadDbReports\(\{ silent: true \}\)/);
assert.doesNotMatch(submitSrc, /if \(date > todayStr\) return/);
assert.doesNotMatch(submitSrc, /disabled=\{d\.isFuture\}/);
assert.match(submitSrc, /onClick=\{\(\) => selectDate\(d\.date\)\}/);
assert.match(submitSrc, /selectDate\(toLocalDateStr\(date\)\)/);
assert.doesNotMatch(submitSrc, /可匯報/);
assert.doesNotMatch(submitSrc, /text-gray-400">—</);
assert.match(submitSrc, /超出目標工時/);
assert.match(submitSrc, /hoursExceedTarget/);
assert.doesNotMatch(submitSrc, /targetHoursDirty && existingReportId/);
assert.match(submitSrc, /void handleUpdateTargetHours\(\)/);

console.log('day report submit abandon: ok');
