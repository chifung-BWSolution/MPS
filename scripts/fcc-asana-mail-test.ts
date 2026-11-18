import assert from 'node:assert/strict';
import { formatFccPhone, inquiryAlreadyInAsana, parseFccInquiry } from '../supabase/functions/_shared/fcc-asana-mail.ts';

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

const both = parseFccInquiry('姓名: 陳大文\n電話: 91234567\n經濟飯盒\n小食 到會 (大盤)', rule);
assert.equal(both.ok && both.mail.route, 'catering');

const html = parseFccInquiry(
  [
    '<table>',
    '<tr><td style="font-weight:bold">姓名</td><td>陳大文</td></tr>',
    '<tr><td>聯絡電話</td><td>91234567</td></tr>',
    '<tr><td>公司名稱</td><td>測試公司</td></tr>',
    '<tr><td>有興趣了解的到會形式</td><td>經濟飯盒</td></tr>',
    '<tr><td>了解條款及政策</td><td>已閱讀</td></tr>',
    '</table>',
    '<p>Referrer: https://fclunchbox.com/</p>',
  ].join(''),
  rule,
);
assert.equal(html.ok, true);
if (html.ok) {
  assert.equal(html.mail.title, 'FC Lunch Box - 陳大文 9123 4567 測試公司');
  assert.equal(html.mail.notes.includes('<'), false);
  assert.equal(html.mail.notes.includes('了解條款'), false);
  assert.equal(html.mail.notes.includes('https://fclunchbox.com/'), true);
}

const unnamed = parseFccInquiry('<p>經濟飯盒</p>', rule);
assert.equal(unnamed.ok, false);

const fromSubject = parseFccInquiry(
  '<tr style="background-color:#fff"><td>經濟飯盒</td><td>必須填寫</td></tr>',
  rule,
  'FCC到會查詢 工作坊: Tiffany Mak - 27685895 HKMU / 學校 School',
);
assert.equal(fromSubject.ok, true);
if (fromSubject.ok) {
  assert.equal(fromSubject.mail.title, 'FC Lunch Box - Tiffany Mak 2768 5895 HKMU');
  assert.equal(fromSubject.mail.notes.includes('<'), false);
}

const none = parseFccInquiry('只是一封普通郵件', rule);
assert.equal(none.ok, false);

assert.equal(formatFccPhone('+852 9123-4567'), '9123 4567');
assert.equal(inquiryAlreadyInAsana('FC Lunch Box - Connie Chong 2710 8070 循道衛理', '2710 8070', 'FC Lunch Box - Connie Chong 2710 8070 循道衛理'), true);
assert.equal(inquiryAlreadyInAsana('FC Lunch Box - Connie Chong 2710 8070 循道衛理', '27108070', 'FC Lunch Box - 另一個標題'), true);
assert.equal(inquiryAlreadyInAsana('FC Lunch Box -', '2710 8070', 'FC Lunch Box - Connie Chong 2710 8070 公司'), false);
console.log('fcc asana mail tests passed');
