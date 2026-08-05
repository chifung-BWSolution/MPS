-- ============================================================
-- Google Search Console + SEO keyword warehouse
-- ============================================================

-- Mapping helpers on live website list
ALTER TABLE public.webandsystem_list
  ADD COLUMN IF NOT EXISTS gsc_site_url text,
  ADD COLUMN IF NOT EXISTS google_ads_customer_id text;

CREATE INDEX IF NOT EXISTS webandsystem_list_gsc_site_url_idx
  ON public.webandsystem_list (gsc_site_url);
CREATE INDEX IF NOT EXISTS webandsystem_list_gads_customer_idx
  ON public.webandsystem_list (google_ads_customer_id);

-- GSC properties visible to the OAuth user
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

-- Daily Search Analytics (query grain; page/country/device rolled into query totals per day)
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

-- Managed SEO keyword inventory
CREATE TABLE IF NOT EXISTS public.seo_keywords (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_profile_id    text NOT NULL REFERENCES public.webandsystem_list(id) ON DELETE CASCADE,
  keyword               text NOT NULL,
  normalized_keyword    text NOT NULL,
  level                 text NOT NULL DEFAULT 'level_3'
                        CHECK (level IN ('level_1', 'level_2', 'level_3')),
  search_volume         integer,
  current_ranking       numeric,
  target_ranking        integer,
  target_page           text,
  difficulty_score      integer,
  status                text NOT NULL DEFAULT 'monitoring'
                        CHECK (status IN ('monitoring', 'optimizing', 'achieved', 'paused')),
  ai_generated          boolean NOT NULL DEFAULT false,
  source                text NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual', 'gsc', 'ads', 'import')),
  gsc_site_url          text,
  last_gsc_sync_at      timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (website_profile_id, normalized_keyword)
);

CREATE INDEX IF NOT EXISTS seo_keywords_website_idx
  ON public.seo_keywords (website_profile_id);
CREATE INDEX IF NOT EXISTS seo_keywords_status_idx
  ON public.seo_keywords (status);
CREATE INDEX IF NOT EXISTS seo_keywords_normalized_idx
  ON public.seo_keywords (normalized_keyword);

ALTER TABLE public.seo_keywords ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on seo_keywords" ON public.seo_keywords;
CREATE POLICY "Allow select on seo_keywords"
  ON public.seo_keywords FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on seo_keywords" ON public.seo_keywords;
CREATE POLICY "Allow insert on seo_keywords"
  ON public.seo_keywords FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on seo_keywords" ON public.seo_keywords;
CREATE POLICY "Allow update on seo_keywords"
  ON public.seo_keywords FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on seo_keywords" ON public.seo_keywords;
CREATE POLICY "Allow delete on seo_keywords"
  ON public.seo_keywords FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_keywords TO anon, authenticated;
GRANT ALL ON public.seo_keywords TO service_role;

-- Ranking history (GSC average position snapshots)
CREATE TABLE IF NOT EXISTS public.seo_ranking_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id            uuid NOT NULL REFERENCES public.seo_keywords(id) ON DELETE CASCADE,
  metric_date           date NOT NULL,
  ranking_position      numeric,
  clicks                numeric NOT NULL DEFAULT 0,
  impressions           numeric NOT NULL DEFAULT 0,
  ctr                   numeric,
  source                text NOT NULL DEFAULT 'gsc',
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (keyword_id, metric_date, source)
);

CREATE INDEX IF NOT EXISTS seo_ranking_history_keyword_date_idx
  ON public.seo_ranking_history (keyword_id, metric_date DESC);

ALTER TABLE public.seo_ranking_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on seo_ranking_history" ON public.seo_ranking_history;
CREATE POLICY "Allow select on seo_ranking_history"
  ON public.seo_ranking_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on seo_ranking_history" ON public.seo_ranking_history;
CREATE POLICY "Allow insert on seo_ranking_history"
  ON public.seo_ranking_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on seo_ranking_history" ON public.seo_ranking_history;
CREATE POLICY "Allow update on seo_ranking_history"
  ON public.seo_ranking_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on seo_ranking_history" ON public.seo_ranking_history;
CREATE POLICY "Allow delete on seo_ranking_history"
  ON public.seo_ranking_history FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_ranking_history TO anon, authenticated;
