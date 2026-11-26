#!/usr/bin/env node
/**
 * Beauty100 純函式回歸測試（不連網、不寫 DB）
 *
 * 為什麼獨立一支：
 *   content-selftest.mjs 同時包含社媒等其他工作線的測試；
 *   這支只覆蓋 Beauty100 自動發佈的純邏輯，方便 CI／部署前單獨跑。
 *
 * 用法：node scripts/beauty100-selftest.mjs
 */

import assert from 'node:assert/strict';
import {
  beauty100ArticleUrl,
  beauty100CategoryForSection,
  parseBeauty100Credential,
} from '../src/lib/contentBeauty100.ts';
import {
  canTransition,
  isApprovedForPublish,
  publishStage,
} from '../src/lib/contentState.ts';
import { beauty100Adapter } from '../supabase/functions/_shared/contentAdapters/index.ts';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log('\nBeauty100 純函式回歸測試\n========================');

test('憑證 JSON：合法與預設 bucket', () => {
  const parsed = parseBeauty100Credential(
    JSON.stringify({
      supabase_url: 'https://gkqctvtteafjprkudgsb.supabase.co/',
      anon_key: 'sb_publishable_test_key_123456',
      email: 'mps@beauty100.test',
      password: 'secret123',
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.config.supabaseUrl, 'https://gkqctvtteafjprkudgsb.supabase.co');
    assert.equal(parsed.config.bucket, 'uploads');
  }
});

test('憑證 JSON：缺欄位與錯 URL 會回 errors', () => {
  const missing = parseBeauty100Credential('{}');
  assert.equal(missing.ok, false);
  const badUrl = parseBeauty100Credential(
    JSON.stringify({
      supabase_url: 'http://x.supabase.co/path',
      anon_key: '1234567890',
      email: 'a@b.com',
      password: 'secret1',
    }),
  );
  assert.equal(badUrl.ok, false);
});

test('分類：topics 視為 trending-topics，非法值回落預設', () => {
  assert.equal(beauty100CategoryForSection({ external_id: 'topics' }), 'trending-topics');
  assert.equal(beauty100CategoryForSection({ external_id: 'facial-care' }), 'facial-care');
  assert.equal(beauty100CategoryForSection({ external_id: 'not-a-category' }), 'trending-topics');
});

test('文章網址：分類路徑、body-shaping fallback、中文 handle 編碼', () => {
  assert.equal(
    beauty100ArticleUrl('https://www.beauty100-magazine.com/', 'trending-topics', 'hello'),
    'https://www.beauty100-magazine.com/topics/hello',
  );
  assert.equal(
    beauty100ArticleUrl('https://www.beauty100-magazine.com', 'body-shaping', 'abc'),
    'https://www.beauty100-magazine.com/topics/abc',
  );
  assert.equal(
    beauty100ArticleUrl('https://www.beauty100-magazine.com', 'facial-care', '中文'),
    'https://www.beauty100-magazine.com/facial-care/%E4%B8%AD%E6%96%87',
  );
  assert.equal(beauty100ArticleUrl(null, 'trending-topics', 'hello'), null);
});

test('狀態機：scheduled 不可直跳 published；publishing 才可以', () => {
  assert.equal(canTransition('article', 'scheduled', 'published'), false);
  assert.equal(canTransition('article', 'scheduled', 'publishing'), true);
  assert.equal(canTransition('article', 'publishing', 'published'), true);
});

test('批准閘門：必須有 reviewer_id 與 approved_at', () => {
  assert.equal(isApprovedForPublish({ reviewer_id: null, approved_at: null }), false);
  assert.equal(isApprovedForPublish({ reviewer_id: 'u1', approved_at: null }), false);
  assert.equal(isApprovedForPublish({ reviewer_id: 'u1', approved_at: '2026-01-01T00:00:00Z' }), true);
});

test('發佈狀態：排隊／發佈中／成功／驗證中／失敗／已下架', () => {
  const queued = publishStage({
    status: 'scheduled',
    deleted_at: null,
    checks: {},
    scheduled_publish_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  assert.equal(queued.stage, 'queued');

  const publishing = publishStage({
    status: 'publishing',
    deleted_at: null,
    checks: {},
    scheduled_publish_at: null,
  });
  assert.equal(publishing.stage, 'publishing');

  const published = publishStage({
    status: 'published',
    deleted_at: null,
    checks: { verify: { ok: true, httpStatus: 200, checkedAt: '', items: [] } },
    scheduled_publish_at: null,
  });
  assert.equal(published.stage, 'published');

  const pending = publishStage({
    status: 'published',
    deleted_at: null,
    checks: {},
    scheduled_publish_at: null,
  });
  assert.equal(pending.stage, 'verify_pending');

  const failed = publishStage({
    status: 'publish_failed',
    deleted_at: null,
    checks: {},
    scheduled_publish_at: null,
  });
  assert.equal(failed.stage, 'failed');

  const deleted = publishStage({
    status: 'cancelled',
    deleted_at: new Date().toISOString(),
    checks: {},
    scheduled_publish_at: null,
  });
  assert.equal(deleted.stage, 'deleted');
});

test('adapter 契約：beauty100 只支援 direct，且要求封面', () => {
  assert.equal(beauty100Adapter.name, 'beauty100');
  assert.equal(beauty100Adapter.supports('direct'), true);
  assert.equal(beauty100Adapter.supports('draft'), false);
  assert.equal(beauty100Adapter.requiresCover, true);
});

console.log(`\n合計 ${passed + failed} 項：${passed} 通過，${failed} 失敗\n`);
if (failed > 0) process.exitCode = 1;
