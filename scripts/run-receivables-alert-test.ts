import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReceivablesAlertEmail,
  chunkRecipients,
  customerFollowUpMessage,
  daysUntilDue,
  hongKongIsoDate,
  projectDetailHref,
  receivablesAlertIdempotencyKey,
  receivablesPageHref,
  DEFAULT_RECEIVABLES_ALERT_RECIPIENTS,
  selectAlertRecipients,
  whatsappDigits,
  whatsappHref,
  type ReceivableAlertProject,
} from '../src/lib/receivablesAlert.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(hongKongIsoDate(new Date('2026-10-08T16:30:00.000Z')), '2026-10-09');
assert.equal(daysUntilDue('2026-10-01', '2026-10-09'), -8);
assert.equal(daysUntilDue('2026-10-09', '2026-10-09'), 0);
assert.equal(whatsappDigits('9123 4567'), '85291234567');
assert.equal(whatsappDigits('+852 9123 4567'), '85291234567');
assert.equal(whatsappDigits('123'), null);

assert.deepEqual(selectAlertRecipients(null), [...DEFAULT_RECEIVABLES_ALERT_RECIPIENTS]);
assert.deepEqual(
  selectAlertRecipients('finance@example.com, finance@example.com ops@example.com'),
  ['finance@example.com', 'ops@example.com'],
);
assert.equal(chunkRecipients(['a@b.c', 'd@e.f', 'g@h.i'], 2).length, 2);
assert.equal(receivablesAlertIdempotencyKey('2026-10-09', 1), 'receivables-alert/2026-10-09/batch-1');

const projects: ReceivableAlertProject[] = [
  {
    projectId: 'proj-confirmed',
    projectName: '2026 品牌年度顧問',
    projectStatus: 'confirmed',
    clientName: '示例品牌有限公司',
    contactPerson: '陳小姐',
    phone: '9123 4567',
    email: 'billing@example.com',
    lines: [
      {
        id: 'income-1',
        typeLabel: '主要收入',
        installmentNumber: 2,
        currency: 'HKD',
        billedAmount: 10000,
        paymentAmount: 0,
        outstanding: 10000,
        dueDate: '2026-09-30',
        paymentStatus: 'Not Received',
        remarks: '請連同發票一起跟進',
      },
      {
        id: 'income-2',
        typeLabel: '後加項目',
        installmentNumber: 1,
        currency: 'HKD',
        billedAmount: 2500,
        paymentAmount: 500,
        outstanding: 2000,
        dueDate: '2026-10-14',
        paymentStatus: 'Pending Check',
      },
    ],
  },
  {
    projectId: 'proj-pitch',
    projectName: '新品發佈 <草稿>',
    projectStatus: 'pitching',
    clientName: '另一客戶',
    lines: [
      {
        id: 'income-3',
        typeLabel: '訂金',
        billedAmount: 800,
        paymentAmount: 0,
        outstanding: 800,
        dueDate: '2026-10-20',
        paymentStatus: 'Not Received',
      },
    ],
  },
];

const email = buildReceivablesAlertEmail({
  asOf: '2026-10-09',
  siteOrigin: 'https://bwteam-marketing.com',
  projects,
});

assert.equal(email.summary.count, 3);
assert.equal(email.summary.overdue, 1);
assert.equal(email.summary.outstanding, 12800);
assert.equal(email.subject, '應收未收日報 2026/10/09 — 未收 3 筆（逾期 1）');
assert.match(email.html, /lang="zh-Hant"/);
assert.match(email.html, /應收未收日報/);
assert.match(email.html, /\$10,000\.00 HKD/);
assert.match(email.html, /逾期 9 日/);
assert.match(email.html, /新品發佈 &lt;草稿&gt;/);
assert.match(email.html, /開啟應收未收頁面/);
assert.match(email.html, /WhatsApp 客戶/);
assert.match(email.html, /電郵客戶/);
assert.match(email.html, /開啟項目/);
assert.match(email.text, /https:\/\/bwteam-marketing\.com\/#finance\/receivables/);
assert.match(email.text, /https:\/\/bwteam-marketing\.com\/#quotation\/projects\?id=proj-confirmed/);
assert.match(email.text, /https:\/\/bwteam-marketing\.com\/#quotation\/pitching\?id=proj-pitch/);
assert.match(email.text, /https:\/\/wa\.me\/85291234567\?text=/);
assert.match(email.text, /mailto:billing@example.com\?subject=/);
assert.match(customerFollowUpMessage(projects[0], '2026-10-09'), /您好，陳小姐/);
assert.match(customerFollowUpMessage(projects[0], '2026-10-09'), /尚未收到的款項/);
assert.equal(
  receivablesPageHref('https://bwteam-marketing.com/'),
  'https://bwteam-marketing.com/#finance/receivables',
);
assert.equal(
  projectDetailHref('https://bwteam-marketing.com', 'proj-confirmed', 'confirmed'),
  'https://bwteam-marketing.com/#quotation/projects?id=proj-confirmed',
);
assert.match(whatsappHref('91234567', '你好') ?? '', /^https:\/\/wa\.me\/85291234567\?text=/);

const empty = buildReceivablesAlertEmail({ asOf: '2026-10-09', projects: [] });
assert.match(empty.subject, /目前沒有未收款項/);
assert.match(empty.html, /目前沒有未收金額大於 0/);

const many = buildReceivablesAlertEmail({
  asOf: '2026-10-09',
  projects: Array.from({ length: 45 }, (_, index) => ({
    projectId: `p-${index}`,
    projectName: `項目 ${index}`,
    clientName: '客戶',
    lines: [
      {
        id: `i-${index}`,
        typeLabel: '主要收入',
        billedAmount: 1,
        paymentAmount: 0,
        outstanding: 1,
        dueDate: '2026-10-01',
      },
    ],
  })),
});
assert.equal(many.summary.count, 45);
assert.equal(many.omittedLineCount, 5);
assert.match(many.html, /另有 5 筆/);

const fn = read('supabase/functions/receivables-alert/index.ts');
const config = read('supabase/config.toml');
const migration = read('supabase/migrations/20261009023553_receivables_alert_daily_cron.sql');
assert.match(fn, /sendResendEmail/);
assert.match(fn, /service_role/);
assert.match(fn, /RECEIVABLES_ALERT_TO/);
assert.match(fn, /selectAlertRecipients\(Deno\.env\.get\("RECEIVABLES_ALERT_TO"\)\)/);
assert.equal(DEFAULT_RECEIVABLES_ALERT_RECIPIENTS.length, 4);
assert.match(fn, /\.gt\("outstanding", 0\)/);
assert.match(config, /\[functions\.receivables-alert\]/);
assert.match(migration, /receivables-alert-daily/);
assert.match(migration, /0 1 \* \* 1-5/);
assert.match(migration, /functions\/v1\/receivables-alert/);
assert.match(migration, /cron\.schedule/);

console.log('receivables alert checks passed');
