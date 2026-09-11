import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const modal = read('src/components/website/WebsiteFormModal.tsx');
assert.match(modal, /canonicalizeDomainUrl/);
assert.match(modal, /findWebsiteByCanonicalUrl/);
assert.match(modal, /請輸入網域，不要加 http:\/\/、www\. 或結尾 \//);
assert.match(modal, /placeholder=\{form\.profileType === 'system' \? 'app\.example\.com' : 'example\.com'\}/);
assert.match(modal, /此網域已存在於網站列表/);
assert.match(modal, /buildWebsiteDetailHref/);
assert.doesNotMatch(modal, /www\.example\.com/);

const hook = read('src/hooks/useWebsiteProfiles.ts');
assert.match(hook, /canonicalizeDomainUrl/);
assert.match(hook, /toStoredDomainUrl/);

const list = read('src/components/website/WebsiteModule.tsx');
assert.match(list, /findWebsiteByCanonicalUrl/);
assert.match(list, /pendingCreateDomain\.normalizedDomain/);
assert.match(list, /連結現有網站/);
assert.doesNotMatch(list, /sampleUrl \|\| `https:\/\/\$\{pendingCreateDomain\.normalizedDomain\}`/);

console.log('website form domain: ok');
