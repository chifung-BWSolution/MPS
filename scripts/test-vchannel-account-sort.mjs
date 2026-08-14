import assert from 'node:assert/strict';
import { sortVchannelAccounts } from '../src/lib/vchannelAccountSort.ts';

function account(partial) {
  return {
    id: partial.id,
    vchannelCodes: partial.vchannelCodes,
    accountLabel: partial.accountLabel ?? '',
    platform: partial.platform ?? 'facebook',
    accountId: partial.accountId,
    loginMethod: partial.loginMethod,
    feedhiveManaged: partial.feedhiveManaged ?? false,
  };
}

const rows = [
  account({ id: '1', vchannelCodes: ['V12', 'V14'], accountLabel: 'Franco梵高管理新思維', platform: 'douyin', accountId: 'cfb_m04', loginMethod: 'cfb.m04@chifung.net', feedhiveManaged: false }),
  account({ id: '2', vchannelCodes: ['V01'], accountLabel: 'BW Branding Design', platform: 'facebook', accountId: 'bw_designcentre', loginMethod: 'feedhive統一管理', feedhiveManaged: true }),
  account({ id: '3', vchannelCodes: ['V13'], accountLabel: 'Project Connect 設計工程報價易', platform: 'instagram', accountId: '', loginMethod: '', feedhiveManaged: false }),
  account({ id: '4', vchannelCodes: ['V02'], accountLabel: 'ACI Events', platform: 'wechat_channels', accountId: 'login: franco.think', loginMethod: 'QR', feedhiveManaged: true }),
  account({ id: '5', vchannelCodes: ['V12'], accountLabel: 'BW Wine Official', platform: 'facebook', accountId: 'bw_wine', loginMethod: 'a@example.com', feedhiveManaged: false }),
];

const byVchannelAsc = sortVchannelAccounts(rows, 'vchannel', 'asc').map(r => r.id);
assert.deepEqual(byVchannelAsc, ['2', '4', '5', '1', '3'], 'default Vchannel asc: V01, V02, V12, V12/V14, V13');

const byVchannelDesc = sortVchannelAccounts(rows, 'vchannel', 'desc').map(r => r.id);
assert.deepEqual(byVchannelDesc, ['3', '1', '5', '4', '2'], 'Vchannel desc reverses the default order');

const byNameAsc = sortVchannelAccounts(rows, 'name', 'asc').map(r => r.accountLabel);
assert.deepEqual(byNameAsc, [
  'ACI Events',
  'BW Branding Design',
  'BW Wine Official',
  'Franco梵高管理新思維',
  'Project Connect 設計工程報價易',
], 'name asc is alphabetical');

const byPlatformAsc = sortVchannelAccounts(rows, 'platform', 'asc').map(r => r.platform);
assert.deepEqual(
  byPlatformAsc,
  ['douyin', 'wechat_channels', 'facebook', 'facebook', 'instagram'],
  'platform sorts by display labels (抖音, 微信視頻號, Facebook Page, IG Page)',
);

const byFeedhiveAsc = sortVchannelAccounts(rows, 'feedhive', 'asc').map(r => r.feedhiveManaged);
assert.deepEqual(byFeedhiveAsc, [false, false, false, true, true], 'FeedHive asc puts unmanaged first');

const byFeedhiveDesc = sortVchannelAccounts(rows, 'feedhive', 'desc').map(r => r.feedhiveManaged);
assert.deepEqual(byFeedhiveDesc, [true, true, false, false, false], 'FeedHive desc puts managed first');

const facebookTieBreak = sortVchannelAccounts(
  rows.filter(r => r.platform === 'facebook'),
  'platform',
  'asc',
).map(r => r.id);
assert.deepEqual(facebookTieBreak, ['2', '5'], 'same platform ties break by Vchannel (V01 before V12)');

console.log('vchannel account sort tests passed');
