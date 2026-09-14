-- GSC report warehouse: property totals and page grain
-- Query grain already lives in gsc_query_daily_metrics.

CREATE TABLE IF NOT EXISTS public.gsc_site_daily_metrics (
  site_url              text NOT NULL REFERENCES public.gsc_sites(site_url) ON DELETE CASCADE,
  metric_date           date NOT NULL,
  clicks                numeric NOT NULL DEFAULT 0,
  impressions           numeric NOT NULL DEFAULT 0,
  ctr                   numeric,
  position              numeric,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_url, metric_date)
);

CREATE INDEX IF NOT EXISTS gsc_site_daily_date_idx
  ON public.gsc_site_daily_metrics (metric_date);

ALTER TABLE public.gsc_site_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on gsc_site_daily_metrics" ON public.gsc_site_daily_metrics;
CREATE POLICY "Allow select on gsc_site_daily_metrics"
  ON public.gsc_site_daily_metrics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on gsc_site_daily_metrics" ON public.gsc_site_daily_metrics;
CREATE POLICY "Allow insert on gsc_site_daily_metrics"
  ON public.gsc_site_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on gsc_site_daily_metrics" ON public.gsc_site_daily_metrics;
CREATE POLICY "Allow update on gsc_site_daily_metrics"
  ON public.gsc_site_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on gsc_site_daily_metrics" ON public.gsc_site_daily_metrics;
CREATE POLICY "Allow delete on gsc_site_daily_metrics"
  ON public.gsc_site_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gsc_site_daily_metrics TO anon, authenticated;
GRANT ALL ON public.gsc_site_daily_metrics TO service_role;

CREATE TABLE IF NOT EXISTS public.gsc_page_daily_metrics (
  site_url              text NOT NULL REFERENCES public.gsc_sites(site_url) ON DELETE CASCADE,
  page                  text NOT NULL,
  metric_date           date NOT NULL,
  clicks                numeric NOT NULL DEFAULT 0,
  impressions           numeric NOT NULL DEFAULT 0,
  ctr                   numeric,
  position              numeric,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_url, page, metric_date)
);

CREATE INDEX IF NOT EXISTS gsc_page_daily_date_idx
  ON public.gsc_page_daily_metrics (metric_date);
CREATE INDEX IF NOT EXISTS gsc_page_daily_page_idx
  ON public.gsc_page_daily_metrics (page);

ALTER TABLE public.gsc_page_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on gsc_page_daily_metrics" ON public.gsc_page_daily_metrics;
CREATE POLICY "Allow select on gsc_page_daily_metrics"
  ON public.gsc_page_daily_metrics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on gsc_page_daily_metrics" ON public.gsc_page_daily_metrics;
CREATE POLICY "Allow insert on gsc_page_daily_metrics"
  ON public.gsc_page_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on gsc_page_daily_metrics" ON public.gsc_page_daily_metrics;
CREATE POLICY "Allow update on gsc_page_daily_metrics"
  ON public.gsc_page_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on gsc_page_daily_metrics" ON public.gsc_page_daily_metrics;
CREATE POLICY "Allow delete on gsc_page_daily_metrics"
  ON public.gsc_page_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gsc_page_daily_metrics TO anon, authenticated;
GRANT ALL ON public.gsc_page_daily_metrics TO service_role;

