-- Google Ads daily metrics warehouse + backfill jobs
-- Target project: kwcevjcmdjadhrygjyfp (MPS production)

CREATE TABLE IF NOT EXISTS public.google_ads_campaign_daily_metrics (
  customer_id          text NOT NULL,
  campaign_id          text NOT NULL,
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
  PRIMARY KEY (customer_id, campaign_id, metric_date)
);

CREATE INDEX IF NOT EXISTS google_ads_daily_metrics_date_idx
  ON public.google_ads_campaign_daily_metrics (metric_date);
CREATE INDEX IF NOT EXISTS google_ads_daily_metrics_customer_date_idx
  ON public.google_ads_campaign_daily_metrics (customer_id, metric_date);

ALTER TABLE public.google_ads_campaign_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on google_ads_campaign_daily_metrics"
  ON public.google_ads_campaign_daily_metrics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on google_ads_campaign_daily_metrics"
  ON public.google_ads_campaign_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on google_ads_campaign_daily_metrics"
  ON public.google_ads_campaign_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on google_ads_campaign_daily_metrics"
  ON public.google_ads_campaign_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_campaign_daily_metrics TO anon, authenticated;
GRANT ALL ON public.google_ads_campaign_daily_metrics TO service_role;

CREATE TABLE IF NOT EXISTS public.google_ads_backfill_jobs (
  id                   text PRIMARY KEY,
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  history_start_date   date NOT NULL,
  history_end_date     date NOT NULL,
  cursor_month         date NOT NULL,
  total_months         integer NOT NULL DEFAULT 0,
  completed_months     integer NOT NULL DEFAULT 0,
  rows_upserted        bigint NOT NULL DEFAULT 0,
  accounts_targeted    integer NOT NULL DEFAULT 0,
  error_count          integer NOT NULL DEFAULT 0,
  last_error           text,
  started_at           timestamptz,
  finished_at          timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  meta                 jsonb
);

CREATE INDEX IF NOT EXISTS google_ads_backfill_jobs_status_idx
  ON public.google_ads_backfill_jobs (status);

ALTER TABLE public.google_ads_backfill_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on google_ads_backfill_jobs"
  ON public.google_ads_backfill_jobs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on google_ads_backfill_jobs"
  ON public.google_ads_backfill_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on google_ads_backfill_jobs"
  ON public.google_ads_backfill_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on google_ads_backfill_jobs"
  ON public.google_ads_backfill_jobs FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_backfill_jobs TO anon, authenticated;
GRANT ALL ON public.google_ads_backfill_jobs TO service_role;

-- Aggregate campaign metrics for a date range (report page)
CREATE OR REPLACE FUNCTION public.google_ads_campaign_metrics_range(
  p_from date,
  p_to date
)
RETURNS TABLE (
  customer_id text,
  campaign_id text,
  impressions bigint,
  clicks bigint,
  cost_micros bigint,
  conversions numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.customer_id,
    m.campaign_id,
    SUM(m.impressions)::bigint AS impressions,
    SUM(m.clicks)::bigint AS clicks,
    SUM(m.cost_micros)::bigint AS cost_micros,
    SUM(m.conversions) AS conversions
  FROM public.google_ads_campaign_daily_metrics m
  WHERE m.metric_date >= p_from
    AND m.metric_date <= p_to
  GROUP BY m.customer_id, m.campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.google_ads_campaign_metrics_range(date, date) TO anon, authenticated, service_role;
