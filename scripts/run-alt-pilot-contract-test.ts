/**
 * ALT Pilot · Edge Function 契約測試（本地 mock，不連網、不碰 DB）
 *
 * 覆蓋：
 *   - fetchPageHtml：正常 HTML、host allowlist、redirect 到非白名單、過大頁面
 *   - fetchImageBytes：PNG、SVG 拒絕、private IP 拒絕
 *   - generateVision：Gemini 成功、Gemini 429 → Grok fallback、
 *     Grok 429 → DeepSeek fallback、無 key
 *
 * 執行：node scripts/run-alt-pilot-contract-test.ts
 */

import assert from 'node:assert/strict';
import {
  AltFetchError,
  fetchImageBytes,
  fetchPageHtml,
  fetchSitemapText,
} from '../supabase/functions/alt-pilot/guard.ts';
import { AltProviderError, generateVision } from '../supabase/functions/alt-pilot/providers.ts';

const realFetch = globalThis.fetch;
const hadDeno = Object.prototype.hasOwnProperty.call(globalThis, 'Deno');
const realDeno = (globalThis as unknown as { Deno?: unknown }).Deno;

function installEnv(values: Record<string, string>): void {
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: {
      get: (name: string) => values[name],
    },
    resolveDns: async () => ['93.184.216.34'],
  };
}

function installFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = handler as typeof fetch;
}

function htmlResponse(html: string, init: ResponseInit = {}): Response {
  return new Response(html, {
    status: 200,
    ...init,
    headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers || {}) },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    assert.fail(`expected ${code}, but resolved`);
  } catch (error) {
    assert.equal((error as { code?: string }).code, code);
  }
}

