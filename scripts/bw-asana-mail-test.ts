import assert from 'node:assert/strict';
import { bwSkipReason, formatBwInquiryTitle, matchBwRoute, organizeBwNotes, parseBwInquiry } from '../supabase/functions/_shared/bw-asana-mail.ts';

const wall = formatBwInquiryTitle({
  subject: '[九龍]牆身工程查詢: Ivy 93093186 -',
  name: ': Ivy',
  phone: ': 93093186',
  address: '九龍',
});
assert.equal(wall, '[九龍]牆身工程查詢 - Ivy 9309 3186 九龍');
assert.equal(wall.includes(':'), false);
assert.equal(wall.includes('：'), false);

const office = formatBwInquiryTitle({
  subject: 'Project Connect寫字樓 Office:Ken先生 63193898',
  name: 'Ken先生',
  phone: '63193898',
  address: '',
});
assert.equal(office, 'Project Connect寫字樓 Office - Ken先生 6319 3898');
assert.equal(office.includes(':'), false);

const tel = formatBwInquiryTitle({
  subject: 'BWC Design: Anna Wong小姐 tel: 66418214',
  name: 'Anna Wong小姐 tel: 66418214',
  phone: '',
  address: '',
});
assert.equal(tel, 'BWC Design - Anna Wong小姐 tel 66418214');
assert.equal(tel.includes(':'), false);

const notes = organizeBwNotes([
  '姓名*: : Ivy',
  '手提電話(Whatsapp/SMS)*: : 93093186',
  '地區: 九龍',
].join('\n'));
assert.equal(notes, '姓名: Ivy\n手提電話(Whatsapp/SMS): 93093186\n地區: 九龍');
assert.equal(notes.includes(': :'), false);
assert.equal(notes.includes('：'), false);

const routes = [
  { keyword: '工程查詢', assigneeEmail: 'a@example.com', projectGid: 'short', enabled: true },
  { keyword: '寫字樓', assigneeEmail: '', projectGid: '', enabled: true },
  { keyword: 'Clinic', assigneeEmail: 'franco@example.com', projectGid: 'clinic', enabled: true },
  { keyword: 'OTHER', assigneeEmail: 'franco@example.com', projectGid: 'solar', enabled: true },
];
assert.equal(matchBwRoute('醫療中心 Clinic工程查詢: 林 59836939', routes, 'phrase', 3)?.keyword, 'Clinic');
assert.equal(matchBwRoute('其他類別 Other工程查詢: Ay 93794634', routes, 'phrase', 3)?.keyword, '工程查詢');
assert.equal(matchBwRoute('Project Connect其他類別 Other: Franco', routes, 'phrase', 3), null);
const otherRoutes = [
  ...routes,
  { keyword: 'Other', assigneeEmail: '', projectGid: '', enabled: true },
];
assert.equal(matchBwRoute('其他類別 Other工程查詢: Ay 93794634', otherRoutes, 'phrase', 3)?.keyword, 'Other');
assert.equal(matchBwRoute('OTHER solar', otherRoutes, 'phrase', 3)?.keyword, 'OTHER');
assert.equal(matchBwRoute('寫字樓 Office工程查詢: 周 98803692', routes, 'phrase', 3)?.keyword, '工程查詢');
assert.equal(matchBwRoute('Project Connect寫字樓 Office:Ken', routes, 'phrase', 3)?.keyword, '寫字樓');
assert.equal(bwSkipReason('FCC到會查詢 學校團購: 蘇', []), '這是 FC 查詢，不在 BW 開 task');
assert.equal(bwSkipReason('Payment Disabled', []), 'EmailMeForm 系統通知，不開 task');
assert.equal(bwSkipReason('Daily Sales Report', ['daily sales report']), '主旨包含略過字句「daily sales report」，不開 task');

const parsed = parseBwInquiry(
  ['姓名: Ivy', '手提電話(Whatsapp/SMS): 93093186', '地區: 九龍', '工程地點: 九龍灣'].join('\n'),
  '[九龍]牆身工程查詢: Ivy 93093186 -',
);
assert.equal(parsed.title, '[九龍]牆身工程查詢 - Ivy 9309 3186 九龍灣');
assert.equal(parsed.title.includes(':'), false);

console.log('bw asana mail tests passed');
