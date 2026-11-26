#!/usr/bin/env node
/**
 * Beauty100 真實環境 smoke test（會寫入 Beauty100，預設不會自動跑）
 *
 * 用途：部署後用專用 staff 帳號走一次「登入 → 建文章 → 驗證 → 刪文」，
 * 確認 adapter 契約與站方 Supabase 的實際行為一致。
 *
 * 憑證來源（優先順序）：
 *   1. 環境變數 BEAUTY100_SUPABASE_URL／BEAUTY100_ANON_KEY／BEAUTY100_EMAIL／BEAUTY100_PASSWORD
 *   2. 專案根目錄 .env.beauty100.local（已被 .gitignore 的 .env.* 覆蓋）
 *
 * 用法：
 *   node scripts/beauty100-smoke.mjs --test-connection
 *   node scripts/beauty100-smoke.mjs --full --cleanup
 *
 * 安全：
 *   - 不印出密碼／token／anon key。
 *   - 測試文章 handle 固定用 mps-smoke-*，finally 會嘗試刪除。
 *   - 若站方已有同名 handle，會先失敗，不會覆蓋。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  beauty100Adapter,
} from '../supabase/functions/_shared/contentAdapters/beauty100.ts';
import {
  beauty100ArticleUrl,
} from '../src/lib/contentBeauty100.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.beauty100.local');
const DOMAIN = (process.env.BEAUTY100_SITE_DOMAIN || 'https://www.beauty100-magazine.com').trim();
const BUCKET = (process.env.BEAUTY100_BUCKET || 'uploads').trim();

function loadEnvFile() {
  try {
    const text = readFileSync(ENV_FILE, 'utf8');
    const env = {};
    for (const line of text.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (!match) continue;
      env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

const fileEnv = loadEnvFile();
const value = (key) => (process.env[key] || fileEnv[key] || '').trim();

const config = {
  supabase_url: value('BEAUTY100_SUPABASE_URL'),
  anon_key: value('BEAUTY100_ANON_KEY'),
  email: value('BEAUTY100_EMAIL'),
  password: value('BEAUTY100_PASSWORD'),
  bucket: BUCKET,
};

const args = new Set(process.argv.slice(2));
const runFull = args.has('--full');
const runConnectionOnly = args.has('--test-connection');
const cleanup = args.has('--cleanup') || runFull;

if (!runFull && !runConnectionOnly) {
  console.log('用法：node scripts/beauty100-smoke.mjs --test-connection | --full [--cleanup]');
  process.exit(1);
}

const missing = Object.entries(config)
  .filter(([key, val]) => key !== 'bucket' && !val)
  .map(([key]) => `BEAUTY100_${key.toUpperCase()}`);
if (missing.length > 0) {
  console.error(
    `缺少憑證欄位：${missing.join('、')}。請設定環境變數，或建立 ${path.basename(ENV_FILE)}（不要提交到 git）。`,
  );
  process.exit(1);
}

const site = {
  id: 'beauty100-smoke',
  name: 'Beauty100',
  domain: DOMAIN,
  publishMode: 'direct',
  timezone: 'Asia/Hong_Kong',
  sectionExternalId: 'trending-topics',
};

const section = {
  id: 'smoke-section',
  name: '焦點話題',
  slug: 'topics',
  externalId: 'trending-topics',
  contentType: 'article',
};

const secret = JSON.stringify(config);
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const slug = `mps-smoke-${stamp}`;
const title = `[MPS SMOKE] Beauty100 自動發佈測試 ${stamp}`;
const description =
  '這是 MPS 自動發佈 smoke test 建立的暫存文章；測試完成後會立即刪除，不應出現在正式內容。';

function svgCover(text) {
  const safe = String(text).replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#134e4a"/></linearGradient></defs>
  <rect width="1200" height="675" fill="url(#g)"/>
  <text x="72" y="320" fill="#ffffff" font-size="54" font-family="sans-serif">${safe}</text>
  <text x="72" y="390" fill="#ccfbf1" font-size="28" font-family="sans-serif">MPS smoke test — 會自動刪除</text>
</svg>`;
}

const article = {
  title,
  slug,
  excerpt: description,
  bodyHtml: `<p>${description}</p><h2>測試段落</h2><p>這篇文章由 MPS adapter 直接寫入 Beauty100 的 blog_articles；驗證完成後會 hard delete。</p>`,
  bodyMd: description,
  canonical: beauty100ArticleUrl(DOMAIN, 'trending-topics', slug) || '',
  metaTitle: title,
  metaDescription: description,
  coverImage: {
    filename: `smoke-${stamp}.svg`,
    contentType: 'image/svg+xml',
    bytes: new TextEncoder().encode(svgCover('MPS SMOKE')),
    alt: title,
  },
  author: 'Beauty100 編輯部',
  tags: ['MPS', 'smoke-test'],
  keyword: 'smoke',
  section,
};

let createdId = null;
let createdCover = null;
let failures = 0;

function pass(label, detail = '') {
  console.log(`  ✓ ${label}${detail ? `：${detail}` : ''}`);
}

function fail(label, error) {
  failures += 1;
  console.error(`  ✗ ${label}：${error instanceof Error ? error.message : String(error)}`);
}

console.log(`\nBeauty100 smoke（${DOMAIN}）\n${'='.repeat(52)}`);

try {
  const connection = await beauty100Adapter.testConnection({
    site,
    credentials: { secret },
  });
  for (const check of connection.checks) {
    if (check.ok) pass(check.label, check.detail);
    else fail(check.label, check.detail);
  }
  assert.equal(connection.ok, true, 'testConnection 未通過');

  if (runFull) {
    const published = await beauty100Adapter.createArticle({
      site,
      credentials: { secret },
      article,
    });
    assert.equal(published.ok, true, 'createArticle 未成功');
    assert.ok(published.externalId, 'createArticle 沒有回傳 externalId');
    assert.ok(published.liveUrl, 'createArticle 沒有回傳 liveUrl');
    createdId = published.externalId;
    createdCover = {
      bucket:
        typeof published.raw?.cover_bucket === 'string' ? published.raw.cover_bucket : null,
      path: typeof published.raw?.cover_path === 'string' ? published.raw.cover_path : null,
    };
    if (!createdCover.bucket || !createdCover.path) createdCover = null;
    pass('建立文章', `id=${published.externalId}`);
    pass('公開網址', published.liveUrl ?? '(無)');

    const verified = await beauty100Adapter.verifyArticle({
      site,
      credentials: { secret },
      article: {
        externalId: published.externalId,
        liveUrl: published.liveUrl,
        slug,
        title,
        metaTitle: title,
        metaDescription: description,
      },
    });
    for (const check of verified.checks) {
      if (check.ok) pass(check.label, check.detail);
      else fail(check.label, check.detail);
    }
    assert.equal(verified.ok, true, 'verifyArticle 未通過');
  }
} catch (error) {
  fail('smoke 執行', error);
} finally {
  if (createdId && cleanup) {
    try {
      const deleted = await beauty100Adapter.deleteArticle({
        site,
        credentials: { secret },
        externalId: createdId,
        slug,
        cover: createdCover,
      });
      assert.equal(deleted.ok, true);
      createdId = null;
      pass('清理測試文章', deleted.alreadyGone ? '已不存在（冪等）' : '已刪除');
    } catch (error) {
      fail('清理測試文章', `${error instanceof Error ? error.message : String(error)}（請到 Beauty100 後台手動刪除 ${slug}）`);
    }
  } else if (createdId) {
    console.warn(`  ! 未帶 --cleanup，測試文章仍存在：${slug}（id=${createdId}）`);
  }
}

console.log(`\n結果：${failures === 0 ? '全部通過' : `${failures} 項失敗`}\n`);
if (failures > 0) process.exitCode = 1;