-- Prefer site-level Search Analytics totals; fall back to query-grain rollup.
CREATE OR REPLACE FUNCTION public.gsc_site_metrics_range(
  p_from date,
  p_to date
)
RETURNS TABLE (
  site_url text,
  clicks numeric,
  impressions numeric,
  position_weighted numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH site_daily AS (
    SELECT
      m.site_url,
      SUM(m.clicks) AS clicks,
      SUM(m.impressions) AS impressions,
      SUM(COALESCE(m.position, 0) * m.impressions) AS position_weighted
    FROM public.gsc_site_daily_metrics m
    WHERE m.metric_date >= p_from
      AND m.metric_date <= p_to
    GROUP BY m.site_url
  ),
  query_daily AS (
    SELECT
      m.site_url,
      SUM(m.clicks) AS clicks,
      SUM(m.impressions) AS impressions,
      SUM(COALESCE(m.position, 0) * m.impressions) AS position_weighted
    FROM public.gsc_query_daily_metrics m
    WHERE m.metric_date >= p_from
      AND m.metric_date <= p_to
    GROUP BY m.site_url
  )
  SELECT
    COALESCE(s.site_url, q.site_url) AS site_url,
    COALESCE(s.clicks, q.clicks) AS clicks,
    COALESCE(s.impressions, q.impressions) AS impressions,
    COALESCE(s.position_weighted, q.position_weighted) AS position_weighted
  FROM site_daily s
  FULL OUTER JOIN query_daily q ON q.site_url = s.site_url
$$;

GRANT EXECUTE ON FUNCTION public.gsc_site_metrics_range(date, date) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gsc_site_daily_range(
  p_site_url text,
  p_from date,
  p_to date
)
RETURNS TABLE (
  metric_date date,
  clicks numeric,
  impressions numeric,
  position_weighted numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH site_daily AS (
    SELECT
      m.metric_date,
      SUM(m.clicks) AS clicks,
      SUM(m.impressions) AS impressions,
      SUM(COALESCE(m.position, 0) * m.impressions) AS position_weighted
    FROM public.gsc_site_daily_metrics m
    WHERE m.site_url = p_site_url
      AND m.metric_date >= p_from
      AND m.metric_date <= p_to
    GROUP BY m.metric_date
  ),
  query_daily AS (
    SELECT
      m.metric_date,
      SUM(m.clicks) AS clicks,
      SUM(m.impressions) AS impressions,
      SUM(COALESCE(m.position, 0) * m.impressions) AS position_weighted
    FROM public.gsc_query_daily_metrics m
    WHERE m.site_url = p_site_url
      AND m.metric_date >= p_from
      AND m.metric_date <= p_to
    GROUP BY m.metric_date
  )
  SELECT
    COALESCE(s.metric_date, q.metric_date) AS metric_date,
    COALESCE(s.clicks, q.clicks) AS clicks,
    COALESCE(s.impressions, q.impressions) AS impressions,
    COALESCE(s.position_weighted, q.position_weighted) AS position_weighted
  FROM site_daily s
  FULL OUTER JOIN query_daily q ON q.metric_date = s.metric_date
  ORDER BY 1
$$;

GRANT EXECUTE ON FUNCTION public.gsc_site_daily_range(text, date, date) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gsc_top_queries_range(
  p_site_url text,
  p_from date,
  p_to date,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  query text,
  clicks numeric,
  impressions numeric,
  position_weighted numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.query,
    SUM(m.clicks) AS clicks,
    SUM(m.impressions) AS impressions,
    SUM(COALESCE(m.position, 0) * m.impressions) AS position_weighted
  FROM public.gsc_query_daily_metrics m
  WHERE m.site_url = p_site_url
    AND m.metric_date >= p_from
    AND m.metric_date <= p_to
    AND m.query <> ''
  GROUP BY m.query
  ORDER BY SUM(m.clicks) DESC, SUM(m.impressions) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
$$;

GRANT EXECUTE ON FUNCTION public.gsc_top_queries_range(text, date, date, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gsc_top_pages_range(
  p_site_url text,
  p_from date,
  p_to date,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  page text,
  clicks numeric,
  impressions numeric,
  position_weighted numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.page,
    SUM(m.clicks) AS clicks,
    SUM(m.impressions) AS impressions,
    SUM(COALESCE(m.position, 0) * m.impressions) AS position_weighted
  FROM public.gsc_page_daily_metrics m
  WHERE m.site_url = p_site_url
    AND m.metric_date >= p_from
    AND m.metric_date <= p_to
    AND m.page <> ''
  GROUP BY m.page
  ORDER BY SUM(m.clicks) DESC, SUM(m.impressions) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
$$;

GRANT EXECUTE ON FUNCTION public.gsc_top_pages_range(text, date, date, integer) TO anon, authenticated, service_role;
