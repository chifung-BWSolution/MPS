import assert from 'node:assert/strict';
import {
  buildReaddyConversionResultEmail,
  buildReaddyConversionSubject,
  extractReaddyCode,
  READDY_CONVERSION_RESULT_TO,
} from '../src/lib/readdyConversionMail.ts';

assert.equal(READDY_CONVERSION_RESULT_TO, 'cfb.marketing@chifung.net');
assert.equal(extractReaddyCode(['project-16106125.zip']), '16106125');
assert.equal(extractReaddyCode(['chifung/readdy-fc4c1e']), 'fc4c1e');
assert.equal(extractReaddyCode(['']), '未知');

const subject = buildReaddyConversionSubject({
  siteName: '範例現場音樂',
  readdyCode: '16106125',
  date: '2026-11-25',
});
assert.equal(subject, '【MPS】範例現場音樂(Readdy-16106125)轉換結果 2026-11-25');

const success = buildReaddyConversionResultEmail({
  siteName: '範例現場音樂',
  readdyCode: '16106125',
  date: '2026-11-25',
  framerProjectUrl: 'https://framer.com/projects/example',
  kind: 'success',
  unstarted: 0,
  pages: [{ path: '/', title: '首頁', status: 'migrated', sectionCount: 2 }],
});
const failure = buildReaddyConversionResultEmail({
  siteName: '範例現場音樂',
  readdyCode: '16106125',
  date: '2026-11-25',
  framerProjectUrl: 'https://framer.com/projects/example',
  kind: 'failed',
  unstarted: 1,
  cancelled: true,
  error: '已中止',
  pages: [{ path: '/about', title: '關於', status: 'failed', sectionCount: 1, error: '已中止' }],
});

assert.equal(success.subject, subject);
assert.equal(failure.subject, subject);
assert.match(success.html, /轉換成功/);
assert.match(failure.html, /轉換失敗/);
assert.match(failure.text, /已中止/);
assert.match(success.html, /lang="zh-Hant"/);
assert.doesNotMatch(success.text, /Publish/);

const published = buildReaddyConversionResultEmail({
  siteName: '範例現場音樂',
  readdyCode: '16106125',
  date: '2026-11-25',
  framerProjectUrl: 'https://framer.com/projects/example',
  kind: 'success',
  unstarted: 0,
  pages: [{ path: '/', title: '首頁', status: 'migrated', sectionCount: 2 }],
  publishNote: '已 Publish 到正式站 https://example.com',
});
assert.match(published.text, /已 Publish 到正式站 https:\/\/example.com/);
assert.match(published.html, /已 Publish 到正式站 https:\/\/example.com/);

console.log('readdy conversion mail checks passed');
