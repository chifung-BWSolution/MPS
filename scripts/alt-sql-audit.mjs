/**
 * ALT Pilot · migration 靜態安全審查
 *
 * 這不是 SQL 執行器；它負責在 push 前攔住「不該出現的破壞性語句」，
 * 並確認必要物件數量，作為 M1-06 / 上線 Gate 的一部分。
 *
 * 執行：node scripts/alt-sql-audit.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve('supabase/migrations/20261125183000_alt_pilot.sql');
const raw = readFileSync(file, 'utf8');
const sql = raw
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/--[^\n]*/g, ' ');

const forbidden = [
  { name: 'DROP TABLE', pattern: /\bdrop\s+table\b/i },
  { name: 'DROP COLUMN', pattern: /\bdrop\s+column\b/i },
  { name: 'ALTER COLUMN TYPE', pattern: /\balter\s+column\b[\s\S]{0,80}?\btype\b/i },
  { name: 'DELETE FROM', pattern: /\bdelete\s+from\b/i },
  { name: 'TRUNCATE', pattern: /\btruncate\b/i },
  {
    name: 'UPDATE without WHERE',
    pattern: /\bupdate\s+(?!on\b|of\b|set\b)[a-z_][a-z0-9_]*\b(?![\s\S]{0,200}?\bwhere\b)/i,
  },
  { name: 'DROP POLICY', pattern: /\bdrop\s+policy\b/i },
  { name: 'ALTER POLICY', pattern: /\balter\s+policy\b/i },
  { name: 'pg_cron schedule', pattern: /\bcron\.(schedule|unschedule)\b/i },
];

const hits = forbidden.filter((item) => item.pattern.test(sql));

const counts = {
  createTables: (sql.match(/\bcreate\s+table\s+if\s+not\s+exists\s+public\.alt_/gi) || []).length,
  createPolicies: (sql.match(/\bcreate\s+policy\b/gi) || []).length,
  enableRls: (sql.match(/\balter\s+table\s+public\.alt_[a-z_]+\s+enable\s+row\s+level\s+security/gi) || []).length,
  createTriggers: (sql.match(/create\s+trigger/gi) || []).length,
  revokeAnon: (sql.match(/\brevoke\s+all\s+on\s+public\.alt_[a-z_]+\s+from\s+anon\b/gi) || []).length,
  revokeAllAuthenticated: (sql.match(/\brevoke\s+all\s+on\s+public\.alt_runs[\s\S]{0,300}?from\s+authenticated\b/gi) || []).length,
  grantDeleteToAuthenticated: (sql.match(/\bgrant\b[^;]*\bdelete\b[^;]*\bto\s+authenticated\b/gi) || []).length,
  settingsSeed: (sql.match(/\binsert\s+into\s+public\.alt_settings\b/gi) || []).length,
  settingsConflict: (sql.match(/\bon\s+conflict\s*\(id\)\s+do\s+nothing\b/gi) || []).length,
};

const expected = {
  createTables: 4,
  createPolicies: 8,
  enableRls: 4,
  createTriggers: 3,
  revokeAnon: 4,
  revokeAllAuthenticated: 1,
  grantDeleteToAuthenticated: 0,
  settingsSeed: 1,
  settingsConflict: 1,
};

const failures = [];
for (const hit of hits) failures.push(`forbidden statement: ${hit.name}`);
for (const [key, value] of Object.entries(expected)) {
  if (counts[key] !== value) failures.push(`${key}: expected ${value}, got ${counts[key]}`);
}
if (!/references\s+public\.webandsystem_list/i.test(sql)) {
  failures.push('missing FK to webandsystem_list');
}
if (!/references\s+public\.users/i.test(sql)) {
  failures.push('missing FK to users');
}

if (failures.length > 0) {
  console.error(`ALT Pilot SQL audit failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('ALT Pilot SQL audit passed');
console.log(JSON.stringify(counts, null, 2));
