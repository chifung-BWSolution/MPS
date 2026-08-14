import assert from 'node:assert/strict';
import {
  CHANNEL_LIST_ACCOUNT_COLUMNS,
  PLATFORM_KEYS,
  accountLabelForPlatform,
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

assert.deepEqual(
  CHANNEL_LIST_ACCOUNT_COLUMNS.map(col => [col.key, col.label]),
  [
    ['facebook', 'FB'],
    ['instagram', 'IG'],
    ['threads', 'Threads'],
    ['wechat_channels', '微信'],
    ['douyin', '抖音'],
    ['xiaohongshu', '小紅書'],
  ],
);

const sampleAccounts = [
  { platform: 'FB', accountLabel: 'Franco FB' },
  { platform: 'instagram', accountLabel: 'Franco IG' },
  { platform: 'threads', accountLabel: 'Franco Threads' },
  { platform: '微信視頻號', accountLabel: 'Franco 微信' },
  { platform: '抖音號', accountLabel: 'Franco 抖音' },
  { platform: '小紅書', accountLabel: 'Franco 小紅書' },
  { platform: 'facebook', accountLabel: 'Franco FB Ads' },
  { platform: 'youtube', accountLabel: 'Franco YT' },
  { platform: 'instagram', accountLabel: '  ' },
];

assert.equal(accountLabelForPlatform(sampleAccounts, 'facebook'), 'Franco FB / Franco FB Ads');
assert.equal(accountLabelForPlatform(sampleAccounts, 'instagram'), 'Franco IG');
assert.equal(accountLabelForPlatform(sampleAccounts, 'threads'), 'Franco Threads');
assert.equal(accountLabelForPlatform(sampleAccounts, 'wechat_channels'), 'Franco 微信');
assert.equal(accountLabelForPlatform(sampleAccounts, 'douyin'), 'Franco 抖音');
assert.equal(accountLabelForPlatform(sampleAccounts, 'xiaohongshu'), 'Franco 小紅書');
assert.equal(accountLabelForPlatform(sampleAccounts, 'youtube'), 'Franco YT');
assert.equal(accountLabelForPlatform(sampleAccounts, 'linkedin'), '');

console.log('vchannel-account-platform tests passed');
