-- ============================================================
-- Facebook / Meta Ads warehouse (multi Business Manager tokens)
-- Target project: kwcevjcmdjadhrygjyfp (MPS production)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.facebook_ads_accounts (
  ad_account_id      text PRIMARY KEY, -- act_XXXXXXXX
  account_name       text NOT NULL DEFAULT '',
  currency_code      text,
  time_zone          text,
  status             text NOT NULL DEFAULT 'UNKNOWN',
  account_status     integer,
  business_key       text NOT NULL DEFAULT '',
  business_name      text NOT NULL DEFAULT '',
  last_synced_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facebook_ads_accounts_business_idx
  ON public.facebook_ads_accounts (business_key);
CREATE INDEX IF NOT EXISTS facebook_ads_accounts_status_idx
  ON public.facebook_ads_accounts (status);

ALTER TABLE public.facebook_ads_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on facebook_ads_accounts"
  ON public.facebook_ads_accounts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on facebook_ads_accounts"
  ON public.facebook_ads_accounts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on facebook_ads_accounts"
  ON public.facebook_ads_accounts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on facebook_ads_accounts"
  ON public.facebook_ads_accounts FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_ads_accounts TO anon, authenticated;
GRANT ALL ON public.facebook_ads_accounts TO service_role;

CREATE TABLE IF NOT EXISTS public.facebook_ads_campaigns (
  id                 text PRIMARY KEY, -- {ad_account_id}:{campaign_id}
  ad_account_id      text NOT NULL REFERENCES public.facebook_ads_accounts(ad_account_id) ON DELETE CASCADE,
  campaign_id        text NOT NULL,
  campaign_name      text NOT NULL DEFAULT '',
  status             text NOT NULL DEFAULT 'UNKNOWN',
  objective          text,
  impressions        bigint NOT NULL DEFAULT 0,
  clicks             bigint NOT NULL DEFAULT 0,
  spend_micros       bigint NOT NULL DEFAULT 0,
  conversions        numeric NOT NULL DEFAULT 0,
  ctr                numeric,
  average_cpc_micros bigint,
  last_synced_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS facebook_ads_campaigns_account_idx
  ON public.facebook_ads_campaigns (ad_account_id);
CREATE INDEX IF NOT EXISTS facebook_ads_campaigns_status_idx
  ON public.facebook_ads_campaigns (status);
CREATE INDEX IF NOT EXISTS facebook_ads_campaigns_spend_idx
  ON public.facebook_ads_campaigns (spend_micros DESC);

ALTER TABLE public.facebook_ads_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on facebook_ads_campaigns"
  ON public.facebook_ads_campaigns FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on facebook_ads_campaigns"
  ON public.facebook_ads_campaigns FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on facebook_ads_campaigns"
  ON public.facebook_ads_campaigns FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on facebook_ads_campaigns"
  ON public.facebook_ads_campaigns FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_ads_campaigns TO anon, authenticated;
GRANT ALL ON public.facebook_ads_campaigns TO service_role;

CREATE TABLE IF NOT EXISTS public.facebook_ads_campaign_daily_metrics (
  ad_account_id        text NOT NULL,
  campaign_id          text NOT NULL,
  metric_date          date NOT NULL,
  impressions          bigint NOT NULL DEFAULT 0,
  clicks               bigint NOT NULL DEFAULT 0,
  spend_micros         bigint NOT NULL DEFAULT 0,
  conversions          numeric NOT NULL DEFAULT 0,
  ctr                  numeric,
  average_cpc_micros   bigint,
  last_synced_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_account_id, campaign_id, metric_date)
);

CREATE INDEX IF NOT EXISTS facebook_ads_daily_metrics_date_idx
  ON public.facebook_ads_campaign_daily_metrics (metric_date);
CREATE INDEX IF NOT EXISTS facebook_ads_daily_metrics_account_date_idx
  ON public.facebook_ads_campaign_daily_metrics (ad_account_id, metric_date);

ALTER TABLE public.facebook_ads_campaign_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on facebook_ads_campaign_daily_metrics"
  ON public.facebook_ads_campaign_daily_metrics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on facebook_ads_campaign_daily_metrics"
  ON public.facebook_ads_campaign_daily_metrics FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on facebook_ads_campaign_daily_metrics"
  ON public.facebook_ads_campaign_daily_metrics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on facebook_ads_campaign_daily_metrics"
  ON public.facebook_ads_campaign_daily_metrics FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_ads_campaign_daily_metrics TO anon, authenticated;
GRANT ALL ON public.facebook_ads_campaign_daily_metrics TO service_role;

CREATE TABLE IF NOT EXISTS public.facebook_ads_sync_runs (
  id               text PRIMARY KEY,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  status           text NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'success', 'error')),
  accounts_synced  integer NOT NULL DEFAULT 0,
  campaigns_synced integer NOT NULL DEFAULT 0,
  error_message    text,
  meta             jsonb
);

ALTER TABLE public.facebook_ads_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on facebook_ads_sync_runs"
  ON public.facebook_ads_sync_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on facebook_ads_sync_runs"
  ON public.facebook_ads_sync_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on facebook_ads_sync_runs"
  ON public.facebook_ads_sync_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_ads_sync_runs TO anon, authenticated;
GRANT ALL ON public.facebook_ads_sync_runs TO service_role;

CREATE TABLE IF NOT EXISTS public.facebook_ads_backfill_jobs (
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

CREATE INDEX IF NOT EXISTS facebook_ads_backfill_jobs_status_idx
  ON public.facebook_ads_backfill_jobs (status);

ALTER TABLE public.facebook_ads_backfill_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on facebook_ads_backfill_jobs"
  ON public.facebook_ads_backfill_jobs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on facebook_ads_backfill_jobs"
  ON public.facebook_ads_backfill_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on facebook_ads_backfill_jobs"
  ON public.facebook_ads_backfill_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on facebook_ads_backfill_jobs"
  ON public.facebook_ads_backfill_jobs FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_ads_backfill_jobs TO anon, authenticated;
GRANT ALL ON public.facebook_ads_backfill_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.facebook_ads_campaign_metrics_range(
  p_from date,
  p_to date
)
RETURNS TABLE (
  ad_account_id text,
  campaign_id text,
  impressions bigint,
  clicks bigint,
  spend_micros bigint,
  conversions numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.ad_account_id,
    m.campaign_id,
    SUM(m.impressions)::bigint AS impressions,
    SUM(m.clicks)::bigint AS clicks,
    SUM(m.spend_micros)::bigint AS spend_micros,
    SUM(m.conversions) AS conversions
  FROM public.facebook_ads_campaign_daily_metrics m
  WHERE m.metric_date >= p_from
    AND m.metric_date <= p_to
  GROUP BY m.ad_account_id, m.campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.facebook_ads_campaign_metrics_range(date, date) TO anon, authenticated, service_role;
