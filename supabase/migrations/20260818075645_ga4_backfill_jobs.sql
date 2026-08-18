-- GA4 historical backfill jobs (monthly cursor, same shape as google_ads_backfill_jobs)

CREATE TABLE IF NOT EXISTS public.ga4_backfill_jobs (
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

CREATE INDEX IF NOT EXISTS ga4_backfill_jobs_status_idx
  ON public.ga4_backfill_jobs (status);

ALTER TABLE public.ga4_backfill_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on ga4_backfill_jobs" ON public.ga4_backfill_jobs;
CREATE POLICY "Allow select on ga4_backfill_jobs"
  ON public.ga4_backfill_jobs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert on ga4_backfill_jobs" ON public.ga4_backfill_jobs;
CREATE POLICY "Allow insert on ga4_backfill_jobs"
  ON public.ga4_backfill_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update on ga4_backfill_jobs" ON public.ga4_backfill_jobs;
CREATE POLICY "Allow update on ga4_backfill_jobs"
  ON public.ga4_backfill_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete on ga4_backfill_jobs" ON public.ga4_backfill_jobs;
CREATE POLICY "Allow delete on ga4_backfill_jobs"
  ON public.ga4_backfill_jobs FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ga4_backfill_jobs TO anon, authenticated;
GRANT ALL ON public.ga4_backfill_jobs TO service_role;
