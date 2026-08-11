-- Google Ads campaign breakdown warehouse: ad groups, keywords (enhance), search terms
-- Used by campaign detail page panels.

-- ---------------------------------------------------------------------------
-- Ad group daily metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_ad_group_daily_metrics (
  customer_id          text NOT NULL,
  campaign_id          text NOT NULL,
  ad_group_id          text NOT NULL,
  ad_group_name        text NOT NULL DEFAULT '',
  status               text,
  ad_group_type        text,
  metric_date          date NOT NULL,
  impressions          bigint NOT NULL DEFAULT 0,
  clicks               bigint NOT NULL DEFAULT 0,
  cost_micros          bigint NOT NULL DEFAULT 0,
  conversions          numeric NOT NULL DEFAULT 0,
  ctr                  numeric,
  average_cpc_micros   bigint,
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, campaign_id, ad_group_id, metric_date)
);

CREATE INDEX IF NOT EXISTS gads_ad_group_daily_campaign_date_idx
  ON public.google_ads_ad_group_daily_metrics (customer_id, campaign_id, metric_date);
CREATE INDEX IF NOT EXISTS gads_ad_group_daily_date_idx
  ON public.google_ads_ad_group_daily_metrics (metric_date);

ALTER TABLE public.google_ads_ad_group_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on google_ads_ad_group_daily_metrics"
  ON public.google_ads_ad_group_daily_metrics;
CREATE POLICY "Allow select on google_ads_ad_group_daily_metrics"
  ON public.google_ads_ad_group_daily_metrics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on google_ads_ad_group_daily_metrics"
  ON public.google_ads_ad_group_daily_metrics;
CREATE POLICY "Allow insert on google_ads_ad_group_daily_metrics"
  ON public.google_ads_ad_group_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on google_ads_ad_group_daily_metrics"
  ON public.google_ads_ad_group_daily_metrics;
CREATE POLICY "Allow update on google_ads_ad_group_daily_metrics"
  ON public.google_ads_ad_group_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on google_ads_ad_group_daily_metrics"
  ON public.google_ads_ad_group_daily_metrics;
CREATE POLICY "Allow delete on google_ads_ad_group_daily_metrics"
  ON public.google_ads_ad_group_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_ad_group_daily_metrics TO anon, authenticated;
GRANT ALL ON public.google_ads_ad_group_daily_metrics TO service_role;

-- ---------------------------------------------------------------------------
-- Keyword daily metrics (create if missing from earlier GSC migration; add status)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_keyword_daily_metrics (
  customer_id           text NOT NULL,
  campaign_id           text NOT NULL,
  ad_group_id           text NOT NULL,
  criterion_id          text NOT NULL,
  keyword_text          text NOT NULL,
  match_type            text,
  status                text,
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

ALTER TABLE public.google_ads_keyword_daily_metrics
  ADD COLUMN IF NOT EXISTS status text;

CREATE INDEX IF NOT EXISTS gads_kw_daily_norm_idx
  ON public.google_ads_keyword_daily_metrics (normalized_keyword);
CREATE INDEX IF NOT EXISTS gads_kw_daily_date_idx
  ON public.google_ads_keyword_daily_metrics (metric_date);
CREATE INDEX IF NOT EXISTS gads_kw_daily_campaign_date_idx
  ON public.google_ads_keyword_daily_metrics (customer_id, campaign_id, metric_date);

ALTER TABLE public.google_ads_keyword_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics;
CREATE POLICY "Allow select on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics;
CREATE POLICY "Allow insert on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics;
CREATE POLICY "Allow update on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics;
CREATE POLICY "Allow delete on google_ads_keyword_daily_metrics"
  ON public.google_ads_keyword_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_keyword_daily_metrics TO anon, authenticated;
GRANT ALL ON public.google_ads_keyword_daily_metrics TO service_role;

-- ---------------------------------------------------------------------------
-- Search term daily metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_ads_search_term_daily_metrics (
  customer_id              text NOT NULL,
  campaign_id              text NOT NULL,
  ad_group_id              text NOT NULL,
  search_term              text NOT NULL,
  metric_date              date NOT NULL,
  keyword_text             text,
  match_type               text,
  search_term_status       text,
  search_term_match_type   text,
  impressions              bigint NOT NULL DEFAULT 0,
  clicks                   bigint NOT NULL DEFAULT 0,
  cost_micros              bigint NOT NULL DEFAULT 0,
  conversions              numeric NOT NULL DEFAULT 0,
  ctr                      numeric,
  average_cpc_micros       bigint,
  last_synced_at           timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, campaign_id, ad_group_id, search_term, metric_date)
);

CREATE INDEX IF NOT EXISTS gads_search_term_daily_campaign_date_idx
  ON public.google_ads_search_term_daily_metrics (customer_id, campaign_id, metric_date);
CREATE INDEX IF NOT EXISTS gads_search_term_daily_date_idx
  ON public.google_ads_search_term_daily_metrics (metric_date);

