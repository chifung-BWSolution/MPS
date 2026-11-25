import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANNUAL_FEES_REMINDER_SUBJECT } from '../src/lib/annualFeeReminder.ts';
import { DEFAULT_RECEIVABLES_ALERT_RECIPIENTS } from '../src/lib/receivablesAlert.ts';
import { buildSystemNotificationCatalog } from '../src/lib/systemNotifications.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const docs = buildSystemNotificationCatalog();
const byId = new Map(docs.map((doc) => [doc.id, doc]));

assert.deepEqual(docs.map((doc) => doc.id), [
  'annual-fees-reminder',
  'receivables-alert',
  'fcc-asana-digest',
  'ads-email-alert',
  'readdy-framer-conversion',
]);
assert.equal(docs.filter((doc) => doc.kind === 'scheduled').length, 3);
assert.equal(docs.filter((doc) => doc.kind === 'manual').length, 2);

const annual = byId.get('annual-fees-reminder');
assert.ok(annual);
assert.equal(annual.subject, ANNUAL_FEES_REMINDER_SUBJECT);
assert.equal(annual.subject, 'BWT月費/年費收費時間表');
assert.equal(annual.previewSubject, ANNUAL_FEES_REMINDER_SUBJECT);
assert.match(annual.frequency, /每週一 06:00/);
assert.match(annual.frequency, /0 22 \* \* 0/);
assert.equal(annual.to.summary, '各項目在職主負責 PM 的工作電郵（每人一封）');
assert.deepEqual(annual.to.addresses, []);
assert.deepEqual(annual.cc, []);
assert.deepEqual(annual.bcc, []);
assert.match(annual.previewHtml, /請你跟進/);
assert.match(annual.previewHtml, /範例網頁保養/);
assert.match(annual.previewHtml, /範例系統保養/);
assert.match(annual.previewHtml, /lang="zh-Hant"/);

const receivables = byId.get('receivables-alert');
assert.ok(receivables);
assert.deepEqual([...receivables.to.addresses], [...DEFAULT_RECEIVABLES_ALERT_RECIPIENTS]);
assert.deepEqual(receivables.cc, []);
assert.deepEqual(receivables.bcc, []);
assert.match(receivables.frequency, /每週一 09:00/);
assert.match(receivables.frequency, /0 1 \* \* 1/);
assert.match(receivables.previewSubject, /應收未收日報 2026\/11\/09/);
assert.match(receivables.previewHtml, /應收未收日報/);
assert.match(receivables.previewHtml, /範例客戶項目/);

const fccDigest = byId.get('fcc-asana-digest');
assert.ok(fccDigest);
assert.equal(fccDigest.kind, 'scheduled');
assert.equal(fccDigest.subject, 'FC 查詢 Asana {日期} — 今日新開 {個數} 個 task');
assert.match(fccDigest.frequency, /每日 18:00/);
assert.match(fccDigest.frequency, /未啟用/);
assert.match(fccDigest.frequency, /0 10 \* \* \*/);
assert.equal(fccDigest.to.summary, '本頁設定儲存的收件人');
assert.deepEqual(fccDigest.to.addresses, []);
assert.deepEqual(fccDigest.cc, []);
assert.deepEqual(fccDigest.bcc, []);
assert.match(fccDigest.previewSubject, /FC 查詢 Asana 2026-11-19 — 今日新開 2 個 task/);
assert.match(fccDigest.previewHtml, /lang="zh-Hant"/);
assert.match(fccDigest.previewHtml, /範例客人/);
assert.match(fccDigest.previewHtml, /已完成/);
assert.match(fccDigest.previewHtml, /app\.asana\.com/);

const ads = byId.get('ads-email-alert');
assert.ok(ads);
assert.equal(ads.kind, 'manual');
assert.match(ads.frequency, /無固定排程/);
assert.match(ads.subject, /CPC\/CPA 上升超過 20%/);
assert.match(ads.previewSubject, /廣告成效預警/);
assert.match(ads.previewHtml, /範例品牌/);
assert.deepEqual(ads.cc, []);
assert.deepEqual(ads.bcc, []);

const readdy = byId.get('readdy-framer-conversion');
assert.ok(readdy);
assert.equal(readdy.kind, 'manual');
assert.equal(readdy.subject, '【MPS】{網站名稱}(Readdy-{編號})轉換結果 {日期}');
assert.match(readdy.frequency, /無固定排程/);
assert.deepEqual([...readdy.to.addresses], ['cfb.marketing@chifung.net']);
assert.deepEqual(readdy.cc, []);
assert.deepEqual(readdy.bcc, []);
assert.equal(readdy.previewSubject, '【MPS】範例現場音樂(Readdy-16106125)轉換結果 2026-11-09');
assert.match(readdy.previewHtml, /lang="zh-Hant"/);
assert.match(readdy.previewHtml, /轉換成功/);
assert.match(readdy.previewHtml, /範例現場音樂/);
assert.match(readdy.previewHtml, /\/services/);

const menu = read('src/context/AppContext.tsx');
assert.match(menu, /電郵連接[\s\S]*系統通知[\s\S]*登入紀錄/);
const settings = read('src/components/settings/SettingsModule.tsx');
assert.match(settings, /system-notifications/);
assert.match(settings, /SystemNotificationsSettings/);

const annualFn = read('supabase/functions/annual-fees-reminder/index.ts');
const receivablesFn = read('supabase/functions/receivables-alert/index.ts');
const adsDialog = read('src/components/marketing/AdsEmailAlertDialog.tsx');
assert.doesNotMatch(annualFn, /\bcc:/);
assert.doesNotMatch(receivablesFn, /\bcc:/);
assert.doesNotMatch(adsDialog, /\bcc:/);

console.log('system notifications checks passed');
