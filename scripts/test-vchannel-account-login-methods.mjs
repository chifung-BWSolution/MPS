import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  collectRelatedLoginMethods,
  otherAccountLinksForMethod,
  planBulkLoginMethodLinks,
  planLoginMethodAccountLinkPatches,
  sameIdSet,
} from '../src/lib/vchannelAccountLoginMethods.ts';
import {
  emptyLoginMethodForm,
  loginMethodFormFromItem,
  loginMethodFormToInput,
} from '../src/lib/videoLoginMethodForm.ts';

function method(partial) {
  return {
    id: partial.id,
    loginMethod: partial.loginMethod ?? 'email_password',
    displayName: partial.displayName ?? partial.id,
    accountName: partial.accountName ?? '',
    phoneNumber: '',
    email: partial.email ?? '',
    password: '',
    twoFaMethods: [],
    note: '',
    isActive: partial.isActive ?? true,
  };
}

assert.equal(sameIdSet(['a', 'b'], ['b', 'a']), true);
assert.equal(sameIdSet(['a'], ['a', 'b']), false);

const accounts = [
  { id: 'acc-yt', loginMethodIds: ['lm-google', 'lm-mail'] },
  { id: 'acc-fb', loginMethodIds: ['lm-mail'] },
  { id: 'acc-ig', loginMethodIds: [] },
];

const methods = [
  method({ id: 'lm-google', displayName: 'Google 主帳', loginMethod: 'google' }),
  method({ id: 'lm-mail', displayName: '公司電郵', loginMethod: 'email_password' }),
  method({ id: 'lm-phone', displayName: '備用電話', loginMethod: 'phone' }),
];

const related = collectRelatedLoginMethods(accounts, methods);
assert.deepEqual(
  new Set(related.map(row => row.method.id)),
  new Set(['lm-google', 'lm-mail']),
  'only join-table methods for these accounts are listed',
);
assert.deepEqual(
  related.find(row => row.method.id === 'lm-mail')?.accountIds,
  ['acc-yt', 'acc-fb'],
);
assert.equal(related.some(row => row.method.id === 'lm-phone'), false);

assert.deepEqual(
  planLoginMethodAccountLinkPatches(accounts, 'lm-phone', ['acc-fb', 'acc-ig']),
  [
    { accountId: 'acc-fb', loginMethodIds: ['lm-mail', 'lm-phone'] },
    { accountId: 'acc-ig', loginMethodIds: ['lm-phone'] },
  ],
  'create/edit links add the method to selected accounts only',
);

assert.deepEqual(
  planLoginMethodAccountLinkPatches(accounts, 'lm-mail', ['acc-yt']),
  [{ accountId: 'acc-fb', loginMethodIds: [] }],
  'deselecting an account unlinks only that account',
);

assert.deepEqual(
  planLoginMethodAccountLinkPatches(accounts, 'lm-mail', ['acc-yt', 'acc-fb']),
  [],
  'unchanged links produce no patches',
);

assert.deepEqual(
  planBulkLoginMethodLinks(accounts, ['lm-phone', 'lm-google'], ['acc-fb', 'acc-ig']),
  [
    { accountId: 'acc-fb', loginMethodIds: ['lm-mail', 'lm-phone', 'lm-google'] },
    { accountId: 'acc-ig', loginMethodIds: ['lm-phone', 'lm-google'] },
  ],
  'link-existing adds all selected methods to selected accounts',
);

assert.deepEqual(
  otherAccountLinksForMethod(
    [...accounts, { id: 'acc-other', loginMethodIds: ['lm-mail'] }],
    ['acc-yt', 'acc-fb', 'acc-ig'],
    'lm-mail',
  ),
  ['acc-other'],
);

const form = emptyLoginMethodForm();
assert.equal(loginMethodFormToInput(form), null);
assert.equal(loginMethodFormToInput({ ...form, loginMethod: 'google' }), null);
assert.deepEqual(
  loginMethodFormToInput({ ...form, loginMethod: 'google', displayName: '  主帳  ' }),
  {
    loginMethod: 'google',
    displayName: '主帳',
    accountName: '',
    phoneNumber: '',
    email: '',
    password: '',
    twoFaMethods: [],
    note: '',
    isActive: true,
  },
);

const fromItem = loginMethodFormFromItem(methods[0]);
assert.equal(fromItem.displayName, 'Google 主帳');
assert.equal(fromItem.loginMethod, 'google');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const channelsSrc = readFileSync(path.join(root, 'src/components/video/VideoChannelsList.tsx'), 'utf8');
const dialogSrc = readFileSync(path.join(root, 'src/components/video/VchannelAccountLoginMethodsDialog.tsx'), 'utf8');
const pickerSrc = readFileSync(path.join(root, 'src/components/video/VchannelLoginMethodPicker.tsx'), 'utf8');

assert.ok(channelsSrc.includes('VchannelAccountLoginMethodsDialog'), 'channels list mounts the login-methods dialog');
assert.ok(channelsSrc.includes('setLoginMethodsChannel(channel)'), 'key icon opens the login-methods dialog');
assert.ok(channelsSrc.includes('title="帳戶登入方式"'), 'key icon title is 帳戶登入方式');
assert.match(
  channelsSrc,
  /title="帳戶登入方式"><KeyRound/,
  'key icon is bound to 帳戶登入方式',
);
assert.doesNotMatch(
  channelsSrc,
  /title="新增帳號"><KeyRound/,
  'key icon no longer opens the account form',
);
assert.ok(dialogSrc.includes('title="帳戶登入方式"'), 'dialog title is 帳戶登入方式');
assert.ok(dialogSrc.includes('平台帳戶'), 'dialog lists related vchannel_accounts');
assert.ok(dialogSrc.includes('collectRelatedLoginMethods'), 'dialog lists related login methods via join ids');
assert.ok(dialogSrc.includes('planLoginMethodAccountLinkPatches'), 'create/edit writes join-table links');
assert.ok(dialogSrc.includes('deleteItem'), 'dialog can delete login methods');
assert.ok(dialogSrc.includes('addItem'), 'dialog can create login methods');
assert.ok(dialogSrc.includes('updateItem'), 'dialog can update login methods');
assert.ok(dialogSrc.includes('VchannelLoginMethodPicker'), 'dialog can link existing login methods');
assert.ok(dialogSrc.includes('items={items}'), 'dialog shares login-method records with the picker');
assert.ok(pickerSrc.includes('items: itemsProp'), 'picker can reuse parent login-method state');

console.log('All vchannel account login-method dialog checks passed.');
