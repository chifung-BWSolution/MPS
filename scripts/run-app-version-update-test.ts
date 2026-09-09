import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VERSION_UPDATE_ACTION_LABEL,
  VERSION_UPDATE_MESSAGE,
  fetchRemoteAppVersion,
  getAppVersionUrl,
  isNewerAppVersion,
  parseAppVersionPayload,
} from '../src/lib/appVersion.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(VERSION_UPDATE_MESSAGE, '系統已推出新版本，請重新整理頁面。');
assert.equal(VERSION_UPDATE_ACTION_LABEL, '立即重新整理');

assert.equal(parseAppVersionPayload({ version: 'abc123' }), 'abc123');
assert.equal(parseAppVersionPayload({ version: '  abc123  ' }), 'abc123');
assert.equal(parseAppVersionPayload({ version: '' }), null);
assert.equal(parseAppVersionPayload({}), null);
assert.equal(parseAppVersionPayload(null), null);
assert.equal(parseAppVersionPayload('<!doctype html>'), null);

assert.equal(isNewerAppVersion('old', 'new'), true);
assert.equal(isNewerAppVersion('same', 'same'), false);
assert.equal(isNewerAppVersion('', 'new'), false);
assert.equal(isNewerAppVersion('old', ''), false);

assert.equal(getAppVersionUrl('/'), '/version.json');
assert.equal(getAppVersionUrl('/app/'), '/app/version.json');
assert.equal(getAppVersionUrl('/app'), '/app/version.json');

const fetched = await fetchRemoteAppVersion(async (input) => {
  assert.match(String(input), /\/version\.json\?t=/);
  return new Response(JSON.stringify({ version: 'build-9' }), { status: 200 });
});
assert.equal(fetched, 'build-9');
assert.equal(await fetchRemoteAppVersion(async () => new Response('nope', { status: 404 })), null);
assert.equal(await fetchRemoteAppVersion(async () => { throw new Error('offline'); }), null);

const app = read('src/App.tsx');
assert.match(app, /VersionUpdateBar/);

const bar = read('src/components/layout/VersionUpdateBar.tsx');
assert.match(bar, /VERSION_UPDATE_MESSAGE/);
assert.match(bar, /window\.location\.reload/);
assert.match(bar, /fixed top-0 left-0 right-0/);

const vite = read('vite.config.ts');
assert.match(vite, /appVersionPlugin/);
assert.match(vite, /version\.json/);
assert.match(vite, /__APP_VERSION__/);

console.log('app version update: ok');
