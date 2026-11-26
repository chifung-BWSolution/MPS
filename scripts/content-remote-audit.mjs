#!/usr/bin/env node
/**
 * 內容自動化 · 遠端部署前置稽核（唯讀）
 *
 * 用 Supabase Management API（需要 SUPABASE_ACCESS_TOKEN）在不拿到 DB 密碼的情況下：
 *   1. 比對「本地 migration 檔案」與「遠端 supabase_migrations.schema_migrations」
 *   2. 確認 content_* 物件目前是否存在（避免重複套用）
 *   3. 檢查 cron / bucket / seo_keywords 新欄狀態
 *   4. 列出最近備份時間（P0-04）
 *
 * 用法：$env:SUPABASE_ACCESS_TOKEN='sbp_...'; node scripts/content-remote-audit.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

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
const URL_BASE = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || '';
const REF =
  process.env.SUPABASE_PROJECT_REF ||
  (URL_BASE.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] ||
  '';

if (!TOKEN || !REF) {
  console.error('缺少 SUPABASE_ACCESS_TOKEN 或無法判斷 project ref。');
  process.exit(1);
}

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
  if (!res.ok) throw new Error(`HTTP ${res.status} ${pathname}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const query = (sql) =>
  api(`/projects/${REF}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: sql }),
  });

function localMigrations() {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => {
      const match = /^(\d+)_(.+)\.sql$/.exec(file);
      return match ? { version: match[1], name: match[2], file } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.version.localeCompare(b.version));
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

console.log(`\n內容自動化 · 遠端部署前置稽核\n============================\n專案：${REF}`);

const remoteRows = await query(
  'select version, name from supabase_migrations.schema_migrations order by version',
);
const remote = new Map((remoteRows ?? []).map((row) => [String(row.version), row]));
const locals = localMigrations();
const pending = locals.filter((item) => !remote.has(item.version));
const remoteOnly = (remoteRows ?? []).filter(
  (row) => !locals.some((item) => item.version === String(row.version)),
);

console.log(`\n本地 migration：${locals.length} 支／遠端 history：${remote.size} 筆`);
console.log(`待推送（本地有、遠端沒有）：${pending.length} 支`);
for (const item of pending) console.log(`  · ${item.version}_${item.name}`);
if (remoteOnly.length > 0) {
  console.log(`\n⚠️ 遠端有、本地沒有（環境漂移，需人工確認）：${remoteOnly.length} 筆`);
  for (const row of remoteOnly.slice(0, 20)) console.log(`  · ${row.version} ${row.name ?? ''}`);
}

const [contentTables] = await query(
  "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'content\\_%'",
);
const [settingsTable] = await query(
  "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name='content_settings'",
);
const [keywordCols] = await query(
  "select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='seo_keywords' and column_name in ('intent','priority','cluster','pipeline_status','last_used_at')",
);
const [bucket] = await query("select count(*)::int as n from storage.buckets where id='content-assets'");
const cronJobs = await query(
  "select jobname, schedule from cron.job where jobname like 'content-%' order by jobname",
);
const [seoKeywordRows] = await query('select count(*)::int as n from public.seo_keywords');

console.log('\n目前線上物件狀態：');
console.log(`  content_* 表：${contentTables?.n ?? '?'} 張（預期部署前 0、部署後 21）`);
console.log(`  content_settings 表：${settingsTable?.n ?? '?'}（預期 0 → 1）`);
console.log(`  seo_keywords 新欄：${keywordCols?.n ?? '?'}／5（預期 0 → 5）`);
console.log(`  content-assets bucket：${bucket?.n ?? '?'}（預期 0 → 1）`);
console.log(`  content-* cron：${(cronJobs ?? []).length} 支（預期 0）`);
console.log(`  seo_keywords 既有資料列：${seoKeywordRows?.n ?? '?'}（只會加欄，不動資料）`);

try {
  const backups = await api(`/projects/${REF}/database/backups`);
  const latest = backups?.backups?.[0];
  console.log(`\n最近備份：${fmtDateTime(latest?.inserted_at)}（${latest?.status ?? '—'}）`);
} catch (error) {
  console.log(`\n最近備份：無法讀取（${error instanceof Error ? error.message : error}）`);
}

const EXPECTED = [
  '20261126090000',
  '20261126091000',
  '20261126092000',
  '20261126093000',
  '20261126100000',
  '20261126110000',
  '20261126120000',
  '20261126130000',
  '20261126140000',
  '20261127092000',
  '20261127100000',
  '20261127110000',
];
const pendingVersions = pending.map((item) => item.version);
const expectedApplied = EXPECTED.filter((version) => remote.has(version));
const expectedMissing = EXPECTED.filter((version) => !remote.has(version));
const exactlyExpected =
  pendingVersions.length === EXPECTED.length &&
  EXPECTED.every((version) => pendingVersions.includes(version));

console.log('\n本次 content migration：');
console.log(
  `  已套用 ${expectedApplied.length}／${EXPECTED.length}${expectedApplied.length ? `（${expectedApplied.join(', ')}）` : ''}`,
);
if (expectedMissing.length > 0) console.log(`  尚未套用：${expectedMissing.join(', ')}`);

// 角色解析抽查：確認 production 的 users.role_tag 經 resolveInternalRole 後，
// 站點管理權限落在正確的人身上（先前 bug：後端查詢選了不存在的欄位 → 全部變 staff）。
try {
  const { resolveInternalRole, can } = await import('../src/lib/contentPermissions.ts');
  const users = await query(
    "select u.id, u.role_tag, u.email, s.display_name from public.users u left join public.staffs s on s.id=u.staff_id order by u.role_tag",
  );
  const roleGroups = new Map();
  const manageSitesHolders = [];
  for (const user of users ?? []) {
    const role = resolveInternalRole(user.role_tag, null);
    roleGroups.set(role, (roleGroups.get(role) ?? 0) + 1);
    if (can({ role }, 'manage_sites')) {
      manageSitesHolders.push(user.display_name || user.email || user.id);
    }
  }

  console.log('\n角色解析抽查（users.role_tag → 內部角色 → manage_sites）：');
  for (const [role, count] of [...roleGroups.entries()].sort()) {
    console.log(`  ${role}: ${count} 人（manage_sites=${can({ role }, 'manage_sites')}）`);
  }
  console.log(`  可管理站點：${manageSitesHolders.length} 人${manageSitesHolders.length ? `（${manageSitesHolders.slice(0, 8).join('、')}${manageSitesHolders.length > 8 ? '…' : ''}）` : ''}`);
} catch (error) {
  console.log(`\n角色解析抽查失敗：${error instanceof Error ? error.message : error}`);
}

console.log('\n結論：');
if (exactlyExpected) {
  console.log('  ✅ 待推送正好是本次 6 支 content migration，可繼續部署。');
} else if (expectedMissing.length === 0) {
  console.log('  ✅ 本次 6 支已全部套用。');
  if (pending.length > 0) {
    console.log(`  ℹ️ 另有 ${pending.length} 支其他工作線的 pending migration（與 content 無關），未由本流程處理。`);
  }
} else if (pending.length === 0) {
  console.log('  沒有待推送 migration（可能已部署過）。');
} else {
  console.log('  ⚠️ 待推送含本次 6 支以外的 migration，請人工確認後再推。');
  console.log(`     待推送：${pendingVersions.join(', ')}`);
}
console.log('');
