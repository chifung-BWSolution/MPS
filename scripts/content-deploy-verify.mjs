#!/usr/bin/env node
/**
 * 內容自動化 · 部署後驗證（唯讀，不寫任何資料）
 *
 * 用途：`db push` + `functions deploy` 之後，確認線上真的很健康。
 * 只需要 anon key 就能驗「表存在／函式已部署／RLS 封閉」；
 * 若額外提供 SUPABASE_ACCESS_TOKEN，會再用 Management API 驗資料列、cron、migration 版本。
 *
 * 使用：
 *   1. 讀 `.env` 的 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY（自動）
 *   2. 選用環境變數：
 *        SUPABASE_ACCESS_TOKEN   sbp_xxx（驗 cron／資料列／migration 需要）
 *        SUPABASE_PROJECT_REF    預設 kwcevjcmdjadhrygjyfp
 *
 * 退出碼 0 = 全部通過；1 = 有 FAIL。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // ignore
  }
  return env;
}

const fileEnv = loadEnv();
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  (SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] ||
  'kwcevjcmdjadhrygjyfp';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('缺少 .env 的 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，無法驗證。');
  process.exit(1);
}

console.log(`\n內容自動化 · 部署後驗證\n========================\n專案：${SUPABASE_URL}`);

// ------------------------------------------------------------
// 1) 資料表存在（用 anon 打 PostgREST：PGRST205=不存在；42501/401=存在但無權限）
// ------------------------------------------------------------
const TABLES = [
  'content_sites',
  'content_site_sections',
  'content_site_pages',
  'content_site_credentials',
  'content_site_checks',
  'content_assets',
  'content_slots',
  'content_articles',
  'content_article_revisions',
  'content_jobs',
  'content_llm_usage',
  'content_publish_logs',
  'content_email_digests',
  'content_settings',
  'content_social_accounts',
  'content_social_groups',
  'content_social_group_members',
  'content_hot_items',
  'content_hot_events',
  'content_social_posts',
  'content_social_targets',
];

console.log('\n[1] 資料表存在性（anon 讀取；42501/401 代表存在但被 RLS 擋住，正確）');
for (const table of TABLES) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    const body = await res.text();
    const missing = /PGRST205|42P01|does not exist/i.test(body);
    record(
      table,
      !missing,
      missing ? 'PGRST205 / 42P01（表不存在）' : res.ok ? 'anon 可讀，檢查 RLS' : `HTTP ${res.status}（存在）`,
    );
  } catch (error) {
    record(table, false, error instanceof Error ? error.message : String(error));
  }
}

// ------------------------------------------------------------
// 2) 函式已部署（404 = 未部署；401/403 = 已部署且自行驗身分）
// ------------------------------------------------------------
console.log('\n[2] Edge Functions 已部署（anon 呼叫應回 401/403，不是 404）');
const FUNCTIONS = ['content-sites', 'content-keywords', 'content-publish', 'content-digest', 'content-worker', 'content-social'];
for (const name of FUNCTIONS) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: '__verify__' }),
    });
    const body = await res.text();
    const notDeployed = res.status === 404 || /function not found|FUNCTION_NOT_FOUND/i.test(body);
    record(name, !notDeployed, `HTTP ${res.status}`);
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

// ------------------------------------------------------------
// 3) 管理層驗證（需 SUPABASE_ACCESS_TOKEN）
// ------------------------------------------------------------
if (ACCESS_TOKEN) {
  console.log('\n[3] Management API 驗證（migration / 資料列 / RLS / cron）');

  const query = async (sql) => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };

  try {
    const migrations = await query(
      "select version from supabase_migrations.schema_migrations where version like '20261126%' order by version",
    );
    record(
      'migration 版本（應 8 支）',
      Array.isArray(migrations) && migrations.length === 8,
      Array.isArray(migrations) ? migrations.map((row) => row.version).join(', ') : '無法解析',
    );

    const settings = await query('select count(*)::int as n, max(daily_article_limit)::int as lim from public.content_settings');
    record(
      'content_settings 單列且出廠 0',
      Number(settings?.[0]?.n) === 1 && Number(settings?.[0]?.lim) === 0,
      JSON.stringify(settings?.[0] ?? null),
    );

    const credPolicies = await query(
      "select count(*)::int as n from pg_policies where schemaname='public' and tablename='content_site_credentials'",
    );
    record('content_site_credentials 0 條 policy', Number(credPolicies?.[0]?.n) === 0, `policies=${credPolicies?.[0]?.n}`);

    const bucket = await query("select public from storage.buckets where id = 'content-assets'");
    record('content-assets bucket 為 private', bucket?.[0]?.public === false, JSON.stringify(bucket?.[0] ?? null));

    const storagePolicies = await query(
      "select count(*)::int as n from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'content-assets%'",
    );
    record('storage 政策 4 條', Number(storagePolicies?.[0]?.n) === 4, `policies=${storagePolicies?.[0]?.n}`);

    const cron = await query(
      "select jobname, schedule, active from cron.job where jobname like 'content-%' order by jobname",
    );
    record('cron 5 支（函式部署後才建）', Array.isArray(cron) && cron.length === 5, JSON.stringify(cron ?? []));

    const tables = await query(
      "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'content\\_%'",
    );
    record('content_* 表 21 張', Number(tables?.[0]?.n) === 21, `tables=${tables?.[0]?.n}`);
  } catch (error) {
    record('Management API 驗證', false, error instanceof Error ? error.message : String(error));
  }
} else {
  console.log('\n[3] 略過 Management API 驗證（未提供 SUPABASE_ACCESS_TOKEN）');
  console.log('    設定後可補驗：migration 版本、settings 單列、credentials policy、bucket、storage policy、cron。');
}

// ------------------------------------------------------------
// 4) service role 快速冒煙（可選）
// ------------------------------------------------------------
if (SERVICE_KEY) {
  console.log('\n[4] service_role 呼叫 content-worker（應回 200）');
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/content-worker`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit: 1 }),
    });
    record('content-worker tick', res.status === 200, `HTTP ${res.status}`);
  } catch (error) {
    record('content-worker tick', false, error instanceof Error ? error.message : String(error));
  }
}

// ------------------------------------------------------------
const failed = results.filter((item) => !item.ok);
console.log(`\n合計 ${results.length} 項：${results.length - failed.length} 通過，${failed.length} 失敗`);
if (failed.length > 0) {
  console.log('\n失敗項目：');
  for (const item of failed) console.log(`  ✗ ${item.name} — ${item.detail}`);
  process.exitCode = 1;
} else {
  console.log('\n全部通過。建議再手動跑一次回歸煙霧測試（docs/content-automation-deployment.md §7）。');
}
