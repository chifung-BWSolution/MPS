-- Restore tables the live app still queries.
-- 20260807120000 dropped upcoming_event as "unused" while dashboard + calendar still use it.
-- gsc_sync_runs / seo_ranking_history were created in 20260805120000 but are missing on
-- the remote (that warehouse file is not in remote migration history).

CREATE TABLE IF NOT EXISTS public.upcoming_event (
  id           text PRIMARY KEY,
  title        text NOT NULL,
  type         text NOT NULL,
  event_date   date NOT NULL,
  company      text NOT NULL DEFAULT '',
  brand        text NOT NULL DEFAULT '',
  platform     text,
  hours        numeric,
  notes        text,
  status       text NOT NULL DEFAULT 'pending_publish',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT upcoming_event_status_check
    CHECK (status IN ('pending_publish', 'published'))
);

CREATE INDEX IF NOT EXISTS upcoming_event_date_idx
  ON public.upcoming_event (event_date);

ALTER TABLE public.upcoming_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for authenticated users" ON public.upcoming_event;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.upcoming_event;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.upcoming_event;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON public.upcoming_event;
DROP POLICY IF EXISTS "Allow anon select on upcoming_event" ON public.upcoming_event;
DROP POLICY IF EXISTS "Allow anon insert on upcoming_event" ON public.upcoming_event;
DROP POLICY IF EXISTS "Allow anon update on upcoming_event" ON public.upcoming_event;
DROP POLICY IF EXISTS "Allow anon delete on upcoming_event" ON public.upcoming_event;

CREATE POLICY "upcoming_event_select_clients"
  ON public.upcoming_event FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "upcoming_event_insert_clients"
  ON public.upcoming_event FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "upcoming_event_update_clients"
  ON public.upcoming_event FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "upcoming_event_delete_clients"
  ON public.upcoming_event FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.upcoming_event TO anon, authenticated;
GRANT ALL ON public.upcoming_event TO service_role;

COMMENT ON TABLE public.upcoming_event IS
  'Manual marketing-calendar events. Recreated after 20260807120000 dropped it while the app still read it.';

CREATE TABLE IF NOT EXISTS public.seo_ranking_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id            text NOT NULL REFERENCES public.seo_keywords(id) ON DELETE CASCADE,
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
DROP POLICY IF EXISTS "Allow insert on seo_ranking_history" ON public.seo_ranking_history;
DROP POLICY IF EXISTS "Allow update on seo_ranking_history" ON public.seo_ranking_history;
DROP POLICY IF EXISTS "Allow delete on seo_ranking_history" ON public.seo_ranking_history;

CREATE POLICY "Allow select on seo_ranking_history"
  ON public.seo_ranking_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on seo_ranking_history"
  ON public.seo_ranking_history FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on seo_ranking_history"
  ON public.seo_ranking_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on seo_ranking_history"
  ON public.seo_ranking_history FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_ranking_history TO anon, authenticated;
GRANT ALL ON public.seo_ranking_history TO service_role;

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
DROP POLICY IF EXISTS "Allow insert on gsc_sync_runs" ON public.gsc_sync_runs;
DROP POLICY IF EXISTS "Allow update on gsc_sync_runs" ON public.gsc_sync_runs;

CREATE POLICY "Allow select on gsc_sync_runs"
  ON public.gsc_sync_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on gsc_sync_runs"
  ON public.gsc_sync_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on gsc_sync_runs"
  ON public.gsc_sync_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gsc_sync_runs TO anon, authenticated;
GRANT ALL ON public.gsc_sync_runs TO service_role;

NOTIFY pgrst, 'reload schema';
