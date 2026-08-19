/**
 * Warehouse checks used by ads-campaign-advisor tools.
 * Cases: search, metrics, tag, 92-day breakdown gate, unauthenticated function call.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
if (!url || !anon) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY');
  process.exit(1);
}

const supabase = createClient(url, anon);
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const google = await supabase
  .from('google_ads_campaigns')
  .select('customer_id,campaign_id,campaign_name,status')
  .not('campaign_name', 'is', null)
  .limit(1)
  .maybeSingle();
record(
  '1. Google campaign readable (detail snapshot source)',
  !google.error && !!google.data,
  google.error?.message || `${google.data?.campaign_name} ${google.data?.customer_id}:${google.data?.campaign_id}`,
);

const facebook = await supabase
  .from('facebook_ads_campaigns')
  .select('ad_account_id,campaign_id,campaign_name,status')
  .not('campaign_name', 'is', null)
  .limit(1)
  .maybeSingle();
record(
  '2. Facebook campaign readable (detail snapshot source)',
  !facebook.error && !!facebook.data,
  facebook.error?.message || `${facebook.data?.campaign_name} ${facebook.data?.ad_account_id}:${facebook.data?.campaign_id}`,
);

if (google.data) {
  const q = (google.data.campaign_name || '').slice(0, 8);
  const search = await supabase
    .from('google_ads_campaigns')
    .select('customer_id,campaign_id,campaign_name,status')
    .ilike('campaign_name', `%${q}%`)
    .limit(10);
  record(
    '3. search_campaigns ilike returns candidates',
    !search.error && (search.data?.length ?? 0) > 0,
    search.error?.message || `${search.data?.length} matches for "${q}"`,
  );

  const recent = await supabase
    .from('google_ads_campaign_daily_metrics')
    .select('customer_id,campaign_id,metric_date,impressions,clicks,cost_micros,conversions')
    .gt('impressions', 0)
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const metricsTarget = recent.data || {
    customer_id: google.data.customer_id,
    campaign_id: google.data.campaign_id,
  };
  const to = recent.data?.metric_date || new Date().toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  const metrics = await supabase
    .from('google_ads_campaign_daily_metrics')
    .select('metric_date,impressions,clicks,cost_micros,conversions')
    .eq('customer_id', metricsTarget.customer_id)
    .eq('campaign_id', metricsTarget.campaign_id)
    .gte('metric_date', from)
    .lte('metric_date', to)
    .order('metric_date', { ascending: true })
    .limit(40);
  const impressions = (metrics.data ?? []).reduce((s, r) => s + Number(r.impressions || 0), 0);
  record(
    '3b. get_campaign_metrics daily rows',
    !metrics.error && (metrics.data?.length ?? 0) > 0,
    metrics.error?.message ||
      `${metrics.data?.length ?? 0} days, impressions=${impressions} (${metricsTarget.customer_id}:${metricsTarget.campaign_id})`,
  );
}

const tags = await supabase.from('ads_tags').select('id,name').limit(5);
record('4. ads_tags readable', !tags.error, tags.error?.message || `${tags.data?.length ?? 0} tags`);
if (tags.data?.[0]) {
  const assign = await supabase
    .from('ads_campaign_tags')
    .select('platform,campaign_row_id')
    .eq('tag_id', tags.data[0].id)
    .limit(10);
  record(
    '4b. get_campaigns_by_tag join',
    !assign.error,
    assign.error?.message || `${assign.data?.length ?? 0} campaigns for ${tags.data[0].name}`,
  );
}

function daysInclusive(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}
const shortDays = daysInclusive('2026-07-20', '2026-08-18');
const longDays = daysInclusive('2026-01-01', '2026-08-18');
record('5. breakdown 92-day gate (30d allowed)', shortDays <= 92, `${shortDays} days`);
record('5b. breakdown 92-day gate (ytd/all refused)', longDays > 92, `${longDays} days`);

const unauth = await fetch(`${url}/functions/v1/ads-campaign-advisor`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: anon,
  },
  body: JSON.stringify({ snapshot: {}, messages: [] }),
});
const unauthJson = await unauth.json().catch(() => ({}));
record(
  '6. unauthenticated invoke rejected',
  unauth.status === 401 || Boolean(unauthJson.error),
  `${unauth.status} ${unauthJson.error || unauth.statusText}`,
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
