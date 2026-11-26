#!/usr/bin/env node
/**
 * Adapter 契約測試（M5-03）
 *
 * 用注入的 fetchImpl 驗證 manual / next_custom 的行為與錯誤映射；
 * 不需要網路、不需要 Deno、不需要站點。
 *
 * 用法：node scripts/content-adapter-contract.mjs
 */

import assert from 'node:assert/strict';
import {
  AdapterError,
  beauty100Adapter,
  getContentAdapter,
  listAdapters,
  manualAdapter,
  nextCustomAdapter,
} from '../supabase/functions/_shared/contentAdapters/index.ts';
import {
  beauty100ArticleUrl,
  parseBeauty100Credential,
} from '../src/lib/contentBeauty100.ts';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

const site = {
  id: 's1',
  name: 'BWA',
  domain: 'https://example.com',
  publishMode: 'manual',
  timezone: 'Asia/Hong_Kong',
};

const article = {
  title: '標題',
  slug: 'slug',
  excerpt: '摘要',
  bodyHtml: '<p>內容</p>',
  bodyMd: '內容',
  canonical: 'https://example.com/slug',
  metaDescription: '描述',
};

console.log('\nAdapter 契約測試\n================');

test('registry：未知 adapter 回落 manual', () => {
  assert.equal(getContentAdapter('nope').name, 'manual');
  assert.equal(getContentAdapter('next_custom').name, 'next_custom');
  assert.ok(listAdapters().length >= 2);
});

test('manual：只支援 manual 模式', () => {
  assert.equal(manualAdapter.supports('manual'), true);
  assert.equal(manualAdapter.supports('direct'), false);
  assert.equal(nextCustomAdapter.supports('direct'), true);
  assert.equal(nextCustomAdapter.supports('manual'), false);
});

await testAsync('manual：createArticle 不會假裝成功', async () => {
  const result = await manualAdapter.createArticle({ site, credentials: { secret: null }, article });
  assert.equal(result.ok, false);
  assert.equal(result.externalId, null);
  assert.match(String(result.raw && result.raw.reason), /manual/);
});

await testAsync('manual：testConnection 用 HEAD 判斷可達', async () => {
  const fetchImpl = async () => new Response(null, { status: 200 });
  const result = await manualAdapter.testConnection({ site, credentials: { secret: null }, fetchImpl });
  assert.equal(result.ok, true);
  assert.ok(result.checks.some((check) => check.id === 'domain' && check.ok));
});

await testAsync('next_custom：201 → externalId + liveUrl', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ id: 'ext-1', url: 'https://example.com/live', status: 'published' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  const result = await nextCustomAdapter.createArticle({
    site,
    credentials: { secret: 'token' },
    article,
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.externalId, 'ext-1');
  assert.equal(result.liveUrl, 'https://example.com/live');
  assert.equal(result.httpStatus, 201);
});

await testAsync('next_custom：401 轉成可讀 AdapterError', async () => {
  const fetchImpl = async () => new Response('nope', { status: 401 });
  await assert.rejects(
    () =>
      nextCustomAdapter.createArticle({
        site,
        credentials: { secret: 'token' },
        article,
        fetchImpl,
      }),
    (error) => {
      assert.ok(error instanceof AdapterError);
      assert.equal(error.httpStatus, 401);
      assert.match(error.message, /授權/);
      return true;
    },
  );
});

await testAsync('next_custom：沒有 token 直接拒絕（不打網路）', async () => {
  await assert.rejects(
    () =>
      nextCustomAdapter.createArticle({
        site,
        credentials: { secret: null },
        article,
        fetchImpl: async () => {
          throw new Error('不應呼叫');
        },
      }),
    (error) => error instanceof AdapterError && error.code === 'missing_credential',
  );
});

