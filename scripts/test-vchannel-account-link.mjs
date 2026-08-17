import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  accountLinkFingerprint,
  accountMatchesPickerQuery,
  accountPickerLabel,
  addChannelCode,
  codesEqual,
  hasChannelCode,
  planAccountChannelLinkPatches,
  removeChannelCode,
} from '../src/lib/vchannelAccountLink.ts';

function account(partial) {
  return {
    id: partial.id,
    vchannelCodes: partial.vchannelCodes ?? [],
    accountLabel: partial.accountLabel ?? '',
    platform: partial.platform ?? 'facebook',
    accountId: partial.accountId,
    loginMethod: partial.loginMethod,
  };
}

assert.equal(hasChannelCode(['V01', 'v12'], 'v01'), true);
assert.equal(hasChannelCode(['V12'], 'V01'), false);
assert.deepEqual(addChannelCode(['V01'], 'v12'), ['V01', 'V12']);
assert.deepEqual(addChannelCode(['V01'], 'V01'), ['V01']);
assert.deepEqual(removeChannelCode(['V01', 'V12'], 'v01'), ['V12']);
assert.equal(codesEqual(['V12', 'V01'], ['v01', 'v12']), true);

const rows = [
  account({ id: 'a1', vchannelCodes: ['V01'], accountLabel: 'BW Wine', platform: 'facebook', accountId: 'bw_wine' }),
  account({ id: 'a2', vchannelCodes: ['V02'], accountLabel: 'ACI Events', platform: 'instagram' }),
  account({ id: 'a3', vchannelCodes: ['V01', 'V14'], accountLabel: 'Franco', platform: 'douyin' }),
];

assert.deepEqual(
  planAccountChannelLinkPatches({
    accounts: rows,
    selectedIds: ['a1', 'a2'],
    initialLinkedIds: ['a1', 'a3'],
    channelCode: 'V01',
  }),
  [
    { id: 'a2', vchannelCodes: ['V02', 'V01'] },
    { id: 'a3', vchannelCodes: ['V14'] },
  ],
  'selecting a2 adds V01; deselecting a3 removes only V01',
);

assert.deepEqual(
  planAccountChannelLinkPatches({
    accounts: rows,
    selectedIds: ['a1', 'a3'],
    initialLinkedIds: ['a1', 'a3'],
    channelCode: 'V09',
    previousChannelCode: 'V01',
  }),
  [
    { id: 'a1', vchannelCodes: ['V09'] },
    { id: 'a3', vchannelCodes: ['V14', 'V09'] },
  ],
  'renaming the channel code replaces V01 with V09 on remaining links',
);

assert.deepEqual(
  planAccountChannelLinkPatches({
    accounts: rows,
    selectedIds: ['a2'],
    initialLinkedIds: [],
    channelCode: 'V99',
  }),
  [{ id: 'a2', vchannelCodes: ['V02', 'V99'] }],
  'new channel only patches newly selected accounts',
);

assert.equal(accountPickerLabel(rows[0]), 'Facebook Page · BW Wine');
assert.equal(accountMatchesPickerQuery(rows[0], 'bw_wine'), true);
assert.equal(accountMatchesPickerQuery(rows[0], 'youtube'), false);
assert.equal(
  accountLinkFingerprint({ accountLabel: 'BW Wine', platform: 'facebook', accountId: 'bw_wine', vchannelCodes: ['V12', 'V01'] }),
  accountLinkFingerprint({ accountLabel: 'BW Wine', platform: 'facebook', accountId: 'bw_wine', vchannelCodes: ['V01', 'V12'] }),
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const channelsSrc = readFileSync(path.join(root, 'src/components/video/VideoChannelsList.tsx'), 'utf8');
const pickerSrc = readFileSync(path.join(root, 'src/components/video/ChannelAccountPicker.tsx'), 'utf8');
const accountModalSrc = readFileSync(path.join(root, 'src/components/video/VchannelAccountFormModal.tsx'), 'utf8');

const pickerIndex = channelsSrc.indexOf('<ChannelAccountPicker');
const matrixLabelIndex = channelsSrc.indexOf('平台狀態矩陣');
assert.ok(pickerSrc.includes('平台帳戶'), 'picker label is 平台帳戶');
assert.ok(pickerIndex > 0 && pickerIndex < matrixLabelIndex, '平台帳戶 picker is rendered before 平台狀態矩陣');
assert.ok(channelsSrc.includes('ChannelAccountPicker'), 'channels dialog uses ChannelAccountPicker');
assert.ok(channelsSrc.includes('planAccountChannelLinkPatches'), 'channel save syncs vchannel_codes via planner');
assert.ok(channelsSrc.includes('openAddAccountFromChannel'), 'channels dialog can open the accounts form');
assert.ok(channelsSrc.includes('vchannel_codes: patch.vchannelCodes'), 'relation writes only vchannel_codes');
assert.ok(pickerSrc.includes('搜尋名稱、平台、賬號 ID 或頻道編號'), 'picker supports quick search');
assert.ok(pickerSrc.includes('新增帳戶'), 'picker can trigger add-account');
assert.equal(
  accountModalSrc.includes('ChannelAccountPicker') || accountModalSrc.includes('平台帳戶'),
  false,
  'does not rewrite the vchannel_accounts dialog',
);

console.log('All vchannel account link checks passed.');
