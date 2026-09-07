import assert from 'node:assert/strict';
import { normalizePhonePassword } from '../src/lib/phonePassword.ts';

assert.equal(normalizePhonePassword('9123 4567'), '91234567');
assert.equal(normalizePhonePassword('+852 9123-4567'), '91234567');
assert.equal(normalizePhonePassword('85291234567'), '91234567');
assert.equal(normalizePhonePassword('+86 138 1234 5678'), '13812345678');
assert.equal(normalizePhonePassword('8613812345678'), '13812345678');
assert.equal(normalizePhonePassword('  12345  '), null);
assert.equal(normalizePhonePassword(''), null);
assert.equal(normalizePhonePassword(null), null);

console.log('phone password normalize: ok');
