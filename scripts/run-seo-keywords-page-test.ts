import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateGscMetricsToKeywordRows } from '../src/lib/gscKeywords.ts';
import { nextSeoKeywordSort, sortSeoKeywords } from '../src/lib/seoKeywordSort.ts';
import type { SeoKeywordRow } from '../src/types/seo.ts';

const aggregated = aggregateGscMetricsToKeywordRows('ws-office', [
  { query: 'office design', impressions: 3, position: 8, metric_date: '2026-09-01', site_url: 'https://www.bwdesign-office.com/' },
  { query: 'office design', impressions: 2, position: 6, metric_date: '2026-09-02', site_url: 'https://www.bwdesign-office.com/' },
  { query: '  Office Design ', impressions: 1, position: 4, metric_date: '2026-09-03', site_url: 'https://www.bwdesign-office.com/' },
]);
assert.equal(aggregated.length, 1);
assert.equal(aggregated[0].keyword, 'Office Design');
assert.equal(aggregated[0].search_volume, 6);
assert.equal(aggregated[0].current_ranking, 6.7);
assert.equal(aggregateGscMetricsToKeywordRows('ws-office', [
  { query: 'tiny', impressions: 0, position: 10, metric_date: '2026-09-01', site_url: 'https://www.bwdesign-office.com/' },
]).length, 0);

const sortRows = [
  { keyword: 'zeta', level: 'level_3', current_ranking: 12, search_volume: null, status: 'monitoring' },
  { keyword: 'alpha', level: 'level_1', current_ranking: 3, search_volume: 80, status: 'achieved' },
] as SeoKeywordRow[];
assert.deepEqual(sortSeoKeywords(sortRows, 'keyword', 'asc').map((r) => r.keyword), ['alpha', 'zeta']);
assert.deepEqual(sortSeoKeywords(sortRows, 'current_ranking', 'asc').map((r) => r.keyword), ['alpha', 'zeta']);
assert.deepEqual(sortSeoKeywords(sortRows, 'search_volume', 'desc').map((r) => r.keyword), ['alpha', 'zeta']);
assert.equal(nextSeoKeywordSort('keyword', 'asc', 'keyword', 'alpha').dir, 'desc');
assert.equal(nextSeoKeywordSort('keyword', 'asc', 'current_ranking', 3).dir, 'desc');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(join(root, 'src/hooks/useSeoKeywords.ts'), 'utf8');
const tab = readFileSync(join(root, 'src/components/website/WebsiteDetailTabs.tsx'), 'utf8');
const detail = readFileSync(join(root, 'src/components/website/WebsiteModule.tsx'), 'utf8');

assert.match(hook, /export function useSeoKeywords\(websiteProfileId: string\)/);
assert.match(hook, /\.eq\('website_profile_id', websiteId\)/);
assert.match(hook, /\.range\(from, to\)/);
assert.match(hook, /from\('gsc_sites'\)/);
assert.match(hook, /from\('gsc_query_daily_metrics'\)/);
assert.match(hook, /aggregateGscMetricsToKeywordRows/);
assert.match(hook, /PAGE_SIZE = 1000/);
assert.doesNotMatch(
  hook,
  /from\('seo_keywords'\)[\s\S]{0,180}\.order\('keyword'[\s\S]{0,80}\);/,
);

assert.match(tab, /useSeoKeywords\(site\.id\)/);
assert.match(tab, /SeoSortableTh/);
assert.match(tab, /sortSeoKeywords/);
assert.match(tab, /GSC 已連接/);
assert.match(tab, /GSC 未連接/);
assert.match(tab, /isGscAnalyticsReadable/);
assert.match(tab, /未驗證/);
assert.doesNotMatch(tab, /allKeywords\.filter/);

assert.match(detail, /onKeywordsCount=\{setKeywordCount\}/);
assert.match(detail, /from\('seo_keywords'\)[\s\S]{0,120}count: 'exact'/);

console.log('seo keywords page: ok');
