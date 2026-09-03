import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === 'node_modules' || name.name === 'dist') continue;
      walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(name.name)) {
      acc.push(p);
    }
  }
  return acc;
}

const fromRe = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/g;
const used = new Set<string>();
for (const file of walk(join(root, 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(fromRe)) {
    used.add(match[1]);
  }
}

const dropRe = /DROP TABLE IF EXISTS public\.([a-z0-9_]+)/gi;
const dropped = new Set<string>();
for (const name of readdirSync(join(root, 'supabase/migrations'))) {
  if (!name.endsWith('.sql')) continue;
  const text = readFileSync(join(root, 'supabase/migrations', name), 'utf8');
  for (const match of text.matchAll(dropRe)) {
    dropped.add(match[1]);
  }
}

const restore = readFileSync(
  join(root, 'supabase/migrations/20260902084445_restore_dropped_app_tables.sql'),
  'utf8',
);
assert.match(restore, /CREATE TABLE IF NOT EXISTS public\.upcoming_event/);
assert.match(restore, /CREATE TABLE IF NOT EXISTS public\.gsc_sync_runs/);
assert.match(restore, /CREATE TABLE IF NOT EXISTS public\.seo_ranking_history/);

assert.ok(used.has('upcoming_event'), 'dashboard still queries upcoming_event');
assert.ok(used.has('gsc_sync_runs'), 'SEO page still queries gsc_sync_runs');
assert.ok(used.has('seo_keywords'), 'SEO page still queries seo_keywords');

const stillReferencedAfterDrop = [...used].filter((t) => dropped.has(t)).sort();
const allowedRestored = new Set([
  'upcoming_event',
  'gsc_sync_runs',
  'system_users',
  'user_info',
]);
const unrestored = stillReferencedAfterDrop.filter((t) => !allowedRestored.has(t));
assert.deepEqual(
  unrestored,
  [],
  `Frontend still queries tables that a migration dropped and that were not restored: ${unrestored.join(', ')}`,
);

console.log('frontend table guard: ok');
console.log(`  src .from() tables: ${used.size}`);
console.log(`  dropped-but-still-queried (restored): ${stillReferencedAfterDrop.join(', ') || '(none)'}`);