await testAsync('next_custom：testConnection 沒 token → ok=false', async () => {
  const result = await nextCustomAdapter.testConnection({
    site,
    credentials: { secret: null },
    fetchImpl: async () => new Response(null, { status: 200 }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.checks.some((check) => check.id === 'credential' && !check.ok));
});

await testAsync('next_custom：health 404 不阻擋（端點未提供）', async () => {
  const fetchImpl = async () => new Response('', { status: 404 });
  const result = await nextCustomAdapter.testConnection({
    site,
    credentials: { secret: 'token' },
    fetchImpl,
  });
  assert.ok(result.checks.some((check) => check.id === 'endpoint'));
});

// ============================================================
// Beauty100（不是走 /api/content/*，而是站方 Supabase REST）
// ============================================================

const beautySite = {
  ...site,
  id: 'b100',
  name: 'Beauty100',
  domain: 'https://www.beauty100-magazine.com',
  publishMode: 'direct',
  sectionExternalId: 'trending-topics',
};

const beautySecret = JSON.stringify({
  supabase_url: 'https://gkqctvtteafjprkudgsb.supabase.co',
  anon_key: 'sb_publishable_test_key_123456',
  email: 'mps-publisher@beauty100.test',
  password: 'secret123',
  bucket: 'uploads',
});

const beautyCover = {
  filename: 'cover.svg',
  contentType: 'image/svg+xml',
  bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  alt: '標題',
};

const beautyArticle = {
  ...article,
  canonical: 'https://www.beauty100-magazine.com/topics/slug',
  coverImage: beautyCover,
  author: 'Beauty100 編輯部',
  tags: ['美容', '護膚'],
  keyword: '美容',
  section: {
    id: 'sec-1',
    name: '焦點話題',
    slug: 'topics',
    externalId: 'trending-topics',
    contentType: 'article',
  },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function beautyFetch(rules = []) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const requestUrl = String(url);
    const method = String(init.method || 'GET').toUpperCase();
    calls.push({ url: requestUrl, method, body: init.body });

    for (const rule of rules) {
      if (rule.match(requestUrl, method, init)) {
        return rule.respond(requestUrl, method, init);
      }
    }

    if (requestUrl.includes('/auth/v1/token')) {
      return jsonResponse({ access_token: 'test-access-token', token_type: 'bearer' });
    }
    if (method === 'GET' && requestUrl.includes('/rest/v1/blog_articles?select=')) {
      return jsonResponse([]);
    }
    if (method === 'POST' && requestUrl.includes('/storage/v1/object/uploads/')) {
      return new Response(null, { status: 200 });
    }
    if (method === 'DELETE' && requestUrl.includes('/storage/v1/object/uploads/')) {
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && requestUrl.endsWith('/rest/v1/blog_articles')) {
      return jsonResponse([{ id: 'ext-1' }], 201);
    }
    if (method === 'DELETE' && requestUrl.includes('/rest/v1/blog_articles?id=eq.')) {
      return jsonResponse([{ id: 'ext-1' }]);
    }
    if (method === 'GET' && requestUrl.includes('/rest/v1/blog_articles?id=eq.')) {
      return jsonResponse([{ id: 'ext-1' }]);
    }
    if (method === 'HEAD' || method === 'GET') {
      return new Response(null, { status: 200 });
    }
    return new Response('unexpected request', { status: 500 });
  };
  return { calls, fetchImpl };
}

test('beauty100：registry 指向真 adapter，不是 next_custom', () => {
  assert.equal(getContentAdapter('beauty100').name, 'beauty100');
  assert.equal(getContentAdapter('beauty100'), beauty100Adapter);
  assert.notEqual(beauty100Adapter, nextCustomAdapter);
});

test('beauty100：只支援 direct，且要求封面', () => {
  assert.equal(beauty100Adapter.supports('direct'), true);
  assert.equal(beauty100Adapter.supports('draft'), false);
  assert.equal(beauty100Adapter.supports('manual'), false);
  assert.equal(beauty100Adapter.requiresCover, true);
});

test('beauty100：憑證 JSON 解析（合法／缺欄位／錯 URL）', () => {
  const ok = parseBeauty100Credential(beautySecret);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.config.supabaseUrl, 'https://gkqctvtteafjprkudgsb.supabase.co');
    assert.equal(ok.config.bucket, 'uploads');
  }

  const missing = parseBeauty100Credential(JSON.stringify({ email: 'a@b.com' }));
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.ok(missing.errors.some((error) => error.includes('supabase_url')));
  }

  const badUrl = parseBeauty100Credential(
    JSON.stringify({ ...JSON.parse(beautySecret), supabase_url: 'http://x.supabase.co/path' }),
  );
  assert.equal(badUrl.ok, false);
});

