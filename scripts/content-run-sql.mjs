#!/usr/bin/env node
/**
 * 內容自動化 · 遠端執行 SQL 檔（Management API，等價於 SQL Editor）
 *
 * 用途：套用可重複執行的 seed（例如 scripts/content-social-seed.sql），
 *       或在沒有 DB 密碼時做小幅資料修正。
 *
 * 用法：
 *   $env:SUPABASE_ACCESS_TOKEN='sbp_...'
 *   node scripts/content-run-sql.mjs scripts/content-social-seed.sql
 *   node scripts/content-run-sql.mjs scripts/content-social-seed.sql --dry-run
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const file = args.find((arg) => !arg.startsWith('--'));

if (!file) {
  console.error('用法：node scripts/content-run-sql.mjs <path-to-sql> [--dry-run]');
  process.exit(1);
}

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

const env = loadEnv();
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const REF =
  process.env.SUPABASE_PROJECT_REF ||
  ((process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || '').match(
    /https:\/\/([a-z0-9]+)\.supabase\.co/,
  ) || [])[1] ||
  '';

if (!TOKEN || !REF) {
  console.error('缺少 SUPABASE_ACCESS_TOKEN 或 project ref。');
  process.exit(1);
}

const sqlPath = path.resolve(ROOT, file);
const sql = readFileSync(sqlPath, 'utf8');

console.log(`\n執行 SQL：${path.relative(ROOT, sqlPath)}（${sql.split('\n').length} 行）`);
console.log(`專案：${REF}${DRY_RUN ? '（DRY RUN，不會寫入）' : ''}\n`);

if (DRY_RUN) {
  console.log(sql.slice(0, 1200));
  console.log('\nDRY RUN 結束。');
  process.exit(0);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`✗ HTTP ${res.status}`);
  console.error(text.slice(0, 2000));
  process.exit(1);
}

let payload = null;
try {
  payload = text ? JSON.parse(text) : null;
} catch {
  payload = text;
}

if (Array.isArray(payload) && payload.length > 0) {
  console.log(`✓ 完成（回傳 ${payload.length} 列）`);
  console.log(JSON.stringify(payload.slice(0, 5), null, 2));
} else {
  console.log('✓ 完成');
}
