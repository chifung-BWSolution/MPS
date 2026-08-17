import assert from 'node:assert/strict';
import { accountToForm, emptyAccountForm, formToAccountPayload } from '../src/lib/vchannelAccountForm.ts';
import { formatLinkedLoginMethods } from '../src/types/vchannel.ts';

assert.equal(emptyAccountForm.isActive, true);
assert.deepEqual(emptyAccountForm.loginMethodIds, []);

const payload = formToAccountPayload({
  ...emptyAccountForm,
  vchannelCodesRaw: 'V11 / v12',
  accountLabel: '香港好傢私',
  platform: 'facebook',
  accountId: 'cfb_m03',
  loginMethod: 'cfb.m03@chifung.net',
  loginMethodIds: ['lm-1', 'lm-1', 'lm-2'],
  feedhiveManaged: true,
  notes: 'line1\nline2',
  isActive: false,
});

assert.ok(payload);
assert.deepEqual(payload.vchannelCodes, ['V11', 'V12']);
assert.equal(payload.platform, 'facebook');
assert.equal(payload.loginMethod, 'cfb.m03@chifung.net');
assert.deepEqual(payload.loginMethodIds, ['lm-1', 'lm-2']);
assert.equal(payload.feedhiveManaged, true);
assert.equal(payload.notes, 'line1\nline2');
assert.equal(payload.isActive, false);

assert.equal(formToAccountPayload({ ...emptyAccountForm, accountLabel: 'x' }), null);

const form = accountToForm({
  id: 'acc-1',
  vchannelCodes: ['V11'],
  accountLabel: '香港好傢私',
  platform: 'facebook',
  accountId: 'cfb_m03',
  loginMethod: 'cfb.m03@chifung.net',
  loginMethodIds: ['lm-1'],
  linkedLoginMethods: [{ id: 'lm-1', displayName: 'CFB M03', loginMethod: 'email_password', isActive: true }],
  feedhiveManaged: true,
  notes: '已註冊新帳號',
  isActive: true,
});

assert.equal(form.vchannelCodesRaw, 'V11');
assert.deepEqual(form.loginMethodIds, ['lm-1']);
assert.equal(form.isActive, true);
assert.equal(form.loginMethod, 'cfb.m03@chifung.net');

assert.equal(
  formatLinkedLoginMethods({
    loginMethod: 'legacy',
    linkedLoginMethods: [{ id: 'lm-1', displayName: 'CFB M03', loginMethod: 'email_password', isActive: true }],
  }),
  'CFB M03',
);
assert.equal(formatLinkedLoginMethods({ loginMethod: 'legacy', linkedLoginMethods: [] }), 'legacy');

console.log('vchannel account form payload tests passed');