GRANT ALL ON public.seo_ranking_history TO service_role;

-- SEO upgrade / action records
CREATE TABLE IF NOT EXISTS public.seo_upgrades (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_profile_id    text NOT NULL REFERENCES public.webandsystem_list(id) ON DELETE CASCADE,
  upgrade_type          text NOT NULL DEFAULT 'other',
  supplier              text,
  cost                  numeric NOT NULL DEFAULT 0,
  currency              text NOT NULL DEFAULT 'HKD',
  start_date            date,
  end_date              date,
  staff_name            text,
  hours_spent           numeric NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'completed', 'cancelled')),
  keyword_id            uuid REFERENCES public.seo_keywords(id) ON DELETE SET NULL,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seo_upgrades_website_idx
  ON public.seo_upgrades (website_profile_id);
CREATE INDEX IF NOT EXISTS seo_upgrades_status_idx
  ON public.seo_upgrades (status);

ALTER TABLE public.seo_upgrades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on seo_upgrades" ON public.seo_upgrades;
CREATE POLICY "Allow select on seo_upgrades"
  ON public.seo_upgrades FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on seo_upgrades" ON public.seo_upgrades;
CREATE POLICY "Allow insert on seo_upgrades"
  ON public.seo_upgrades FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on seo_upgrades" ON public.seo_upgrades;
CREATE POLICY "Allow update on seo_upgrades"
  ON public.seo_upgrades FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on seo_upgrades" ON public.seo_upgrades;
CREATE POLICY "Allow delete on seo_upgrades"
  ON public.seo_upgrades FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_upgrades TO anon, authenticated;
GRANT ALL ON public.seo_upgrades TO service_role;

-- Sync run log
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

ALTER TABLE public.gsc_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on gsc_sync_runs" ON public.gsc_sync_runs;
CREATE POLICY "Allow select on gsc_sync_runs"
  ON public.gsc_sync_runs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on gsc_sync_runs" ON public.gsc_sync_runs;
CREATE POLICY "Allow insert on gsc_sync_runs"
  ON public.gsc_sync_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on gsc_sync_runs" ON public.gsc_sync_runs;
CREATE POLICY "Allow update on gsc_sync_runs"
  ON public.gsc_sync_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gsc_sync_runs TO anon, authenticated;
GRANT ALL ON public.gsc_sync_runs TO service_role;

-- Google Ads keyword daily metrics (Phase 3 warehouse; sync wired later)
CREATE TABLE IF NOT EXISTS public.google_ads_keyword_daily_metrics (
  customer_id           text NOT NULL,
  campaign_id           text NOT NULL,
  ad_group_id           text NOT NULL,
  criterion_id          text NOT NULL,
  keyword_text          text NOT NULL,
  match_type            text,
  metric_date           date NOT NULL,
  impressions           bigint NOT NULL DEFAULT 0,
  clicks                bigint NOT NULL DEFAULT 0,
  cost_micros           bigint NOT NULL DEFAULT 0,
  conversions           numeric NOT NULL DEFAULT 0,
  quality_score         integer,
  normalized_keyword    text NOT NULL DEFAULT '',
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, campaign_id, ad_group_id, criterion_id, metric_date)
);

CREATE INDEX IF NOT EXISTS gads_kw_daily_norm_idx
  ON public.google_ads_keyword_daily_metrics (normalized_keyword);
CREATE INDEX IF NOT EXISTS gads_kw_daily_date_idx
  ON public.google_ads_keyword_daily_metrics (metric_date);

ALTER TABLE public.google_ads_keyword_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on google_ads_keyword_daily_metrics" ON public.google_ads_keyword_daily_metrics;
CREATE POLICY "Allow select on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on google_ads_keyword_daily_metrics" ON public.google_ads_keyword_daily_metrics;
CREATE POLICY "Allow insert on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on google_ads_keyword_daily_metrics" ON public.google_ads_keyword_daily_metrics;
CREATE POLICY "Allow update on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on google_ads_keyword_daily_metrics" ON public.google_ads_keyword_daily_metrics;
CREATE POLICY "Allow delete on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_keyword_daily_metrics TO anon, authenticated;
GRANT ALL ON public.google_ads_keyword_daily_metrics TO service_role;
