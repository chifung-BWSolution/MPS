import assert from 'node:assert/strict';
import { formatBwInquiryTitle, organizeBwNotes } from '../supabase/functions/_shared/bw-asana-mail.ts';

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

console.log('bw asana mail tests passed');
