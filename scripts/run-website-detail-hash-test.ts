import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWebsiteDetailHash,
  buildWebsiteDetailHref,
  openWebsiteDetail,
  readSelectedWebsiteId,
  SELECTED_WEBSITE_KEY,
} from '../src/lib/websiteNavigation';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const websiteSrc = readFileSync(join(root, 'src/components/website/WebsiteModule.tsx'), 'utf8');

assert.match(websiteSrc, /setWebsiteDetailHash\(listPage, site\.id\)/);
assert.match(websiteSrc, /readSelectedWebsiteId/);
assert.match(websiteSrc, /handleSelectSite/);

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  },
  configurable: true,
});
Object.defineProperty(globalThis, 'window', {
  value: {
    location: { pathname: '/app', search: '', hash: '' },
    history: { replaceState() {} },
  },
  configurable: true,
});

openWebsiteDetail('ws-1');
assert.equal(window.location.hash, '#website/list?id=ws-1');
assert.equal(readSelectedWebsiteId(), 'ws-1');
assert.equal(store.get(SELECTED_WEBSITE_KEY), 'ws-1');

assert.equal(buildWebsiteDetailHash('ws-1'), 'website/list?id=ws-1');
assert.equal(buildWebsiteDetailHash('ws-1', 'featured'), 'website/featured?id=ws-1');
assert.equal(buildWebsiteDetailHref('ws-1'), '/app#website/list?id=ws-1');
assert.equal(readSelectedWebsiteId('#website/list?id=from-hash'), 'from-hash');
assert.equal(readSelectedWebsiteId('#/website/list?id=slash-hash'), 'slash-hash');
assert.equal(readSelectedWebsiteId('#website/list/path-id'), 'path-id');

store.set(SELECTED_WEBSITE_KEY, 'session-only');
assert.equal(readSelectedWebsiteId('#website/list'), null);
assert.equal(readSelectedWebsiteId('#website/featured'), null);

console.log('website detail hash: ok');
