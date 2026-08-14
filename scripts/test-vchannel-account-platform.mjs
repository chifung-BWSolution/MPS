import assert from 'node:assert/strict';
import {
  CHANNEL_LIST_ACCOUNT_COLUMNS,
  PLATFORM_KEYS,
  accountLabelForPlatform,
  accountPlatformLabel,
  formatPlatformStatusNote,
  normalizeAccountPlatform,
} from '../src/lib/vchannelPlatformStatus.ts';
import { accountToDbRow, mapAccountRow } from '../src/lib/vchannelMappers.ts';

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

assert.equal(formatPlatformStatusNote({}), '');
assert.equal(formatPlatformStatusNote(null), '');

const note = formatPlatformStatusNote({
  youtube: { kind: 'unknown', raw_text: 'XXX' },
  instagram: { kind: 'opened', raw_text: '已有個人帳號' },
  facebook: { kind: 'url', url: 'https://facebook.com/example', raw_text: 'https://facebook.com/example' },
});
assert.match(note, /YouTube：未知 — XXX/);
assert.match(note, /IG Page：已開通 — 已有個人帳號/);
assert.match(note, /Facebook Page：URL — https:\/\/facebook.com\/example/);
assert.match(note, /Threads：—/);

const mapped = mapAccountRow({
  id: 'acc-1',
  vchannel_codes: ['V12'],
  account_label: '香港好設計',
  platform: 'IG',
  account_id: 'bw_designcentre',
  login_method: 'feedhive統一管理',
  feedhive_managed: true,
  notes: 'ok',
  created_at: '2026-08-14T00:00:00.000Z',
  updated_at: '2026-08-14T00:00:00.000Z',
});
assert.equal(mapped.platform, 'instagram');
assert.equal(mapped.accountId, 'bw_designcentre');
assert.equal('channelIntro' in mapped, false);
assert.equal('accountPassword' in mapped, false);
assert.equal('operatorCode' in mapped, false);
assert.equal('sortOrder' in mapped, false);

const dbRow = accountToDbRow({
  vchannelCodes: ['V12'],
  accountLabel: '香港好設計',
  platform: 'instagram',
  accountId: 'bw_designcentre',
  loginMethod: 'feedhive統一管理',
  feedhiveManaged: true,
  notes: 'ok',
});
assert.deepEqual(Object.keys(dbRow).sort(), [
  'account_id',
  'account_label',
  'feedhive_managed',
  'login_method',
  'notes',
  'platform',
  'updated_at',
  'vchannel_codes',
]);
assert.equal('channel_intro' in dbRow, false);
assert.equal('account_password' in dbRow, false);
assert.equal('operator_code' in dbRow, false);
assert.equal('sort_order' in dbRow, false);

console.log('vchannel-account-platform tests passed');
