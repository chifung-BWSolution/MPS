import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { accountListMetrics, accountPlatformOptions, filterVchannelAccounts } from '../src/lib/vchannelAccountList.ts';
import { filterVideoLoginMethods, loginMethodListMetrics } from '../src/lib/videoLoginMethodList.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const videoModuleSrc = readFileSync(path.join(root, 'src/components/video/VideoModule.tsx'), 'utf8');
const channelsSrc = readFileSync(path.join(root, 'src/components/video/VideoChannelsList.tsx'), 'utf8');
const accountsSrc = readFileSync(path.join(root, 'src/components/video/VideoAccountsList.tsx'), 'utf8');
const loginSrc = readFileSync(path.join(root, 'src/components/video/VideoLoginMethodsModule.tsx'), 'utf8');

function account(partial) {
  return {
    id: partial.id,
    vchannelCodes: partial.vchannelCodes ?? [],
    accountLabel: partial.accountLabel ?? '',
    platform: partial.platform ?? 'facebook',
    accountId: partial.accountId,
    loginMethod: partial.loginMethod,
    loginMethodIds: partial.loginMethodIds ?? [],
    linkedLoginMethods: partial.linkedLoginMethods ?? [],
    feedhiveManaged: partial.feedhiveManaged ?? false,
    isActive: partial.isActive ?? true,
  };
}

function method(partial) {
  return {
    id: partial.id,
    loginMethod: partial.loginMethod ?? 'google',
    displayName: partial.displayName ?? '',
    accountName: partial.accountName ?? '',
    phoneNumber: partial.phoneNumber ?? '',
    email: partial.email ?? '',
    password: partial.password ?? '',
    twoFaMethods: partial.twoFaMethods ?? [],
    note: partial.note ?? '',
    isActive: partial.isActive ?? true,
  };
}

assert.match(videoModuleSrc, /resolvedTab === 'channels'/);
assert.match(videoModuleSrc, /resolvedTab === 'accounts'/);
assert.match(videoModuleSrc, /resolvedTab === 'login-methods'/);

for (const [name, src, title] of [
  ['channels', channelsSrc, '頻道設定'],
  ['accounts', accountsSrc, '平台帳號'],
  ['login-methods', loginSrc, '登入方式'],
]) {
  assert.ok(src.includes(`<h1 className="text-[32px] font-bold tracking-tight">${title}</h1>`), `${name} has page title`);
  assert.ok(src.includes('sticky top-[48px]'), `${name} uses sticky title header`);
  assert.ok(src.includes('shadow-card px-4 py-3'), `${name} has metrics cards`);
  assert.ok(src.includes('placeholder="搜尋'), `${name} has search bar`);
  assert.ok(src.includes('全部'), `${name} has filter dropdowns`);
}

const rows = [
  account({ id: '1', vchannelCodes: ['V12', 'V14'], accountLabel: 'Franco', platform: 'douyin', accountId: 'cfb_m04', isActive: true }),
  account({ id: '2', vchannelCodes: ['V01'], accountLabel: 'BW Branding', platform: 'facebook', accountId: 'bw_design', isActive: false }),
  account({ id: '3', vchannelCodes: ['V12'], accountLabel: 'BW Wine', platform: 'facebook', accountId: 'bw_wine', isActive: true }),
];

assert.deepEqual(accountListMetrics(rows), { total: 3, active: 2, channels: 3 });
assert.deepEqual(accountPlatformOptions(rows), [
  ['douyin', '抖音'],
  ['facebook', 'Facebook Page'],
]);
assert.deepEqual(filterVchannelAccounts(rows, { searchQuery: 'v12' }).map(r => r.id), ['1', '3']);
assert.deepEqual(filterVchannelAccounts(rows, { platformFilter: 'facebook' }).map(r => r.id), ['2', '3']);
assert.deepEqual(filterVchannelAccounts(rows, { statusFilter: 'inactive' }).map(r => r.id), ['2']);
assert.deepEqual(filterVchannelAccounts(rows, { searchQuery: 'wine', platformFilter: 'facebook', statusFilter: 'active' }).map(r => r.id), ['3']);

const methods = [
  method({ id: 'a', displayName: 'Google 主帳', loginMethod: 'google', email: 'a@example.com', twoFaMethods: ['authenticator'], isActive: true }),
  method({ id: 'b', displayName: '微信備援', loginMethod: 'wechat_scan', phoneNumber: '+852 9000', twoFaMethods: ['na'], isActive: false }),
  method({ id: 'c', displayName: '電郵登入', loginMethod: 'email_password', email: 'ops@example.com', twoFaMethods: [], isActive: true }),
];

assert.deepEqual(loginMethodListMetrics(methods), { total: 3, active: 2, twoFa: 1 });
assert.deepEqual(filterVideoLoginMethods(methods, { search: 'example' }).map(r => r.id), ['a', 'c']);
assert.deepEqual(filterVideoLoginMethods(methods, { methodFilter: 'google' }).map(r => r.id), ['a']);
assert.deepEqual(filterVideoLoginMethods(methods, { statusFilter: 'inactive' }).map(r => r.id), ['b']);
assert.deepEqual(filterVideoLoginMethods(methods, { search: '微信', methodFilter: 'wechat_scan', statusFilter: 'inactive' }).map(r => r.id), ['b']);

console.log('All vchannel list toolbar checks passed.');
