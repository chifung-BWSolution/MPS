import assert from 'node:assert/strict';
import {
  DEFAULT_TEST_TO,
  RESEND_PLACEHOLDER_API_KEY,
  buildHelloWorldEmail,
  isResendApiKeyConfigured,
  normalizeAddresses,
  resolveFromAddress,
} from '../src/lib/resend.ts';

assert.equal(isResendApiKeyConfigured(''), false);
assert.equal(isResendApiKeyConfigured(RESEND_PLACEHOLDER_API_KEY), false);
assert.equal(isResendApiKeyConfigured('re_live_abc'), true);

assert.deepEqual(normalizeAddresses('  a@b.c  '), ['a@b.c']);
assert.deepEqual(normalizeAddresses(['a@b.c', ' ', 'd@e.f']), ['a@b.c', 'd@e.f']);
assert.deepEqual(normalizeAddresses(undefined), []);

assert.equal(resolveFromAddress(''), 'MPS <onboarding@resend.dev>');
assert.equal(resolveFromAddress('MPS <noreply@example.com>'), 'MPS <noreply@example.com>');

const email = buildHelloWorldEmail(DEFAULT_TEST_TO, new Date('2026-09-14T04:00:00.000Z'));
assert.equal(email.from, 'onboarding@resend.dev');
assert.equal(email.to, DEFAULT_TEST_TO);
assert.equal(email.subject, 'Hello World');
assert.match(String(email.html), /first email/);
assert.equal(email.idempotencyKey, `hello-world/${DEFAULT_TEST_TO}/2026-09-14T04`);

console.log('All Resend helper checks passed.');
