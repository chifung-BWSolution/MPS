import assert from 'node:assert/strict';
import { hasWebmastersScope, isGscOAuthMessage, maskRefreshToken } from '../src/lib/gscOAuth';

assert.equal(maskRefreshToken(''), '');
assert.equal(maskRefreshToken('short'), '••••');
assert.equal(maskRefreshToken('1234567890abcd'), '1234…abcd');
assert.equal(hasWebmastersScope('https://www.googleapis.com/auth/analytics.readonly'), false);
assert.equal(
  hasWebmastersScope('https://www.googleapis.com/auth/webmasters.readonly'),
  true,
);
assert.equal(isGscOAuthMessage({ type: 'mps-gsc-oauth', ok: true }), true);
assert.equal(isGscOAuthMessage({ type: 'other' }), false);

console.log('All GSC OAuth helper checks passed.');