ALTER TABLE public.google_ads_search_term_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on google_ads_search_term_daily_metrics"
  ON public.google_ads_search_term_daily_metrics;
CREATE POLICY "Allow select on google_ads_search_term_daily_metrics"
  ON public.google_ads_search_term_daily_metrics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on google_ads_search_term_daily_metrics"
  ON public.google_ads_search_term_daily_metrics;
CREATE POLICY "Allow insert on google_ads_search_term_daily_metrics"
  ON public.google_ads_search_term_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on google_ads_search_term_daily_metrics"
  ON public.google_ads_search_term_daily_metrics;
CREATE POLICY "Allow update on google_ads_search_term_daily_metrics"
  ON public.google_ads_search_term_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on google_ads_search_term_daily_metrics"
  ON public.google_ads_search_term_daily_metrics;
CREATE POLICY "Allow delete on google_ads_search_term_daily_metrics"
  ON public.google_ads_search_term_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_search_term_daily_metrics TO anon, authenticated;
GRANT ALL ON public.google_ads_search_term_daily_metrics TO service_role;

-- ---------------------------------------------------------------------------
-- Aggregate RPCs for campaign detail panels
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.google_ads_ad_group_metrics_for_campaign(
  p_customer_id text,
  p_campaign_id text,
  p_from date,
  p_to date
)
RETURNS TABLE (
  ad_group_id text,
  ad_group_name text,
  status text,
  ad_group_type text,
  impressions bigint,
  clicks bigint,
  cost_micros bigint,
  conversions numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.ad_group_id,
    COALESCE(
      NULLIF(MAX(m.ad_group_name), ''),
      m.ad_group_id
    ) AS ad_group_name,
    MAX(m.status) AS status,
    MAX(m.ad_group_type) AS ad_group_type,
    SUM(m.impressions)::bigint AS impressions,
    SUM(m.clicks)::bigint AS clicks,
    SUM(m.cost_micros)::bigint AS cost_micros,
    SUM(m.conversions) AS conversions
  FROM public.google_ads_ad_group_daily_metrics m
  WHERE m.customer_id = p_customer_id
    AND m.campaign_id = p_campaign_id
    AND m.metric_date >= p_from
    AND m.metric_date <= p_to
  GROUP BY m.ad_group_id
  ORDER BY SUM(m.cost_micros) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.google_ads_ad_group_metrics_for_campaign(text, text, date, date)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.google_ads_keyword_metrics_for_campaign(
  p_customer_id text,
  p_campaign_id text,
  p_from date,
  p_to date
)
RETURNS TABLE (
  ad_group_id text,
  criterion_id text,
  keyword_text text,
  match_type text,
  status text,
  quality_score integer,
  impressions bigint,
  clicks bigint,
  cost_micros bigint,
  conversions numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.ad_group_id,
    m.criterion_id,
    COALESCE(NULLIF(MAX(m.keyword_text), ''), m.criterion_id) AS keyword_text,
    MAX(m.match_type) AS match_type,
    MAX(m.status) AS status,
    MAX(m.quality_score) AS quality_score,
    SUM(m.impressions)::bigint AS impressions,
    SUM(m.clicks)::bigint AS clicks,
    SUM(m.cost_micros)::bigint AS cost_micros,
    SUM(m.conversions) AS conversions
  FROM public.google_ads_keyword_daily_metrics m
  WHERE m.customer_id = p_customer_id
    AND m.campaign_id = p_campaign_id
    AND m.metric_date >= p_from
    AND m.metric_date <= p_to
  GROUP BY m.ad_group_id, m.criterion_id
  ORDER BY SUM(m.cost_micros) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.google_ads_keyword_metrics_for_campaign(text, text, date, date)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.google_ads_search_term_metrics_for_campaign(
  p_customer_id text,
  p_campaign_id text,
  p_from date,
  p_to date,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  ad_group_id text,
  search_term text,
  keyword_text text,
  match_type text,
  search_term_status text,
  search_term_match_type text,
  impressions bigint,
  clicks bigint,
  cost_micros bigint,
  conversions numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.ad_group_id,
    m.search_term,
    MAX(m.keyword_text) AS keyword_text,
    MAX(m.match_type) AS match_type,
    MAX(m.search_term_status) AS search_term_status,
    MAX(m.search_term_match_type) AS search_term_match_type,
    SUM(m.impressions)::bigint AS impressions,
    SUM(m.clicks)::bigint AS clicks,
    SUM(m.cost_micros)::bigint AS cost_micros,
    SUM(m.conversions) AS conversions
  FROM public.google_ads_search_term_daily_metrics m
  WHERE m.customer_id = p_customer_id
    AND m.campaign_id = p_campaign_id
    AND m.metric_date >= p_from
    AND m.metric_date <= p_to
  GROUP BY m.ad_group_id, m.search_term
  ORDER BY SUM(m.cost_micros) DESC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

GRANT EXECUTE ON FUNCTION public.google_ads_search_term_metrics_for_campaign(text, text, date, date, integer)
  TO anon, authenticated, service_role;
