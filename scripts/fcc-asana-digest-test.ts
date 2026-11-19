import assert from 'node:assert/strict';
import {
  buildFccAsanaDigestEmail,
  fccDigestCron,
  fccDigestProjectLabels,
  fccDigestIsDue,
  normalizeDigestRecipients,
} from '../src/lib/fccAsanaDigest.ts';

const mondayEvening = new Date('2026-11-16T10:05:00Z');
const mondayBefore = new Date('2026-11-16T09:50:00Z');
const saturdayEvening = new Date('2026-11-21T10:05:00Z');

assert.equal(fccDigestIsDue({
  enabled: true,
  sendTime: '18:00:00',
  cadence: 'daily',
  weekday: 1,
  lastSentOn: null,
  now: mondayEvening,
}), true);
assert.equal(fccDigestIsDue({
  enabled: true,
  sendTime: '18:00',
  cadence: 'daily',
  weekday: 1,
  lastSentOn: '2026-11-16',
  now: mondayEvening,
}), false);
assert.equal(fccDigestIsDue({
  enabled: true,
  sendTime: '18:00',
  cadence: 'daily',
  weekday: 1,
  lastSentOn: null,
  now: mondayBefore,
}), false);
assert.equal(fccDigestIsDue({
  enabled: false,
  sendTime: '18:00',
  cadence: 'daily',
  weekday: 1,
  lastSentOn: null,
  now: mondayEvening,
}), false);
assert.equal(fccDigestIsDue({
  enabled: true,
  sendTime: '18:00',
  cadence: 'weekdays',
  weekday: 1,
  lastSentOn: null,
  now: saturdayEvening,
}), false);
assert.equal(fccDigestIsDue({
  enabled: true,
  sendTime: '18:00',
  cadence: 'weekly',
  weekday: 1,
  lastSentOn: null,
  now: saturdayEvening,
}), false);
assert.equal(fccDigestIsDue({
  enabled: true,
  sendTime: '18:00',
  cadence: 'weekly',
  weekday: 6,
  lastSentOn: null,
  now: saturdayEvening,
}), true);

assert.equal(fccDigestCron({ sendTime: '18:00', cadence: 'daily', weekday: 1 }), '0 10 * * *');
assert.equal(fccDigestCron({ sendTime: '18:30', cadence: 'weekdays', weekday: 1 }), '30 10 * * 1,2,3,4,5');
assert.equal(fccDigestCron({ sendTime: '07:30', cadence: 'weekly', weekday: 1 }), '30 23 * * 0');
assert.deepEqual(normalizeDigestRecipients([' Boss@Example.com ', 'bad', 'boss@example.com']), ['boss@example.com']);
assert.deepEqual(
  fccDigestProjectLabels([
    { name: 'FCC Active 1 飯盒報價 Lunch Box Follow Up', section: 'Untitled section' },
    { name: 'FCC Active 2 大單優先跟進 Follow Up', section: '新查詢' },
    { name: 'FCC Active 1 飯盒報價 Lunch Box Follow Up', section: 'Untitled section' },
  ]),
  [
    'FCC Active 1 飯盒報價 Lunch Box Follow Up',
    'FCC Active 2 大單優先跟進 Follow Up（新查詢）',
  ],
);

const email = buildFccAsanaDigestEmail({
  date: '2026-11-19',
  tasks: [{
    title: 'FC Lunch Box - A',
    url: 'https://app.asana.com/0/0/1',
    completed: false,
    assignee: 'Rebecca',
    projects: ['Lunch'],
  }],
});
assert.equal(email.subject, 'FC 查詢 Asana 2026-11-19 — 今日新開 1 個 task');
assert.match(email.html, /未完成/);
assert.match(email.html, /負責人/);
assert.match(email.html, /Rebecca/);
assert.match(email.html, /專案/);
assert.match(email.html, /Lunch/);
assert.match(email.text, /https:\/\/app\.asana\.com\/0\/0\/1/);

const empty = buildFccAsanaDigestEmail({ date: '2026-11-19', tasks: [] });
assert.match(empty.subject, /新開 0 個 task/);
assert.match(empty.html, /沒有新開/);

console.log('fcc asana digest tests passed');
