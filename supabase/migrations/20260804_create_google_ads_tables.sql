-- ============================================================
-- Google Ads sync tables (MCC Franco Lee / read-only reporting)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.google_ads_accounts (
  customer_id        text PRIMARY KEY,
  descriptive_name   text NOT NULL DEFAULT '',
  currency_code      text,
  time_zone          text,
  status             text NOT NULL DEFAULT 'UNKNOWN',
  is_manager         boolean NOT NULL DEFAULT false,
  level              integer NOT NULL DEFAULT 0,
  manager_customer_id text,
  last_synced_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_ads_accounts_manager_idx
  ON public.google_ads_accounts (manager_customer_id);
CREATE INDEX IF NOT EXISTS google_ads_accounts_status_idx
  ON public.google_ads_accounts (status);

ALTER TABLE public.google_ads_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on google_ads_accounts"
  ON public.google_ads_accounts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on google_ads_accounts"
  ON public.google_ads_accounts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on google_ads_accounts"
  ON public.google_ads_accounts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on google_ads_accounts"
  ON public.google_ads_accounts FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_accounts TO anon, authenticated;
GRANT ALL ON public.google_ads_accounts TO service_role;

CREATE TABLE IF NOT EXISTS public.google_ads_campaigns (
  id                 text PRIMARY KEY, -- {customer_id}:{campaign_id}
  customer_id        text NOT NULL REFERENCES public.google_ads_accounts(customer_id) ON DELETE CASCADE,
  campaign_id        text NOT NULL,
  campaign_name      text NOT NULL DEFAULT '',
  status             text NOT NULL DEFAULT 'UNKNOWN',
  advertising_channel_type text,
  impressions        bigint NOT NULL DEFAULT 0,
  clicks             bigint NOT NULL DEFAULT 0,
  cost_micros        bigint NOT NULL DEFAULT 0,
  conversions        numeric NOT NULL DEFAULT 0,
  ctr                numeric,
  average_cpc_micros bigint,
  metrics_start_date date,
  metrics_end_date   date,
  last_synced_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS google_ads_campaigns_customer_idx
  ON public.google_ads_campaigns (customer_id);
CREATE INDEX IF NOT EXISTS google_ads_campaigns_status_idx
  ON public.google_ads_campaigns (status);
CREATE INDEX IF NOT EXISTS google_ads_campaigns_cost_idx
  ON public.google_ads_campaigns (cost_micros DESC);

ALTER TABLE public.google_ads_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on google_ads_campaigns"
  ON public.google_ads_campaigns FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on google_ads_campaigns"
  ON public.google_ads_campaigns FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on google_ads_campaigns"
  ON public.google_ads_campaigns FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on google_ads_campaigns"
  ON public.google_ads_campaigns FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_campaigns TO anon, authenticated;
GRANT ALL ON public.google_ads_campaigns TO service_role;

CREATE TABLE IF NOT EXISTS public.google_ads_sync_runs (
  id             text PRIMARY KEY,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'success', 'error')),
  accounts_synced integer NOT NULL DEFAULT 0,
  campaigns_synced integer NOT NULL DEFAULT 0,
  error_message  text,
  meta           jsonb
);

ALTER TABLE public.google_ads_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on google_ads_sync_runs"
  ON public.google_ads_sync_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on google_ads_sync_runs"
  ON public.google_ads_sync_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on google_ads_sync_runs"
  ON public.google_ads_sync_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_sync_runs TO anon, authenticated;
GRANT ALL ON public.google_ads_sync_runs TO service_role;
