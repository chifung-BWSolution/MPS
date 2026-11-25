#!/usr/bin/env node
/**
 * 內容自動化 · 只套用本次 6 支 migration（透過 Management API）
 *
 * 為什麼不用 `supabase db push`：
 *   本 repo 目前有 39 支「本地有、遠端沒有」的 pending migration（含其他工作線），
 *   而 `db push` 沒有「只推指定檔案」的選項，硬推會把不相關的 migration 一起上線。
 *   因此本腳本只讀取 content_automation_* / content_social / content_cron 這 6 支，
 *   逐支執行後寫入 supabase_migrations.schema_migrations，讓日後 `db push` 正確跳過。
 *
 * 安全設計：
 *   - 逐支套用；失敗即停，並回報是哪一支（前面的已套用且已記錄）
 *   - migration 全部是「只做加法 + if not exists」，可安全重跑
 *   - 若遠端已有 content_* 表但 history 沒有記錄（半套狀態）→ 直接中止，不做任何事
 *
 * 用法：
 *   $env:SUPABASE_ACCESS_TOKEN='sbp_...'
 *   node scripts/content-apply-migrations.mjs            # 套用
 *   node scripts/content-apply-migrations.mjs --dry-run  # 只列會做什麼
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
  return env;
}

const fileEnv = loadEnv();
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const REF =
  process.env.SUPABASE_PROJECT_REF ||
  ((process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || '').match(
    /https:\/\/([a-z0-9]+)\.supabase\.co/,
  ) || [])[1] ||
  '';

if (!TOKEN || !REF) {
  console.error('缺少 SUPABASE_ACCESS_TOKEN 或 project ref。');
  process.exit(1);
}

const MIGRATIONS = [
  { version: '20261126090000', name: 'content_automation_core', file: '20261126090000_content_automation_core.sql' },
  { version: '20261126091000', name: 'content_automation_pipeline', file: '20261126091000_content_automation_pipeline.sql' },
  { version: '20261126092000', name: 'content_automation_publish', file: '20261126092000_content_automation_publish.sql' },
  { version: '20261126093000', name: 'content_automation_rls', file: '20261126093000_content_automation_rls.sql' },
  { version: '20261126100000', name: 'content_social', file: '20261126100000_content_social.sql' },
  { version: '20261126110000', name: 'content_cron', file: '20261126110000_content_cron.sql' },
  { version: '20261126120000', name: 'content_social_autopilot', file: '20261126120000_content_social_autopilot.sql' },
  { version: '20261126130000', name: 'content_social_llm', file: '20261126130000_content_social_llm.sql' },
];

async function api(pathname, init = {}) {
  const res = await fetch(`https://api.supabase.com/v1${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return text ? JSON.parse(text) : null;
}

const query = (sql) =>
  api(`/projects/${REF}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: sql }),
  });

function localSql(item) {
  return readFileSync(path.join(ROOT, 'supabase', 'migrations', item.file), 'utf8');
}

console.log(`\n內容自動化 · 套用 content migration${DRY_RUN ? '（DRY RUN，不會寫入）' : ''}\n專案：${REF}\n`);

// ---- 前置檢查 -------------------------------------------------
const historyRows = await query(
  "select version from supabase_migrations.schema_migrations where version like '20261126%' order by version",
);
const applied = new Set((historyRows ?? []).map((row) => String(row.version)));
const pending = MIGRATIONS.filter((item) => !applied.has(item.version));

if (pending.length === 0) {
  console.log('6 支 migration 都已在遠端 history 中，無需套用。');
  process.exit(0);
}

const [contentTables] = await query(
  "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'content\\_%'",
);
const existingTables = Number(contentTables?.n ?? 0);

if (existingTables > 0 && applied.size === 0) {
  console.error(
    `中止：遠端已有 ${existingTables} 張 content_* 表，但 migration history 沒有任何記錄（可能是先前半套或手動建立）。`,
  );
  console.error('請先人工確認狀態；本腳本不會在不明狀態下繼續寫入。');
  process.exit(1);
}

console.log(`已套用：${[...applied].join(', ') || '（無）'}`);
console.log(`待套用：${pending.length} 支`);
for (const item of pending) console.log(`  · ${item.version}_${item.name}`);

if (DRY_RUN) {
  console.log('\nDRY RUN 結束（未寫入任何東西）。');
  process.exit(0);
}

// ---- 逐支套用 -------------------------------------------------
for (const item of pending) {
  const sql = localSql(item);
  process.stdout.write(`\n→ ${item.version}_${item.name} … `);
  try {
    await query(sql);
    await query(
      `insert into supabase_migrations.schema_migrations (version, name) values ('${item.version}', '${item.name}') on conflict (version) do nothing;`,
    );
    console.log('OK（已套用並寫入 history）');
  } catch (error) {
    console.log('FAILED');
    console.error(`\n✗ ${item.file} 執行失敗：`);
    console.error(String(error instanceof Error ? error.message : error).slice(0, 2000));
    console.error('\n前面的 migration 已套用且已記錄；修正後可重新執行本腳本（已套用的會自動跳過）。');
    process.exit(1);
  }
}

// ---- 後置檢查 -------------------------------------------------
const [tables] = await query(
  "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'content\\_%'",
);
const [settings] = await query('select count(*)::int as n, max(daily_article_limit)::int as lim from public.content_settings');
const [columns] = await query(
  "select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='seo_keywords' and column_name in ('intent','priority','cluster','pipeline_status','last_used_at')",
);
const [bucket] = await query("select public from storage.buckets where id='content-assets'");
const cron = await query("select jobname from cron.job where jobname like 'content-%' order by jobname");

console.log('\n後置檢查：');
console.log(`  content_* 表：${tables?.n}（預期 21）`);
console.log(`  content_settings：${settings?.n} 列，daily_article_limit=${settings?.lim}（預期 1 列、0）`);
console.log(`  seo_keywords 新欄：${columns?.n}／5`);
console.log(`  content-assets bucket private：${bucket?.public === false ? '是' : '否'}`);
console.log(`  cron：${(cron ?? []).length} 支 ${(cron ?? []).map((row) => row.jobname).join(', ')}`);

const ok =
  Number(tables?.n) === 21 &&
  Number(settings?.n) === 1 &&
  Number(settings?.lim) === 0 &&
  Number(columns?.n) === 5 &&
  bucket?.public === false &&
  (cron ?? []).length >= 5;

console.log(ok ? '\n✅ 全部符合預期。' : '\n⚠️ 有項目與預期不符，請看上方數字。');
process.exitCode = ok ? 0 : 1;
