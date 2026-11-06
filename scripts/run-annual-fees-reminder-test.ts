import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAnnualFeeGroups, type AnnualFeeIncomeRow } from '../src/lib/annualFeeIncomes.ts';
import {
  ANNUAL_FEES_REMINDER_SUBJECT,
  annualFeeReminderIdempotencyKey,
  annualFeesPageHref,
  buildAnnualFeeReminderEmails,
  collectAnnualFeeReminderRecipients,
} from '../src/lib/annualFeeReminder.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const AS_OF = '2026-09-17';

function income(partial: Partial<AnnualFeeIncomeRow> & { id: string }): AnnualFeeIncomeRow {
  return {
    projectName: 'Alpha',
    clientName: 'Acme',
    quotationClientProjectId: 'project-a',
    projectTypeKey: 'bwt_web',
    typeLabel: '主要收入',
    billedAmount: 100,
    paymentAmount: 0,
    outstanding: 100,
    currency: 'HKD',
    ...partial,
  };
}

const groups = buildAnnualFeeGroups([
  income({ id: 'overdue-open', billedAmount: 200, paymentAmount: 120, outstanding: 80, dueDate: '2026-09-01' }),
  income({ id: 'future', billedAmount: 500, outstanding: 500, dueDate: '2026-12-01', installmentNumber: 2 }),
  income({
    id: 'system-next',
    projectName: 'Beta',
    clientName: 'Beacon',
    quotationClientProjectId: 'project-c',
    projectTypeKey: 'bwt_system',
    billedAmount: 70,
    outstanding: 70,
    dueDate: '2026-10-01',
    paymentStatus: 'Not Received',
  }),
  income({
    id: 'gift',
    projectName: 'Gift',
    clientName: 'Acme',
    quotationClientProjectId: 'project-d',
    projectTypeKey: 'bwg_gift',
    billedAmount: 999,
    outstanding: 999,
    dueDate: '2026-09-01',
  }),
], { asOf: AS_OF });

assert.deepEqual(groups.map((group) => group.projectId), ['project-c', 'project-a']);

const report = buildAnnualFeeReminderEmails({
  asOf: AS_OF,
  siteOrigin: 'https://bwteam-marketing.com',
  groups,
  assignments: [
    {
      projectId: 'project-a',
      projectName: 'Alpha',
      staffId: 'staff-ada',
      name: 'Ada Chan',
      email: 'Ada@Example.com',
      active: true,
    },
    {
      projectId: 'project-c',
      projectName: 'Beta',
      staffId: 'staff-ben',
      name: 'Ben Wong',
      email: 'ben@example.com',
      active: true,
    },
    {
      projectId: 'project-a',
      projectName: 'Alpha',
      staffId: 'staff-ada-2',
      name: 'Ada Archive',
      email: 'ada@example.com',
      active: true,
    },
  ],
});

assert.equal(report.emails.length, 2);
assert.deepEqual(report.emails.map((email) => email.to), ['Ada@Example.com', 'ben@example.com']);
assert.equal(report.emails[0].subject, ANNUAL_FEES_REMINDER_SUBJECT);
assert.equal(report.emails[0].subject, 'BWT月費/年費收費時間表');
assert.equal(
  report.emails[0].idempotencyKey,
  annualFeeReminderIdempotencyKey(AS_OF, 'ada@example.com'),
);
assert.equal(annualFeesPageHref('https://bwteam-marketing.com/'), 'https://bwteam-marketing.com/#finance/annual-fees');

const ada = report.emails[0];
assert.match(ada.html, /lang="zh-Hant"/);
assert.match(ada.html, /dir="ltr"/);
assert.match(ada.html, /<th scope="col"/);
assert.match(ada.html, /role="presentation"/);
assert.match(ada.html, /BWT月費\/年費收費時間表/);
assert.match(ada.html, /Alpha/);
assert.match(ada.html, /Beta/);
assert.match(ada.html, /Beacon/);
assert.match(ada.html, /BWT 網頁/);
assert.match(ada.html, /BWT 系統/);
assert.match(ada.html, /逾期 16 日/);
assert.match(ada.html, /\$80\.00 HKD/);
assert.match(ada.html, /\$500\.00 HKD/);
assert.match(ada.html, /未收款 Not Received/);
assert.match(ada.html, /請你跟進/);
assert.match(ada.html, /開啟年度收費頁面/);
assert.match(ada.html, /https:\/\/bwteam-marketing\.com\/#finance\/annual-fees/);
assert.match(ada.text, /Alpha（請你跟進）/);
assert.match(ada.text, /Beta/);
assert.doesNotMatch(ada.text, /Beta（請你跟進）/);
assert.doesNotMatch(ada.html, /Gift/);
assert.match(report.emails[1].text, /Beta（請你跟進）/);
assert.doesNotMatch(report.emails[1].text, /Alpha（請你跟進）/);

const skipped = collectAnnualFeeReminderRecipients([
  { projectId: 'p1', projectName: '沒有 PM', },
  { projectId: 'p2', projectName: '已離職', staffId: 'old', name: 'Old', email: 'old@example.com', active: false },
  { projectId: 'p3', projectName: '沒有電郵', staffId: 'none', name: 'None', active: true },
]);
assert.deepEqual(skipped.recipients, []);
assert.deepEqual(skipped.skipped.map((row) => row.reason), ['no_main_pm', 'inactive', 'no_email']);

const fn = read('supabase/functions/annual-fees-reminder/index.ts');
const config = read('supabase/config.toml');
assert.match(fn, /sendResendEmail/);
assert.match(fn, /service_role/);
assert.match(fn, /buildAnnualFeeGroups/);
assert.match(fn, /main_pm:staffs!main_pm_id/);
assert.match(fn, /dryRun/);
assert.match(fn, /idempotencyKey/);
assert.match(config, /\[functions\.annual-fees-reminder\]/);
assert.match(config, /verify_jwt = true/);

const migrationName = readdirSync(join(root, 'supabase/migrations'))
  .find((name) => name.endsWith('_annual_fees_reminder_weekly_cron.sql'));
assert.ok(migrationName);
const migration = read(join('supabase/migrations', migrationName));
assert.match(migration, /annual-fees-reminder-weekly/);
assert.match(migration, /0 22 \* \* 0/);
assert.match(migration, /functions\/v1\/annual-fees-reminder/);
assert.match(migration, /cron\.schedule/);

console.log('annual fees reminder checks passed');