test('beauty100：分類 URL 映射（含 body-shaping fallback 與中文編碼）', () => {
  assert.equal(
    beauty100ArticleUrl('https://www.beauty100-magazine.com/', 'trending-topics', 'hello'),
    'https://www.beauty100-magazine.com/topics/hello',
  );
  assert.equal(
    beauty100ArticleUrl('www.beauty100-magazine.com', 'body-shaping', '中文-slug'),
    'https://www.beauty100-magazine.com/topics/%E4%B8%AD%E6%96%87-slug',
  );
  assert.equal(beauty100ArticleUrl(null, 'trending-topics', 'hello'), null);
});

await testAsync('beauty100：createArticle 正確登入、查重、上傳封面、寫入', async () => {
  const { calls, fetchImpl } = beautyFetch();
  const result = await beauty100Adapter.createArticle({
    site: beautySite,
    credentials: { secret: beautySecret },
    article: beautyArticle,
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.externalId, 'ext-1');
  assert.equal(result.liveUrl, 'https://www.beauty100-magazine.com/topics/slug');
  assert.equal(result.canonicalUrl, result.liveUrl);
  assert.equal(result.httpStatus, 201);

  const authCall = calls.find((call) => call.url.includes('/auth/v1/token'));
  assert.ok(authCall, '應先登入');
  assert.match(String(authCall.body), /mps-publisher@beauty100.test/);

  const insertCall = calls.find(
    (call) => call.method === 'POST' && call.url.endsWith('/rest/v1/blog_articles'),
  );
  assert.ok(insertCall, '應 INSERT blog_articles');
  const payload = JSON.parse(String(insertCall.body));
  assert.equal(payload.handle, 'slug');
  assert.equal(payload.category, 'trending-topics');
  assert.equal(payload.status, 'active');
  assert.equal(payload.intro, '<p>內容</p>');
  assert.equal(payload.author, 'Beauty100 編輯部');
  assert.deepEqual(payload.tags, ['美容', '護膚']);
  assert.match(payload.cover_image_url, /\/storage\/v1\/object\/public\/uploads\/mps\//);
  assert.equal(payload.is_celebrity, false);

  const coverCall = calls.find(
    (call) => call.method === 'POST' && call.url.includes('/storage/v1/object/uploads/mps/'),
  );
  assert.ok(coverCall, '應上傳封面');
});

await testAsync('beauty100：沒有封面直接拒絕（不打網路）', async () => {
  await assert.rejects(
    () =>
      beauty100Adapter.createArticle({
        site: beautySite,
        credentials: { secret: beautySecret },
        article: { ...beautyArticle, coverImage: null },
        fetchImpl: async () => {
          throw new Error('不應呼叫');
        },
      }),
    (error) => error instanceof AdapterError && error.code === 'missing_cover',
  );
});

await testAsync('beauty100：非法欄目 external_id → invalid_category（不打網路）', async () => {
  await assert.rejects(
    () =>
      beauty100Adapter.createArticle({
        site: beautySite,
        credentials: { secret: beautySecret },
        article: {
          ...beautyArticle,
          section: { ...beautyArticle.section, externalId: 'not-a-category' },
        },
        fetchImpl: async () => {
          throw new Error('不應呼叫');
        },
      }),
    (error) => error instanceof AdapterError && error.code === 'invalid_category',
  );
});

await testAsync('beauty100：slug 已存在且 title 不同 → slug_conflict，不覆蓋', async () => {
  const { calls, fetchImpl } = beautyFetch([
    {
      match: (url, method) => method === 'GET' && url.includes('/rest/v1/blog_articles?select='),
      respond: () =>
        jsonResponse([{ id: 'other', title: '別人的文章', handle: 'slug', status: 'active' }]),
    },
  ]);
  await assert.rejects(
    () =>
      beauty100Adapter.createArticle({
        site: beautySite,
        credentials: { secret: beautySecret },
        article: beautyArticle,
        fetchImpl,
      }),
    (error) => error instanceof AdapterError && error.code === 'slug_conflict',
  );
  assert.ok(!calls.some((call) => call.method === 'POST' && call.url.endsWith('/rest/v1/blog_articles')));
});

await testAsync('beauty100：slug 已存在且 title 相同 → adopt（重試冪等）', async () => {
  const { fetchImpl } = beautyFetch([
    {
      match: (url, method) => method === 'GET' && url.includes('/rest/v1/blog_articles?select='),
      respond: () =>
        jsonResponse([{ id: 'existing-1', title: '標題', handle: 'slug', status: 'active' }]),
    },
  ]);
  const result = await beauty100Adapter.createArticle({
    site: beautySite,
    credentials: { secret: beautySecret },
    article: beautyArticle,
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.externalId, 'existing-1');
  assert.equal(result.httpStatus, 200);
  assert.equal(result.raw.adopted, true);
});

await testAsync('beauty100：deleteArticle 回傳已刪除 row', async () => {
  const { calls, fetchImpl } = beautyFetch();
  const result = await beauty100Adapter.deleteArticle({
    site: beautySite,
    credentials: { secret: beautySecret },
    externalId: 'ext-1',
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.alreadyGone, false);
  assert.equal(result.httpStatus, 200);
  assert.ok(calls.some((call) => call.method === 'DELETE' && call.url.includes('id=eq.ext-1')));
});

await testAsync('beauty100：deleteArticle 對不存在的文章冪等成功', async () => {
  const { fetchImpl } = beautyFetch([
    {
      match: (url, method) => method === 'DELETE' && url.includes('id=eq.ext-1'),
      respond: () => new Response(null, { status: 204 }),
    },
    {
      match: (url, method) =>
        method === 'GET' && url.includes('/rest/v1/blog_articles?id=eq.ext-1&select=id'),
      respond: () => jsonResponse([]),
    },
  ]);
  const result = await beauty100Adapter.deleteArticle({
    site: beautySite,
    credentials: { secret: beautySecret },
    externalId: 'ext-1',
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.alreadyGone, true);
});

await testAsync('beauty100：verifyArticle 用 REST 驗證，不抓 HTML meta', async () => {
  const { calls, fetchImpl } = beautyFetch([
    {
      match: (url, method) => method === 'GET' && url.includes('/rest/v1/blog_articles?id=eq.ext-1&select='),
      respond: () =>
        jsonResponse([
          {
            id: 'ext-1',
            handle: 'slug',
            title: '標題',
            status: 'active',
            category: 'trending-topics',
            cover_image_url:
              'https://gkqctvtteafjprkudgsb.supabase.co/storage/v1/object/public/uploads/mps/cover.svg',
          },
        ]),
    },
  ]);
  const result = await beauty100Adapter.verifyArticle({
    site: beautySite,
    credentials: { secret: beautySecret },
    article: {
      externalId: 'ext-1',
      liveUrl: 'https://www.beauty100-magazine.com/topics/slug',
      slug: 'slug',
      title: '標題',
      sectionExternalId: 'trending-topics',
    },
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.ok(result.checks.some((check) => check.id === 'beauty100_row' && check.ok));
  assert.ok(result.checks.some((check) => check.id === 'beauty100_category' && check.ok));
  assert.ok(result.checks.some((check) => check.id === 'beauty100_live_url' && check.ok));
  assert.ok(!calls.some((call) => call.url.includes('/api/content/')));
});

await testAsync('beauty100：testConnection 驗證登入／表／分類／bucket', async () => {
  const { fetchImpl } = beautyFetch();
  const result = await beauty100Adapter.testConnection({
    site: beautySite,
    credentials: { secret: beautySecret },
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.checks.map((check) => check.id),
    ['config', 'auth', 'table', 'category', 'storage', 'storage_public', 'storage_cleanup'],
  );
  assert.ok(result.checks.every((check) => check.ok));
});

await testAsync('beauty100：testConnection 遇到非法分類 → ok=false', async () => {
  const { fetchImpl } = beautyFetch();
  const result = await beauty100Adapter.testConnection({
    site: { ...beautySite, sectionExternalId: 'not-a-category' },
    credentials: { secret: beautySecret },
    fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.ok(result.checks.some((check) => check.id === 'category' && !check.ok));
});

console.log(`\n合計 ${passed + failed} 項：${passed} 通過，${failed} 失敗\n`);
if (failed > 0) process.exitCode = 1;
