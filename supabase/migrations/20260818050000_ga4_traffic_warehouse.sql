-- ============================================================
-- Google Analytics 4 traffic warehouse
-- ============================================================

ALTER TABLE public.webandsystem_list
  ADD COLUMN IF NOT EXISTS ga4_property_id text;

CREATE INDEX IF NOT EXISTS webandsystem_list_ga4_property_idx
  ON public.webandsystem_list (ga4_property_id);

CREATE TABLE IF NOT EXISTS public.ga4_properties (
  property_id           text PRIMARY KEY,
  account_id            text,
  account_name          text,
  display_name          text,
  stream_uri            text,
  measurement_id        text,
  website_profile_id    text REFERENCES public.webandsystem_list(id) ON DELETE SET NULL,
  matched_domain        text,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ga4_properties_website_idx
  ON public.ga4_properties (website_profile_id);
CREATE INDEX IF NOT EXISTS ga4_properties_account_idx
  ON public.ga4_properties (account_id);

ALTER TABLE public.ga4_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on ga4_properties" ON public.ga4_properties;
CREATE POLICY "Allow select on ga4_properties"
  ON public.ga4_properties FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on ga4_properties" ON public.ga4_properties;
CREATE POLICY "Allow insert on ga4_properties"
  ON public.ga4_properties FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on ga4_properties" ON public.ga4_properties;
CREATE POLICY "Allow update on ga4_properties"
  ON public.ga4_properties FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on ga4_properties" ON public.ga4_properties;
CREATE POLICY "Allow delete on ga4_properties"
  ON public.ga4_properties FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ga4_properties TO anon, authenticated;
GRANT ALL ON public.ga4_properties TO service_role;

CREATE TABLE IF NOT EXISTS public.ga4_property_daily_metrics (
  property_id           text NOT NULL REFERENCES public.ga4_properties(property_id) ON DELETE CASCADE,
  metric_date           date NOT NULL,
  users                 numeric NOT NULL DEFAULT 0,
  new_users             numeric NOT NULL DEFAULT 0,
  sessions              numeric NOT NULL DEFAULT 0,
  pageviews             numeric NOT NULL DEFAULT 0,
  engaged_sessions      numeric NOT NULL DEFAULT 0,
  conversions           numeric NOT NULL DEFAULT 0,
  avg_session_duration  numeric NOT NULL DEFAULT 0,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, metric_date)
);

CREATE INDEX IF NOT EXISTS ga4_property_daily_date_idx
  ON public.ga4_property_daily_metrics (metric_date);
CREATE INDEX IF NOT EXISTS ga4_property_daily_property_date_idx
  ON public.ga4_property_daily_metrics (property_id, metric_date);

ALTER TABLE public.ga4_property_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on ga4_property_daily_metrics" ON public.ga4_property_daily_metrics;
CREATE POLICY "Allow select on ga4_property_daily_metrics"
  ON public.ga4_property_daily_metrics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on ga4_property_daily_metrics" ON public.ga4_property_daily_metrics;
CREATE POLICY "Allow insert on ga4_property_daily_metrics"
  ON public.ga4_property_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on ga4_property_daily_metrics" ON public.ga4_property_daily_metrics;
CREATE POLICY "Allow update on ga4_property_daily_metrics"
  ON public.ga4_property_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on ga4_property_daily_metrics" ON public.ga4_property_daily_metrics;
CREATE POLICY "Allow delete on ga4_property_daily_metrics"
  ON public.ga4_property_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ga4_property_daily_metrics TO anon, authenticated;
GRANT ALL ON public.ga4_property_daily_metrics TO service_role;

CREATE TABLE IF NOT EXISTS public.ga4_channel_daily_metrics (
  property_id           text NOT NULL REFERENCES public.ga4_properties(property_id) ON DELETE CASCADE,
  metric_date           date NOT NULL,
  channel               text NOT NULL,
  sessions              numeric NOT NULL DEFAULT 0,
  users                 numeric NOT NULL DEFAULT 0,
  pageviews             numeric NOT NULL DEFAULT 0,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, metric_date, channel)
);

CREATE INDEX IF NOT EXISTS ga4_channel_daily_date_idx
  ON public.ga4_channel_daily_metrics (metric_date);

ALTER TABLE public.ga4_channel_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on ga4_channel_daily_metrics" ON public.ga4_channel_daily_metrics;
CREATE POLICY "Allow select on ga4_channel_daily_metrics"
  ON public.ga4_channel_daily_metrics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on ga4_channel_daily_metrics" ON public.ga4_channel_daily_metrics;
CREATE POLICY "Allow insert on ga4_channel_daily_metrics"
  ON public.ga4_channel_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on ga4_channel_daily_metrics" ON public.ga4_channel_daily_metrics;
CREATE POLICY "Allow update on ga4_channel_daily_metrics"
  ON public.ga4_channel_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on ga4_channel_daily_metrics" ON public.ga4_channel_daily_metrics;
CREATE POLICY "Allow delete on ga4_channel_daily_metrics"
  ON public.ga4_channel_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ga4_channel_daily_metrics TO anon, authenticated;
GRANT ALL ON public.ga4_channel_daily_metrics TO service_role;

CREATE TABLE IF NOT EXISTS public.ga4_sync_runs (
  id                    text PRIMARY KEY,
  status                text NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'success', 'error')),
  started_at            timestamptz NOT NULL DEFAULT now(),
  finished_at           timestamptz,
  properties_synced     integer NOT NULL DEFAULT 0,
  rows_upserted         integer NOT NULL DEFAULT 0,
  error_message         text,
  meta                  jsonb
);

ALTER TABLE public.ga4_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on ga4_sync_runs" ON public.ga4_sync_runs;
CREATE POLICY "Allow select on ga4_sync_runs"
  ON public.ga4_sync_runs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on ga4_sync_runs" ON public.ga4_sync_runs;
CREATE POLICY "Allow insert on ga4_sync_runs"
  ON public.ga4_sync_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on ga4_sync_runs" ON public.ga4_sync_runs;
CREATE POLICY "Allow update on ga4_sync_runs"
  ON public.ga4_sync_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ga4_sync_runs TO anon, authenticated;
GRANT ALL ON public.ga4_sync_runs TO service_role;

CREATE OR REPLACE FUNCTION public.ga4_property_metrics_range(
  p_from date,
  p_to date
)
RETURNS TABLE (
  property_id text,
  users numeric,
  new_users numeric,
  sessions numeric,
  pageviews numeric,
  engaged_sessions numeric,
  conversions numeric,
  duration_seconds numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.property_id,
    SUM(m.users) AS users,
    SUM(m.new_users) AS new_users,
    SUM(m.sessions) AS sessions,
    SUM(m.pageviews) AS pageviews,
    SUM(m.engaged_sessions) AS engaged_sessions,
    SUM(m.conversions) AS conversions,
    SUM(m.avg_session_duration * m.sessions) AS duration_seconds
  FROM public.ga4_property_daily_metrics m
  WHERE m.metric_date >= p_from
    AND m.metric_date <= p_to
  GROUP BY m.property_id
$$;

GRANT EXECUTE ON FUNCTION public.ga4_property_metrics_range(date, date) TO anon, authenticated, service_role;
