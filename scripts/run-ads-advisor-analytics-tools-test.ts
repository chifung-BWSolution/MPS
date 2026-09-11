import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AdsAdvisorToolName } from '../src/types/adsAdvisor';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const expected: AdsAdvisorToolName[] = [
  'search_campaigns',
  'get_campaign_metrics',
  'compare_campaigns',
  'get_campaigns_by_tag',
  'get_campaign_breakdowns',
  'get_ga4_metrics',
  'get_gsc_queries',
];

const types = read('src/types/adsAdvisor.ts');
const tools = read('supabase/functions/ads-campaign-advisor/tools.ts');
const warehouse = read('supabase/functions/ads-campaign-advisor/warehouse.ts');
const analytics = read('supabase/functions/ads-campaign-advisor/website-analytics.ts');
const fn = read('supabase/functions/ads-campaign-advisor/index.ts');
const shell = read('src/components/marketing/campaign-detail/AdsCampaignDetailShell.tsx');
const prompts = read('src/lib/adsAdvisorPrompts.ts');

for (const name of expected) {
  assert.match(types, new RegExp(`'${name}'`));
  assert.match(tools, new RegExp(`"${name}"`));
  assert.match(fn, new RegExp(name));
}

assert.match(warehouse, /case "get_ga4_metrics"/);
assert.match(warehouse, /case "get_gsc_queries"/);
assert.match(analytics, /from\("ga4_property_daily_metrics"\)/);
assert.match(analytics, /from\("ga4_channel_daily_metrics"\)/);
assert.match(analytics, /from\("gsc_query_daily_metrics"\)/);
assert.match(analytics, /from\("seo_keywords"\)/);
assert.match(analytics, /facebook_ads_account_websites/);
assert.match(analytics, /google_ads_campaign_websites/);
assert.match(shell, /websiteProfileId: w\.websiteProfileId/);
assert.match(prompts, /GA4 到站數據同 GSC 自然搜尋/);
assert.match(fn, /get_ga4_metrics 與 get_gsc_queries/);

console.log('ads advisor GA4/GSC tool contract tests passed');
