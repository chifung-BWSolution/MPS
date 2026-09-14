import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveGscTotals,
  formatGscCtr,
  formatGscPosition,
  previousGscRange,
  totalsFromSums,
} from '../src/lib/gscReport.ts';
import { buildGscReportHash, parseGscReportHashQuery } from '../src/lib/gscNavigation.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.deepEqual(
  deriveGscTotals([
    { clicks: 10, impressions: 100, position: 4 },
    { clicks: 5, impressions: 50, position: 10 },
  ]),
  { clicks: 15, impressions: 150, ctr: 0.1, position: 6 },
);
assert.deepEqual(totalsFromSums({ clicks: 2, impressions: 8, position_weighted: 16 }), {
  clicks: 2,
  impressions: 8,
  ctr: 0.25,
  position: 2,
});
assert.equal(formatGscCtr(0.1234), '12.3%');
assert.equal(formatGscPosition(4.21), '4.2');
assert.deepEqual(previousGscRange('2026-09-04', '2026-09-10'), {
  from: '2026-08-28',
  to: '2026-09-03',
});

assert.equal(
  buildGscReportHash({
    siteUrl: 'https://www.bwdesign-office.com/',
    preset: '30d',
    from: '2026-08-15',
    to: '2026-09-13',
  }),
  'website/gsc?site=https%3A%2F%2Fwww.bwdesign-office.com%2F&preset=30d&from=2026-08-15&to=2026-09-13',
);
assert.deepEqual(
  parseGscReportHashQuery(
    '#website/gsc?site=https%3A%2F%2Fwww.bwdesign-office.com%2F&preset=30d&from=2026-08-15&to=2026-09-13',
  ),
  {
    site: 'https://www.bwdesign-office.com/',
    preset: '30d',
    from: '2026-08-15',
    to: '2026-09-13',
  },
);

const menu = read('src/context/AppContext.tsx');
assert.match(menu, /id: 'gsc'/);
assert.match(menu, /Search Console/);

const website = read('src/components/website/WebsiteModule.tsx');
assert.match(website, /GscReportModule/);
assert.match(website, /subModule === 'gsc'/);
assert.match(website, /WebsiteGscTab/);
assert.match(website, /id: 'gsc', label: 'Search Console'/);

const moduleUi = read('src/components/website/gsc/GscReportModule.tsx');
assert.match(moduleUi, /Search Console/);
assert.match(moduleUi, /Clicks/);
assert.match(moduleUi, /Impressions/);
assert.match(moduleUi, /setGscReportHash/);

const hook = read('src/hooks/useGscReport.ts');
assert.match(hook, /gsc_site_metrics_range/);
assert.match(hook, /from\('gsc_sites'\)/);

const detailHook = read('src/hooks/useGscSiteDetail.ts');
assert.match(detailHook, /gsc_site_daily_range/);
assert.match(detailHook, /gsc_top_queries_range/);
assert.match(detailHook, /gsc_top_pages_range/);

const seo = read('src/components/website/WebsiteDetailTabs.tsx');
assert.match(seo, /開啟 GSC 報告/);
assert.match(seo, /setGscReportHash/);

const migration = read('supabase/migrations/20260914120000_gsc_report_site_page_metrics.sql');
assert.match(migration, /gsc_site_daily_metrics/);
assert.match(migration, /gsc_page_daily_metrics/);
assert.match(migration, /gsc_site_metrics_range/);
assert.match(migration, /gsc_top_pages_range/);

const fn = read('supabase/functions/sync-gsc/index.ts');
assert.match(fn, /fetchDailySiteMetrics/);
assert.match(fn, /fetchDailyPageMetrics/);
assert.match(fn, /gsc_site_daily_metrics/);
assert.match(fn, /gsc_page_daily_metrics/);

const gscFetch = read('supabase/functions/_shared/google-gsc.ts');
assert.match(gscFetch, /dataState: "final" \| "all"/);
assert.match(gscFetch, /\["page", "date"\]/);
assert.match(gscFetch, /\["date"\]/);

console.log('gsc report: ok');
