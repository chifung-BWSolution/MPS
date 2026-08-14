import assert from 'node:assert/strict';

function addDaysIso(iso, days) {
  const [y, m, day] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const BUCKETS = [
  { id: 'd0_30', fromOffset: 0, toOffset: 29 },
  { id: 'd31_60', fromOffset: 30, toOffset: 59 },
  { id: 'd61_90', fromOffset: 60, toOffset: 89 },
  { id: 'd91_120', fromOffset: 90, toOffset: 119 },
  { id: 'd121_150', fromOffset: 120, toOffset: 149 },
  { id: 'd151_180', fromOffset: 150, toOffset: 179 },
];

const asOf = '2026-08-14';
const ranges = BUCKETS.map((bucket) => ({
  ...bucket,
  from: addDaysIso(asOf, -bucket.toOffset),
  to: addDaysIso(asOf, -bucket.fromOffset),
}));

assert.equal(ranges[0].from, '2026-07-16');
assert.equal(ranges[0].to, '2026-08-14');
assert.equal(ranges[1].from, '2026-06-16');
assert.equal(ranges[1].to, '2026-07-15');
assert.equal(ranges[5].from, '2026-02-16');
assert.equal(ranges[5].to, '2026-03-17');

for (const range of ranges) {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const days = Math.round((to - from) / 86_400_000) + 1;
  assert.equal(days, 30, `${range.id} should cover 30 days, got ${days}`);
}

assert.equal(addDaysIso(ranges[0].from, -1), ranges[1].to);
assert.equal(addDaysIso(ranges[1].from, -1), ranges[2].to);

function addMonthsToKey(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthEndIso(monthKey, asOf) {
  const [year, month] = monthKey.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  if (asOf && monthKey === asOf.slice(0, 7) && asOf < end) return asOf;
  return end;
}

const monthFrom = addMonthsToKey(asOf.slice(0, 7), -5);
const monthTo = asOf.slice(0, 7);
assert.equal(monthFrom, '2026-03');
assert.equal(monthTo, '2026-08');

const monthly = [];
let cursor = monthFrom;
while (cursor <= monthTo) {
  monthly.push({
    id: cursor,
    from: `${cursor}-01`,
    to: monthEndIso(cursor, asOf),
  });
  cursor = addMonthsToKey(cursor, 1);
}

assert.equal(monthly.length, 6);
assert.equal(monthly[0].from, '2026-03-01');
assert.equal(monthly[0].to, '2026-03-31');
assert.equal(monthly[5].from, '2026-08-01');
assert.equal(monthly[5].to, '2026-08-14');
assert.equal(monthly.length <= 6, true);

console.log('ads cost trend bucket ranges: ok');
