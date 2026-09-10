-- Apply GSC warehouse pieces that 20260805120000 never reached on remote.
-- seo_keywords already exists with a legacy text id / no normalized_keyword.

ALTER TABLE public.webandsystem_list
  ADD COLUMN IF NOT EXISTS gsc_site_url text,
  ADD COLUMN IF NOT EXISTS google_ads_customer_id text;

CREATE INDEX IF NOT EXISTS webandsystem_list_gsc_site_url_idx
  ON public.webandsystem_list (gsc_site_url);
CREATE INDEX IF NOT EXISTS webandsystem_list_gads_customer_idx
  ON public.webandsystem_list (google_ads_customer_id);

CREATE TABLE IF NOT EXISTS public.gsc_sites (
  site_url              text PRIMARY KEY,
  permission_level      text,
  website_profile_id    text REFERENCES public.webandsystem_list(id) ON DELETE SET NULL,
  matched_domain        text,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gsc_sites_website_idx
  ON public.gsc_sites (website_profile_id);

ALTER TABLE public.gsc_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on gsc_sites" ON public.gsc_sites;
CREATE POLICY "Allow select on gsc_sites"
  ON public.gsc_sites FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on gsc_sites" ON public.gsc_sites;
CREATE POLICY "Allow insert on gsc_sites"
  ON public.gsc_sites FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on gsc_sites" ON public.gsc_sites;
CREATE POLICY "Allow update on gsc_sites"
  ON public.gsc_sites FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on gsc_sites" ON public.gsc_sites;
CREATE POLICY "Allow delete on gsc_sites"
  ON public.gsc_sites FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gsc_sites TO anon, authenticated;
GRANT ALL ON public.gsc_sites TO service_role;

CREATE TABLE IF NOT EXISTS public.gsc_query_daily_metrics (
  site_url              text NOT NULL REFERENCES public.gsc_sites(site_url) ON DELETE CASCADE,
  query                 text NOT NULL,
  metric_date           date NOT NULL,
  clicks                numeric NOT NULL DEFAULT 0,
  impressions           numeric NOT NULL DEFAULT 0,
  ctr                   numeric,
  position              numeric,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_url, query, metric_date)
);

CREATE INDEX IF NOT EXISTS gsc_query_daily_date_idx
  ON public.gsc_query_daily_metrics (metric_date);
CREATE INDEX IF NOT EXISTS gsc_query_daily_query_idx
  ON public.gsc_query_daily_metrics (query);

ALTER TABLE public.gsc_query_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on gsc_query_daily_metrics" ON public.gsc_query_daily_metrics;
CREATE POLICY "Allow select on gsc_query_daily_metrics"
  ON public.gsc_query_daily_metrics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on gsc_query_daily_metrics" ON public.gsc_query_daily_metrics;
CREATE POLICY "Allow insert on gsc_query_daily_metrics"
  ON public.gsc_query_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on gsc_query_daily_metrics" ON public.gsc_query_daily_metrics;
CREATE POLICY "Allow update on gsc_query_daily_metrics"
  ON public.gsc_query_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on gsc_query_daily_metrics" ON public.gsc_query_daily_metrics;
CREATE POLICY "Allow delete on gsc_query_daily_metrics"
  ON public.gsc_query_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gsc_query_daily_metrics TO anon, authenticated;
GRANT ALL ON public.gsc_query_daily_metrics TO service_role;

ALTER TABLE public.seo_keywords
  ADD COLUMN IF NOT EXISTS normalized_keyword text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS gsc_site_url text,
  ADD COLUMN IF NOT EXISTS last_gsc_sync_at timestamptz;

UPDATE public.seo_keywords
SET normalized_keyword = lower(trim(keyword))
WHERE normalized_keyword IS NULL OR normalized_keyword = '';

ALTER TABLE public.seo_keywords
  ALTER COLUMN normalized_keyword SET DEFAULT '',
  ALTER COLUMN normalized_keyword SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'manual',
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

UPDATE public.seo_keywords SET source = 'manual' WHERE source IS NULL;
ALTER TABLE public.seo_keywords ALTER COLUMN source SET NOT NULL;

ALTER TABLE public.seo_keywords
  ALTER COLUMN current_ranking TYPE numeric USING current_ranking::numeric;

CREATE UNIQUE INDEX IF NOT EXISTS seo_keywords_website_normalized_uidx
  ON public.seo_keywords (website_profile_id, normalized_keyword);

CREATE INDEX IF NOT EXISTS seo_keywords_website_idx
  ON public.seo_keywords (website_profile_id);
CREATE INDEX IF NOT EXISTS seo_keywords_status_idx
  ON public.seo_keywords (status);
CREATE INDEX IF NOT EXISTS seo_keywords_normalized_idx
  ON public.seo_keywords (normalized_keyword);

CREATE TABLE IF NOT EXISTS public.gsc_sync_runs (
  id                    text PRIMARY KEY,
  started_at            timestamptz NOT NULL DEFAULT now(),
  finished_at           timestamptz,
  status                text NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'success', 'error')),
  sites_synced          integer NOT NULL DEFAULT 0,
  rows_upserted         bigint NOT NULL DEFAULT 0,
  keywords_upserted     integer NOT NULL DEFAULT 0,
  error_message         text,
  meta                  jsonb
);

NOTIFY pgrst, 'reload schema';
