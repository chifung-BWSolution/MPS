import assert from 'node:assert/strict';
import { formatFccPhone, parseFccInquiry } from '../supabase/functions/_shared/fcc-asana-mail.ts';

const rule = {
  lunchProjectGid: 'lunch',
  cateringProjectGid: 'catering',
  lunchTitlePrefix: 'FC Lunch Box',
  cateringTitlePrefix: 'FC Catering',
};

const lunch = parseFccInquiry(
  ['姓名: 陳大文', '聯絡電話: 91234567', '公司名稱: 測試公司', '有興趣了解的到會形式: 經濟飯盒 (正餐)', '了解條款及政策', 'Referrer: https://example.com/menu'].join('\n'),
  rule,
);
assert.equal(lunch.ok, true);
if (lunch.ok) {
  assert.equal(lunch.mail.route, 'lunch');
  assert.equal(lunch.mail.projectGid, 'lunch');
  assert.equal(lunch.mail.title, 'FC Lunch Box - 陳大文 9123 4567 測試公司');
  assert.equal(lunch.mail.notes.includes('了解條款'), false);
  assert.equal(lunch.mail.notes.includes('https://example.com/menu'), true);
}

const catering = parseFccInquiry('姓名：李小明\n電話：6123 4567\n公司：到會公司\n正餐 到會 (大盤)', rule);
assert.equal(catering.ok, true);
if (catering.ok) {
  assert.equal(catering.mail.route, 'catering');
  assert.equal(catering.mail.title, 'FC Catering - 李小明 6123 4567 到會公司');
}

const both = parseFccInquiry('經濟飯盒\n小食 到會 (大盤)', rule);
assert.equal(both.ok && both.mail.route, 'catering');

const none = parseFccInquiry('只是一封普通郵件', rule);
assert.equal(none.ok, false);

assert.equal(formatFccPhone('+852 9123-4567'), '9123 4567');
console.log('fcc asana mail tests passed');
