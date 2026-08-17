import assert from 'node:assert/strict';
import { toExternalHref } from '../src/lib/externalUrl.ts';

assert.equal(
  toExternalHref('https://beauty100-magazine.com/'),
  'https://beauty100-magazine.com/',
);
assert.equal(
  toExternalHref('http://example.com'),
  'http://example.com',
);
assert.equal(
  toExternalHref('beauty100-magazine.com'),
  'https://beauty100-magazine.com',
);
assert.equal(
  toExternalHref('//beauty100-magazine.com/'),
  'https://beauty100-magazine.com/',
);
assert.equal(toExternalHref('  HTTPS://Example.COM/path  '), 'HTTPS://Example.COM/path');
assert.equal(toExternalHref(''), '#');
assert.equal(toExternalHref(null), '#');
assert.equal(toExternalHref(undefined), '#');

// The previous bug: prefixing https:// onto a stored absolute URL produced
// https://https://… which browsers normalize to https://https//…
assert.notEqual(
  toExternalHref('https://beauty100-magazine.com/'),
  'https://https://beauty100-magazine.com/',
);

console.log('toExternalHref tests passed');