try {
  // -------------------------------------------------------------------------
  // 1) 正常頁面
  // -------------------------------------------------------------------------
  installEnv({});
  installFetch(async (url) => {
    assert.equal(url, 'https://example.com/page');
    return htmlResponse('<!doctype html><html lang="zh-HK"><head><title>Test</title></head><body><h1>Hello</h1><p>Body text</p><img src="/a.jpg" alt="A"></body></html>');
  });

  const page = await fetchPageHtml('https://example.com/page', ['example.com']);
  assert.equal(page.finalUrl, 'https://example.com/page');
  assert.match(page.html, /<h1>Hello<\/h1>/);

  // -------------------------------------------------------------------------
  // 2) 非白名單 host
  // -------------------------------------------------------------------------
  await expectCode(
    () => fetchPageHtml('https://evil.example/page', ['example.com']),
    'host_not_allowed',
  );

  // -------------------------------------------------------------------------
  // 3) redirect 到非白名單
  // -------------------------------------------------------------------------
  installFetch(async () =>
    new Response(null, { status: 302, headers: { location: 'https://evil.example/page' } }),
  );
  await expectCode(
    () => fetchPageHtml('https://example.com/page', ['example.com']),
    'host_not_allowed',
  );

  // -------------------------------------------------------------------------
  // 4) 頁面過大
  // -------------------------------------------------------------------------
  installFetch(async () =>
    htmlResponse('x', { headers: { 'content-length': '3000000' } }),
  );
  await expectCode(
    () => fetchPageHtml('https://example.com/page', ['example.com']),
    'page_too_large',
  );

  // -------------------------------------------------------------------------
  // 4b) Sitemap 抓取
  // -------------------------------------------------------------------------
  installFetch(async () =>
    new Response(
      '<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url></urlset>',
      { status: 200, headers: { 'content-type': 'application/xml' } },
    ),
  );
  const sitemap = await fetchSitemapText('https://example.com/sitemap.xml', ['example.com']);
  assert.match(sitemap.xml, /<loc>https:\/\/example\.com\/a<\/loc>/);
  assert.equal(sitemap.finalUrl, 'https://example.com/sitemap.xml');

  await expectCode(
    () => fetchSitemapText('https://evil.example/sitemap.xml', ['example.com']),
    'host_not_allowed',
  );

  // -------------------------------------------------------------------------
  // 5) 圖片下載
  // -------------------------------------------------------------------------
  installEnv({});
  installFetch(async () =>
    new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }),
  );
  const image = await fetchImageBytes('https://cdn.example.com/a.png');
  assert.equal(image.mimeType, 'image/png');
  assert.equal(image.bytes.length, 4);
  assert.equal(image.hash.length, 64);

  // -------------------------------------------------------------------------
  // 6) SVG 拒絕
  // -------------------------------------------------------------------------
  installFetch(async () =>
    new Response('<svg></svg>', {
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
    }),
  );
  await expectCode(
    () => fetchImageBytes('https://cdn.example.com/a.svg'),
    'image_unsupported',
  );

  // -------------------------------------------------------------------------
  // 7) private IP 拒絕
  // -------------------------------------------------------------------------
  await expectCode(
    () => fetchImageBytes('http://127.0.0.1/a.png'),
    'host_not_allowed',
  );

  // -------------------------------------------------------------------------
  // 8) Gemini 429 → Grok fallback
  // -------------------------------------------------------------------------
  installEnv({
    GEMINI_API_KEY: 'gemini-test-key',
    XAI_API_KEY: 'xai-test-key',
    GEMINI_MODEL: 'gemini-test-model',
    GROK_MODEL: 'grok-test-model',
  });

  const seen: string[] = [];
  installFetch(async (url) => {
    seen.push(url);
    if (url.includes('generativelanguage')) {
      return jsonResponse({ error: 'rate limited' }, 429);
    }
    if (url.includes('api.x.ai')) {
      return jsonResponse({
        choices: [{ message: { content: '{"alt":"from grok"}' } }],
        usage: { prompt_tokens: 120, completion_tokens: 30 },
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  });

  const fallback = await generateVision({
    system: 'system',
    user: 'user',
    mimeType: 'image/png',
    base64: 'AA==',
    model: 'gemini-2.5-flash',
    fallbackModel: 'grok-4.5',
  });
  assert.equal(fallback.provider, 'grok');
  assert.equal(fallback.model, 'grok-test-model');
  assert.equal(fallback.text, '{"alt":"from grok"}');
  assert.equal(fallback.tokensIn, 120);
  assert.equal(fallback.tokensOut, 30);
  assert.equal(seen.length, 2);

  // -------------------------------------------------------------------------
  // 9) Gemini 成功
  // -------------------------------------------------------------------------
  installEnv({
    GEMINI_API_KEY: 'gemini-test-key',
    GEMINI_MODEL: 'gemini-test-model',
  });
  installFetch(async () =>
    jsonResponse({
      candidates: [{ content: { parts: [{ text: '{"alt":"from gemini"}' }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
    }),
  );

  const gemini = await generateVision({
    system: 'system',
    user: 'user',
    mimeType: 'image/png',
    base64: 'AA==',
    model: 'gemini-2.5-flash',
    fallbackModel: 'grok-4.5',
  });
  assert.equal(gemini.provider, 'gemini');
  assert.equal(gemini.model, 'gemini-test-model');
  assert.equal(gemini.text, '{"alt":"from gemini"}');
  assert.equal(gemini.tokensIn, 100);
  assert.equal(gemini.tokensOut, 20);
  assert.ok(gemini.costUsd > 0);

  // -------------------------------------------------------------------------
  // 9b) Grok 主：model=grok-4.5，不應先打 Gemini
  // -------------------------------------------------------------------------
  installEnv({
    GEMINI_API_KEY: 'gemini-test-key',
    XAI_API_KEY: 'xai-test-key',
    GEMINI_MODEL: 'gemini-test-model',
    GROK_MODEL: 'grok-test-model',
  });

  const grokSeen: string[] = [];
  installFetch(async (url) => {
    grokSeen.push(url);
    if (url.includes('api.x.ai')) {
      return jsonResponse({
        choices: [{ message: { content: '{"alt":"grok primary"}' } }],
        usage: { prompt_tokens: 80, completion_tokens: 20 },
      });
    }
    throw new Error(`Gemini should not be called first: ${url}`);
  });

  const grokPrimary = await generateVision({
    system: 'system',
    user: 'user',
    mimeType: 'image/png',
    base64: 'AA==',
    model: 'grok-4.5',
    fallbackModel: 'gemini-2.5-flash',
  });
  assert.equal(grokPrimary.provider, 'grok');
  assert.equal(grokPrimary.model, 'grok-test-model');
  assert.equal(grokPrimary.text, '{"alt":"grok primary"}');
  assert.equal(grokSeen.length, 1);
  assert.match(grokSeen[0], /api\.x\.ai/);

  // -------------------------------------------------------------------------
  // 9c) Grok 429 → Gemini 備援
  // -------------------------------------------------------------------------
  const fallbackSeen: string[] = [];
  installFetch(async (url) => {
    fallbackSeen.push(url);
    if (url.includes('api.x.ai')) {
      return jsonResponse({ error: 'grok rate limited' }, 429);
    }
    if (url.includes('generativelanguage')) {
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: '{"alt":"gemini fallback"}' }] } }],
        usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 10 },
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  });

  const grokFallback = await generateVision({
    system: 'system',
    user: 'user',
    mimeType: 'image/png',
    base64: 'AA==',
    model: 'grok-4.5',
    fallbackModel: 'gemini-2.5-flash',
  });
  assert.equal(grokFallback.provider, 'gemini');
  assert.equal(grokFallback.text, '{"alt":"gemini fallback"}');
  assert.equal(fallbackSeen.length, 2);

  // -------------------------------------------------------------------------
  // 9d) Grok 429 → DeepSeek V4.1 Flash 1017 備援
  // -------------------------------------------------------------------------
  installEnv({
    XAI_API_KEY: 'xai-test-key',
    GROK_MODEL: 'grok-test-model',
    OPENCODE_GO_API_KEY: 'opencode-test-key',
    OPENCODE_GO_MODEL: 'deepseek-v4.1-flash',
  });

  const deepseekSeen: Array<{ url: string; init?: RequestInit }> = [];
  installFetch(async (url, init) => {
    deepseekSeen.push({ url, init });
    if (url.includes('api.x.ai')) {
      return jsonResponse({ error: 'grok rate limited' }, 429);
    }
    if (url.includes('opencode.ai/inference/go/v1/chat/completions')) {
      return jsonResponse({
        choices: [{ message: { content: '{"alt":"deepseek fallback"}' } }],
        usage: {
          prompt_tokens: 210,
          completion_tokens: 40,
          opencode: { list_cost: 0.0000555 },
        },
      });
    }
    throw new Error(`unexpected URL: ${url}`);
  });

  const deepseekFallback = await generateVision({
    system: 'system',
    user: 'user',
    mimeType: 'image/png',
    base64: 'AA==',
    model: 'grok-4.7',
    fallbackModel: 'deepseek-v4.1-flash',
  });
  assert.equal(deepseekFallback.provider, 'deepseek');
  assert.equal(deepseekFallback.model, 'deepseek-v4.1-flash');
  assert.equal(deepseekFallback.text, '{"alt":"deepseek fallback"}');
  assert.equal(deepseekFallback.tokensIn, 210);
  assert.equal(deepseekFallback.tokensOut, 40);
  assert.equal(deepseekFallback.costUsd, 0.0000555);
  assert.equal(deepseekSeen.length, 2);
  const deepseekInit = deepseekSeen[1].init;
  assert.match(deepseekSeen[1].url, /opencode\.ai\/inference\/go\/v1\/chat\/completions/);
  const headers = deepseekInit?.headers as Record<string, string>;
  assert.equal(headers['x-opencode-session']?.length, 36);
  const body = JSON.parse(String(deepseekInit?.body)) as {
    model: string;
    max_tokens: number;
    messages: Array<{ content: unknown }>;
  };
  assert.equal(body.model, 'deepseek-v4.1-flash');
  assert.equal(body.max_tokens, 2000);
  assert.match(JSON.stringify(body.messages), /image_url/);

  // -------------------------------------------------------------------------
  // 10) 無 key
  // -------------------------------------------------------------------------
  installEnv({});
  await expectCode(
    () =>
      generateVision({
        system: 'system',
        user: 'user',
        mimeType: 'image/png',
        base64: 'AA==',
        model: 'gemini-2.5-flash',
        fallbackModel: 'grok-4.5',
      }),
    'provider_not_configured',
  );

  console.log('alt pilot contract tests passed');
} finally {
  globalThis.fetch = realFetch;
  if (hadDeno) {
    (globalThis as unknown as { Deno: unknown }).Deno = realDeno;
  } else {
    delete (globalThis as unknown as { Deno?: unknown }).Deno;
  }
}
