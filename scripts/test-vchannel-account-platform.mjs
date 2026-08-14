import assert from 'node:assert/strict';
import {
  PLATFORM_KEYS,
  accountPlatformLabel,
  normalizeAccountPlatform,
} from '../src/lib/vchannelPlatformStatus.ts';

const cases = [
  ['YouTube', 'youtube'],
  ['youtube', 'youtube'],
  ['YT', 'youtube'],
  ['Instagram', 'instagram'],
  ['IG', 'instagram'],
  ['IG Page', 'instagram'],
  ['Facebook', 'facebook'],
  ['FB', 'facebook'],
  ['Facebook Page', 'facebook'],
  ['小紅書', 'xiaohongshu'],
  ['WeChat視頻號', 'wechat_channels'],
  ['微信視頻號', 'wechat_channels'],
  ['抖音號', 'douyin'],
  ['抖音', 'douyin'],
  ['threads', 'threads'],
  ['LinkedIn', 'linkedin'],
  ['', null],
  ['TikTok', null],
];

for (const [raw, expected] of cases) {
  assert.equal(normalizeAccountPlatform(raw), expected, raw);
}

assert.equal(accountPlatformLabel('IG'), 'IG Page');
assert.equal(accountPlatformLabel('WeChat視頻號'), '微信視頻號');
assert.equal(accountPlatformLabel('抖音號'), '抖音');
assert.equal(accountPlatformLabel('facebook'), 'Facebook Page');
assert.deepEqual([...PLATFORM_KEYS], [
  'youtube',
  'instagram',
  'facebook',
  'xiaohongshu',
  'wechat_channels',
  'douyin',
  'threads',
  'linkedin',
]);

console.log('vchannel-account-platform tests passed');
