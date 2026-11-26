#!/usr/bin/env node
/**
 * 社媒自動化營運 · SQL 安全審查（PRD §13.1、執行清單「SQL 安全審查」）
 *
 * 掃描本專案的 6 支 content migration，逐條比對 PRD §6.6 的禁止語句，
 * 並檢查三件最容易出錯的事：
 *   1. seo_keywords 的 5 個新欄不得帶 DEFAULT
 *   2. storage policy 每條都要帶 bucket_id = 'content-assets'
 *   3. content_sites 的 FK 必須是 ON DELETE RESTRICT
 *
 * 用法：node scripts/content-sql-audit.mjs  （或 npm run content:sql-audit）
 * 退出碼 0 = 通過；1 = 有命中，必須逐條人工確認。
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGRATIONS = [
  '20261126090000_content_automation_core.sql',
  '20261126091000_content_automation_pipeline.sql',
  '20261126092000_content_automation_publish.sql',
  '20261126093000_content_automation_rls.sql',
  '20261126100000_content_social.sql',
  '20261126110000_content_cron.sql',
  '20261127092000_content_social_credentials.sql',
  '20261127100000_content_social_oauth.sql',
  '20261127110000_content_article_delete.sql',
];

const BANNED = [
  { pattern: /\bdrop\s+table\b/i, label: 'drop table' },
  { pattern: /\bdrop\s+column\b/i, label: 'drop column' },
  { pattern: /\balter\s+column\s+\S+\s+type\b/i, label: 'alter column ... type' },
  { pattern: /\btruncate\b/i, label: 'truncate' },
  { pattern: /\bdelete\s+from\b/i, label: 'delete from' },
  { pattern: /\bdrop\s+policy\b/i, label: 'drop policy' },
  { pattern: /\balter\s+policy\b/i, label: 'alter policy' },
  { pattern: /cron\.unschedule/i, label: 'cron.unschedule' },
  { pattern: /\brename\s+to\b/i, label: 'rename' },
];

const issues = [];
const notices = [];

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function stripComments(sql) {
  // 行註解與區塊註解都移除，避免說明文字誤觸規則。
  // 先正規化 CRLF：`--.*$` 在 CRLF 下不會吃掉註解（$ 停在 \r 前），會造成誤報。
  return sql
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const contents = new Map();

for (const file of MIGRATIONS) {
  const fullPath = path.join(ROOT, 'supabase', 'migrations', file);
  if (!existsSync(fullPath)) {
    issues.push(`缺少 migration：${rel(fullPath)}`);
    continue;
  }
  const raw = readFileSync(fullPath, 'utf8');
  const sql = stripComments(raw);
  contents.set(file, { raw, sql });

  const lines = sql.split('\n');
  for (const rule of BANNED) {
    lines.forEach((line, index) => {
      if (rule.pattern.test(line)) {
        issues.push(`${file}:${index + 1} 命中禁止語句「${rule.label}」→ ${line.trim()}`);
      }
    });
  }

  // 既有表的無條件 update（本專案不應出現）
  if (/update\s+public\.(?!content_)/i.test(sql)) {
    const lines2 = sql.split('\n');
    lines2.forEach((line, index) => {
      if (/update\s+public\.(?!content_)/i.test(line) && !/where/i.test(line)) {
        issues.push(`${file}:${index + 1} 對既有表 update 缺少 where → ${line.trim()}`);
      }
    });
  }

  // 只允許對既有表 seo_keywords 做 add column
  const existingTableTouches = [...sql.matchAll(/alter\s+table\s+public\.(\w+)/gi)]
    .map((match) => match[1])
    .filter((table) => !table.startsWith('content_'));
  for (const table of new Set(existingTableTouches)) {
    if (table !== 'seo_keywords') {
      issues.push(`${file}: 觸碰了既有表 ${table}（只允許 seo_keywords 加欄）`);
    }
  }
}

// --- 規則 1：seo_keywords 5 欄不得帶 DEFAULT ---------------------------
const core = contents.get('20261126090000_content_automation_core.sql');
if (core) {
  const block = core.raw.match(/ALTER TABLE public\.seo_keywords[\s\S]*?;/);
  if (!block) {
    issues.push('core migration 找不到 seo_keywords ADD COLUMN 區塊');
  } else {
    const blockText = block[0];
    for (const column of ['intent', 'priority', 'cluster', 'pipeline_status', 'last_used_at']) {
      if (!new RegExp(`add column if not exists ${column}\\b`, 'i').test(blockText)) {
        issues.push(`seo_keywords 缺少欄位 ${column}`);
      }
    }
    if (/default/i.test(blockText)) {
      issues.push('seo_keywords 新欄帶了 DEFAULT（會回填歷史資料，PRD v1.1 修訂 1 禁止）');
    }
    if (/not null/i.test(blockText)) {
      issues.push('seo_keywords 新欄帶了 NOT NULL（歷史列無法滿足，禁止）');
    }
  }
}

// --- 規則 2：storage policy 必須帶 bucket_id ---------------------------
const rls = contents.get('20261126093000_content_automation_rls.sql');
if (rls) {
  const policies = [...rls.raw.matchAll(/CREATE POLICY\s+"([^"]+)"[\s\S]*?;/g)];
  const storagePolicies = policies.filter((match) => /storage\.objects/i.test(match[0]));
  if (storagePolicies.length < 4) {
    issues.push(`storage 政策只有 ${storagePolicies.length} 條（要求 4 條：select/insert/update/delete）`);
  }
  for (const policy of storagePolicies) {
    if (!/bucket_id\s*=\s*'content-assets'/.test(policy[0])) {
      issues.push(`storage 政策「${policy[1]}」缺少 bucket_id = 'content-assets'`);
    }
  }
  if (!/INSERT INTO storage\.buckets[\s\S]*?'content-assets'[\s\S]*?false/i.test(rls.raw)) {
    issues.push("content-assets bucket 未確認為 private（public = false）");
  }
  if (/content_site_credentials[\s\S]{0,400}?CREATE POLICY/i.test(rls.sql)) {
    issues.push('content_site_credentials 似乎建立了 policy（應維持 0 條，deny all）');
  }
}

// --- 規則 3：content_sites FK 必須 restrict ---------------------------
if (core) {
  const fk = core.raw.match(/REFERENCES public\.webandsystem_list\(id\)\s+ON DELETE (\w+)/i);
  if (!fk) {
    issues.push('找不到 content_sites → webandsystem_list 的 FK');
  } else if (fk[1].toUpperCase() !== 'RESTRICT') {
    issues.push(`content_sites FK 是 ON DELETE ${fk[1].toUpperCase()}（必須 RESTRICT，PRD §6.6 規則 3）`);
  }
}

// --- 其他檢查 ---------------------------------------------------------
const settings = contents.get('20261126092000_content_automation_publish.sql');
if (settings) {
  if (!/daily_article_limit\s+integer\s+not null\s+default\s+0/i.test(settings.raw)) {
    issues.push('content_settings.daily_article_limit 必須 NOT NULL DEFAULT 0（出廠不自動跑）');
  }
  if (!/on conflict \(id\) do nothing/i.test(settings.raw)) {
    issues.push('content_settings 預設列必須 on conflict (id) do nothing');
  }
  const count = (settings.raw.match(/INSERT INTO public\.content_settings/g) || []).length;
  if (count !== 1) notices.push(`content_settings 種子列出現 ${count} 次（預期 1 次）`);
}

const pipeline = contents.get('20261126091000_content_automation_pipeline.sql');
if (pipeline) {
  if (!/content_claim_jobs[\s\S]{0,600}?security\s+definer/i.test(pipeline.raw)) {
    issues.push('content_claim_jobs 必須是 SECURITY DEFINER');
  }
  if (!/revoke all on function public\.content_claim_jobs/i.test(pipeline.raw)) {
    issues.push('content_claim_jobs 必須 revoke all from public/anon/authenticated');
  }
  if (!/grant execute on function public\.content_claim_jobs[\s\S]*?to service_role/i.test(pipeline.raw)) {
    issues.push('content_claim_jobs 必須只 grant service_role');
  }
  if (/create or replace function public\.content_claim_jobs/i.test(pipeline.raw) === false) {
    notices.push('content_claim_jobs 不是 create or replace（若已存在會失敗）');
  }
}

const cron = contents.get('20261126110000_content_cron.sql');
if (cron) {
  const jobs = ['content-worker-tick', 'content-planner-daily', 'content-digest-tick', 'content-health-daily'];
  for (const job of jobs) {
    if (!cron.raw.includes(`'${job}'`)) issues.push(`cron migration 缺少 job：${job}`);
  }
  if (!/if not exists \(select 1 from cron\.job/i.test(cron.raw) && !/exists \(select 1 from cron\.job/i.test(cron.raw)) {
    issues.push('cron job 建立必須包 if not exists（可重複執行）');
  }
  if (/Bearer\s+eyJ/i.test(cron.raw)) {
    issues.push('cron migration 出現硬編碼 JWT（service_role 不可入庫）');
  }
}

// --- 規則 4：社群帳號憑證（半自動 M4-03）------------------------------
const socialCredentials = contents.get('20261127092000_content_social_credentials.sql');
if (socialCredentials) {
  const sql = socialCredentials.sql;
  if (!/enable row level security/i.test(sql)) {
    issues.push('content_social_account_credentials 必須啟用 RLS');
  }
  if (
    !/revoke all on public\.content_social_account_credentials from public,\s*anon,\s*authenticated/i.test(
      sql,
    )
  ) {
    issues.push('content_social_account_credentials 必須 revoke anon／authenticated（密文只給 service_role）');
  }
  if (!/grant all on public\.content_social_account_credentials to service_role/i.test(sql)) {
    issues.push('content_social_account_credentials 必須 grant service_role');
  }
  if (/\bcreate policy\b[\s\S]{0,200}?content_social_account_credentials/i.test(sql)) {
    issues.push('content_social_account_credentials 不應建立 policy（RLS + 0 policy = deny all）');
  }
  const mirrorAlter = sql.match(/alter table public\.content_social_accounts[\s\S]*?;/i)?.[0] ?? '';
  if (!/credential_status/i.test(mirrorAlter) || !/credential_expires_at/i.test(mirrorAlter)) {
    issues.push('content_social_accounts 缺少 credential_status／credential_expires_at 鏡像欄');
  }
  if (/credential_[a-z_]+\s+[a-z ]+\s+default/i.test(mirrorAlter)) {
    issues.push('憑證鏡像欄不得給 DEFAULT（避免既有帳號被誤標成有憑證）');
  }
}

// --- 規則 5：OAuth state（一次性、僅 service_role）--------------------
const socialOAuthMigration = contents.get('20261127100000_content_social_oauth.sql');
if (socialOAuthMigration) {
  const sql = socialOAuthMigration.sql;
  if (!/enable row level security/i.test(sql)) {
    issues.push('content_social_oauth_states 必須啟用 RLS');
  }
  if (!/revoke all on public\.content_social_oauth_states from public,\s*anon,\s*authenticated/i.test(sql)) {
    issues.push('content_social_oauth_states 必須 revoke anon／authenticated');
  }
  if (!/grant all on public\.content_social_oauth_states to service_role/i.test(sql)) {
    issues.push('content_social_oauth_states 必須 grant service_role');
  }
  if (/\bcreate policy\b[\s\S]{0,200}?content_social_oauth_states/i.test(sql)) {
    issues.push('content_social_oauth_states 不應建立 policy（0 policy = deny all）');
  }
  if (!/state\s+uuid\s+primary key/i.test(sql) || !/expires_at\s+timestamptz\s+not null/i.test(sql)) {
    issues.push('content_social_oauth_states 需有 uuid state 與 expires_at');
  }
}

// --- 規則 6：遠端刪除（只加欄位／放寬 CHECK，不得硬刪資料）----------------
const articleDelete = contents.get('20261127110000_content_article_delete.sql');
if (articleDelete) {
  const sql = articleDelete.sql;
  if (!/add column if not exists deleted_at/i.test(sql) || !/deleted_reason/i.test(sql)) {
    issues.push('content_articles 需有 deleted_at／deleted_reason（審計用，不得只刪記錄）');
  }
  if (/\bdelete\s+from\b/i.test(sql) || /\btruncate\b/i.test(sql)) {
    issues.push('遠端刪除 migration 不得直接刪除資料列');
  }
  if (!/delete_article/.test(sql)) issues.push('content_jobs type 需允許 delete_article');
  if (!/'delete'/.test(sql)) issues.push('content_publish_logs action 需允許 delete');
}

// --- 輸出 -------------------------------------------------------------
console.log('\n內容自動化 · SQL 安全審查');
console.log('==========================');
console.log(`掃描檔案：${MIGRATIONS.length} 支`);
console.log(`禁止語句規則：${BANNED.length} 條 + 專案規則 3 組`);

if (notices.length) {
  console.log('\n提示：');
  for (const notice of notices) console.log(`  · ${notice}`);
}

if (issues.length) {
  console.log('\n命中問題：');
  for (const issue of issues) console.log(`  ✗ ${issue}`);
  console.log(`\n合計 ${issues.length} 項，必須逐條確認後才可 db push。\n`);
  process.exitCode = 1;
} else {
  console.log('\n結果：0 命中。可以進入 db push --dry-run。');
  console.log('提醒：仍必須先做結構快照，並在推送後跑回歸煙霧測試（PRD §13.1）。\n');
}
