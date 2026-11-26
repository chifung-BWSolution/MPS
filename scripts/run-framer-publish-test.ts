import assert from 'node:assert/strict';
import {
  buildFramerPublishProgram,
  formatFramerPublishNote,
  readFramerPublishPayload,
  shouldPublishAfterSync,
} from '../src/lib/framerPublish.ts';

assert.equal(shouldPublishAfterSync(true, undefined), true);
assert.equal(shouldPublishAfterSync(null, undefined), false);
assert.equal(shouldPublishAfterSync(undefined, undefined), false);
assert.equal(shouldPublishAfterSync(false, undefined), false);
assert.equal(shouldPublishAfterSync(true, false), false);
assert.equal(shouldPublishAfterSync(false, true), true);

assert.equal(formatFramerPublishNote({ ok: true, skipped: true }), null);
assert.equal(formatFramerPublishNote({ ok: true, target: 'production', url: 'https://example.com' }), '已 Publish 到正式站 https://example.com');
assert.equal(formatFramerPublishNote({ ok: true, target: 'staging' }), '已 Publish 到Staging');
assert.equal(formatFramerPublishNote({ ok: false, error: '沒有權限' }), 'Publish 失敗：沒有權限');

const program = buildFramerPublishProgram();
assert.match(program, /api\.publishing\.publish\(\)/);
assert.match(program, /api\.publishing\.status\(\)/);
assert.doesNotMatch(program, /deployToProduction/);

assert.deepEqual(readFramerPublishPayload({ ok: true, target: 'staging', versionId: 'v1', url: 'https://staging.example' }), {
  ok: true,
  target: 'staging',
  url: 'https://staging.example',
  version_id: 'v1',
});
assert.equal(readFramerPublishPayload({ ok: false, error: '被阻擋' }).error, '被阻擋');
assert.equal(readFramerPublishPayload({}).ok, false);

console.log('framer publish checks passed');
