import assert from 'node:assert/strict';
import { formatFccPhone, inquiryAlreadyOpened, organizeFccNotes, parseFccInquiry } from '../supabase/functions/_shared/fcc-asana-mail.ts';

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
  assert.equal(lunch.mail.notes.includes('Referrer URL: https://example.com/menu'), true);
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

const form = parseFccInquiry(
  [
    '<table>',
    '<tr><td>姓名*</td><td>Selena Shum</td></tr>',
    '<tr><td>稱謂*</td><td>小姐</td></tr>',
    '<tr><td>公司/機構名稱</td><td>香港童軍總會九龍第61 旅</td></tr>',
    '<tr><td>聯絡電話*</td><td>91703598</td></tr>',
    '<tr><td>有興趣了解的到會形式<br>(可選多於一項)*</td><td>經濟飯盒 (正餐)</td></tr>',
    '<tr><td>活動性質<br>(可選多於一項)*</td><td>學校團購</td></tr>',
    '<tr><td>菜式 (可選多於一項)*</td><td>中餐 Chinese, 西餐 Western</td></tr>',
    '<tr><td>送餐地區及方式<br>(訂滿$2800可免地面交收運費)*</td><td>免費地面車邊交收送貨 (訂滿$2800)</td></tr>',
    '<tr><td>初步食物到會預算 (人均/總計)<br>(方便出報價)*</td><td>50</td></tr>',
    '<tr><td>了解條款及政策</td><td>已閱讀</td></tr>',
    '</table>',
    '<p>Referrer: https://facebook.com/</p>',
  ].join(''),
  rule,
);
assert.equal(form.ok, true);
if (form.ok) {
  assert.equal(form.mail.notes, [
    '姓名: Selena Shum',
    '稱謂: 小姐',
    '公司/機構名稱: 香港童軍總會九龍第61 旅',
    '聯絡電話: 91703598',
    '有興趣了解的到會形式: 經濟飯盒 (正餐)',
    '活動性質: 學校團購',
    '菜式: 中餐 Chinese, 西餐 Western',
    '送餐地區及方式: 免費地面車邊交收送貨 (訂滿$2800)',
    '初步食物到會預算 (人均/總計): 50',
    'Referrer URL: https://facebook.com/',
  ].join('\n'));
}

assert.equal(organizeFccNotes([
  '姓名*: : Selena Shum',
  '公司/機構名稱: : 香港童軍總會九龍第61 旅',
  '有興趣了解的到會形式',
  '(可選多於一項)*: : 經濟飯盒 (正餐)',
  '活動性質',
  '(可選多於一項): : 學校團購',
  '菜式 (可選多於一項): : 中餐 Chinese, 西餐 Western',
  '初步食物到會預算 (人均/總計)',
  '(方便出報價)*: : 50',
  '送餐地區及方式',
  '(訂滿$2800可免地面交收運費)*: : 免費地面車邊交收送貨 (訂滿$2800)',
  'Referrer: https://facebook.com/',
].join('\n')), [
  '姓名: Selena Shum',
  '公司/機構名稱: 香港童軍總會九龍第61 旅',
  '有興趣了解的到會形式: 經濟飯盒 (正餐)',
  '活動性質: 學校團購',
  '菜式: 中餐 Chinese, 西餐 Western',
  '初步食物到會預算 (人均/總計): 50',
  '送餐地區及方式: 免費地面車邊交收送貨 (訂滿$2800)',
  'Referrer URL: https://facebook.com/',
].join('\n'));

const colonTitle = parseFccInquiry(
  ['姓名*: : Tam', '聯絡電話*: : 92070847', '公司/機構名稱: : 中石化分公司', '經濟飯盒 (正餐)'].join('\n'),
  rule,
);
assert.equal(colonTitle.ok, true);
if (colonTitle.ok) {
  assert.equal(colonTitle.mail.title, 'FC Lunch Box - Tam 9207 0847 中石化分公司');
  assert.equal(colonTitle.mail.title.includes(':'), false);
}

const none = parseFccInquiry('只是一封普通郵件', rule);
assert.equal(none.ok, false);

assert.equal(formatFccPhone('+852 9123-4567'), '9123 4567');
const sameNotes = '姓名: Connie Chong\n聯絡電話: 2710 8070\n公司名稱: 循道衛理';
assert.equal(inquiryAlreadyOpened('FC Lunch Box - Connie Chong 2710 8070 循道衛理', sameNotes, 'FC Lunch Box - Connie Chong 2710 8070 循道衛理', sameNotes), true);
assert.equal(inquiryAlreadyOpened('FC Lunch Box - Connie Chong 2710 8070 循道衛理', sameNotes, 'FC Lunch Box - Connie Chong 2710 8070 循道衛理', '姓名: Connie Chong\n人數: 40'), false);
assert.equal(inquiryAlreadyOpened('FC Lunch Box - Connie Chong 2710 8070 循道衛理', sameNotes, 'FC Lunch Box - 另一個標題', sameNotes), false);
assert.equal(inquiryAlreadyOpened('FC Lunch Box - Selena Shum 9170 3598 香港童軍總會發展部', sameNotes, 'FC Lunch Box - Selena Shum 9170 3598 香港童軍總會九龍第61 旅', sameNotes), false);
assert.equal(inquiryAlreadyOpened('FC Lunch Box - Connie Chong 2710 8070 循道衛理', '', 'FC Lunch Box - Connie Chong 2710 8070 循道衛理', ''), false);
console.log('fcc asana mail tests passed');
