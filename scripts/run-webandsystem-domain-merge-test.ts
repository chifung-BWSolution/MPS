import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const fn = read('supabase/migrations/20260911035334_canonical_domain_url.sql');
assert.match(fn, /CREATE OR REPLACE FUNCTION public\.canonical_domain_url/);
assert.match(fn, /\^https\?:\/\//);
assert.match(fn, /\^www\\\./);

const merge = read('supabase/migrations/20260911035336_webandsystem_domain_merge_and_lock.sql');
assert.match(merge, /CREATE OR REPLACE FUNCTION public\.merge_webandsystem_profile/);
assert.match(merge, /webandsystem_merge_log/);
assert.match(merge, /webandsystem_duplicate_conflicts/);
assert.match(merge, /seo_keywords/);
assert.match(merge, /google_ads_campaign_websites/);
assert.match(merge, /ads_discovered_domains/);
assert.match(merge, /ga4_properties/);
assert.match(merge, /gsc_sites/);
assert.match(merge, /website_video_links/);
assert.match(merge, /quotation_client_project/);
assert.match(merge, /social_posts/);
assert.match(merge, /backlink_purchases/);
assert.match(merge, /google_business_registrations/);
assert.match(merge, /day_report_entries/);
assert.match(merge, /recurring_expenses/);
assert.match(merge, /quotation_bv/);
assert.match(merge, /DELETE FROM public\.webandsystem_list/);
assert.match(merge, /trg_canonicalize_webandsystem_domain/);
assert.match(merge, /webandsystem_list_domain_url_uidx/);
assert.match(merge, /conflicting 1:1 fields/);
assert.ok(
  merge.indexOf('INSERT INTO public.webandsystem_merge_log') <
    merge.indexOf('DELETE FROM public.webandsystem_list'),
);

const edge = read('supabase/functions/_shared/website-match.ts');
assert.match(edge, /replace\(\/\^\\\/\\\//);
assert.match(edge, /:\\d\+\$/);

const gsc = read('supabase/functions/_shared/google-gsc.ts');
assert.match(gsc, /sc-domain:/);
assert.match(gsc, /return normalizeDomain\(s\.slice\("sc-domain:"\.length\)\)/);

console.log('webandsystem domain merge: ok');
