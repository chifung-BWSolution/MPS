import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GSC_STALE_RUNNING_MS,
  gscRunProgressPct,
  gscRunRecentErrors,
  gscRunStatusLabel,
  isGscPermissionError,
  isLiveGscRun,
  isStaleGscRun,
  mapGscSyncRun,
  resumeSkipSiteUrls,
  shortenGscLog,
} from '../src/lib/gscSync';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const mapped = mapGscSyncRun({
  id: 'gsc_1',
  started_at: '2026-09-11T01:00:00.000Z',
  finished_at: '2026-09-11T01:02:00.000Z',
  status: 'success',
  sites_synced: '3',
  rows_upserted: '120',
  keywords_upserted: '8',
  error_message: null,
  meta: { date_from: '2026-08-12', date_to: '2026-09-08', sites_listed: 4, errors: ['site a'] },
});
assert.equal(mapped.sites_synced, 3);
assert.equal(mapped.rows_upserted, 120);
assert.equal(mapped.keywords_upserted, 8);
assert.deepEqual(gscRunRecentErrors(mapped), ['site a']);
assert.equal(gscRunProgressPct(mapped), 75);
assert.equal(gscRunStatusLabel(mapped).text, '已完成');

const stale = mapGscSyncRun({
  id: 'gsc_2',
  started_at: '2026-09-10T10:00:00.000Z',
  finished_at: null,
  status: 'running',
  sites_synced: 0,
  rows_upserted: 0,
  keywords_upserted: 0,
  error_message: 'timed out',
  meta: { errors: ['chunk'] },
});
const now = Date.parse('2026-09-10T10:20:00.000Z');
assert.equal(isStaleGscRun(stale, now), true);
assert.ok(now - Date.parse(stale.started_at) > GSC_STALE_RUNNING_MS);
assert.equal(gscRunStatusLabel(stale, now).text, '可能已逾時');
assert.deepEqual(gscRunRecentErrors(stale), ['timed out', 'chunk']);

const live = mapGscSyncRun({
  ...stale,
  id: 'gsc_3',
  started_at: '2026-09-10T10:19:00.000Z',
  error_message: null,
  meta: null,
});
assert.equal(isStaleGscRun(live, now), false);
assert.equal(isLiveGscRun(live, now), true);
assert.equal(isLiveGscRun(stale, now), false);
assert.equal(gscRunStatusLabel(live, now).text, '執行中');
assert.equal(gscRunProgressPct(live, now), 55);
assert.ok(GSC_STALE_RUNNING_MS <= 3 * 60 * 1000);

assert.equal(
  isGscPermissionError("User does not have sufficient permission for site 'https://bwdesign-office.com/'"),
  true,
);
assert.equal(shortenGscLog("https://bwdesign-office.com/: GSC searchAnalytics failed (403): User does not have sufficient permission"), 'https://bwdesign-office.com/: 無權限，已略過');

const partial = mapGscSyncRun({
  id: 'gsc_4',
  started_at: '2026-09-11T02:16:00.000Z',
  finished_at: '2026-09-11T02:18:00.000Z',
  status: 'success',
  sites_synced: 24,
  rows_upserted: 79760,
  keywords_upserted: 2048,
  error_message: '已寫入目前進度，尚餘 56 站。再按一次「開始同步」繼續。',
  meta: {
    sites_listed: 80,
    incomplete: true,
    timed_out: true,
    processed_site_urls: Array.from({ length: 24 }, (_, i) => `https://s${i}.com/`),
    skipped_site_urls: ['https://bwdesign-office.com/'],
    errors: ["https://bwdesign-office.com/: GSC searchAnalytics failed (403): User does not have sufficient permission"],
  },
});
assert.equal(gscRunStatusLabel(partial).text, '部分完成');
assert.equal(gscRunProgressPct(partial), 30);
assert.ok(gscRunRecentErrors(partial).some((e) => e.includes('無權限')));
assert.deepEqual(
  resumeSkipSiteUrls(partial, Date.parse('2026-09-11T03:00:00.000Z')).includes('https://s0.com/'),
  true,
);
assert.deepEqual(resumeSkipSiteUrls(partial, Date.parse('2026-09-13T03:00:00.000Z')), []);

const migration = read('supabase/migrations/20260911021500_gsc_incremental_daily_cron.sql');
assert.match(migration, /gsc-incremental-daily/);
assert.match(migration, /functions\/v1\/sync-gsc/);
assert.match(migration, /45 22 \* \* \*/);
assert.match(migration, /cron\.schedule/);
assert.match(migration, /google-ads-incremental-daily/);
assert.doesNotMatch(migration, /Bearer eyJ/);

const panel = read('src/components/website/GscOAuthPanel.tsx');
assert.match(panel, /useGscSync/);
assert.match(panel, /開始同步/);
assert.match(panel, /一鍵授權 Search Console/);
assert.match(panel, /顯示 refresh token/);
assert.match(panel, /最近錯誤 \/ 日誌/);

const hook = read('src/hooks/useGscSync.ts');
assert.match(hook, /\.from\('gsc_sync_runs'\)/);
assert.match(hook, /invokeGscSync/);
assert.match(hook, /void invokeGscSync/);
assert.match(hook, /isLiveGscRun/);

const fn = read('supabase/functions/sync-gsc/index.ts');
assert.match(fn, /DEADLINE_MS/);
assert.match(fn, /AbortSignal\.timeout|deadlineAt/);
assert.match(fn, /upsert_gsc_seo_keywords/);
assert.match(fn, /resumeSkipSiteUrls/);
assert.match(fn, /processed_site_urls/);
assert.match(fn, /isGscPermissionError/);
assert.doesNotMatch(fn, /from\("seo_keywords"\)\.insert/);

const rpc = read('supabase/migrations/20260911023000_upsert_gsc_seo_keywords.sql');
assert.match(rpc, /upsert_gsc_seo_keywords/);
assert.match(rpc, /ON CONFLICT \(website_profile_id, normalized_keyword\)/);
assert.doesNotMatch(rpc, /Bearer eyJ/);

console.log('gsc sync lib: ok');
