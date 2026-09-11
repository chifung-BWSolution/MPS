import assert from 'node:assert/strict';
import {
  canonicalizeDomainUrl,
  findWebsiteByCanonicalUrl,
} from '../src/lib/canonicalDomainUrl.ts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const domainMatchSrc = readFileSync(join(root, 'src/lib/domainMatch.ts'), 'utf8');
assert.match(domainMatchSrc, /canonicalizeDomainUrl/);

assert.equal(canonicalizeDomainUrl('http://www.x.com/'), 'x.com');
assert.equal(canonicalizeDomainUrl('https://X.com'), 'x.com');
assert.equal(canonicalizeDomainUrl('www.x.com/path?q=1'), 'x.com');
assert.equal(canonicalizeDomainUrl('x.com/'), 'x.com');
assert.equal(canonicalizeDomainUrl('https://www.x.com:443/home'), 'x.com');
assert.equal(canonicalizeDomainUrl('//www.x.com/'), 'x.com');
assert.equal(canonicalizeDomainUrl(''), '');
assert.equal(canonicalizeDomainUrl(null), '');
assert.equal(canonicalizeDomainUrl('shop.x.com'), 'shop.x.com');
assert.notEqual(canonicalizeDomainUrl('shop.x.com'), canonicalizeDomainUrl('x.com'));
assert.equal(canonicalizeDomainUrl('brandingworks.com.hk'), 'brandingworks.com.hk');

const profiles = [
  { id: 'ws1', websiteName: 'Keep', domainUrl: 'https://www.dup.com/' },
  { id: 'ws2', websiteName: 'Other', domainUrl: 'other.com' },
];
assert.equal(findWebsiteByCanonicalUrl(profiles, 'http://dup.com/')?.id, 'ws1');
assert.equal(findWebsiteByCanonicalUrl(profiles, 'dup.com', 'ws1'), null);
assert.equal(findWebsiteByCanonicalUrl(profiles, 'missing.com'), null);

console.log('canonical domain url: ok');
