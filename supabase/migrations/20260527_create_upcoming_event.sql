-- ============================================================
-- Upcoming Event (upcoming_event)
-- Stores custom marketing-calendar events created via 新增活動
-- ============================================================

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
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upcoming_event_date_idx
  ON public.upcoming_event (event_date);

ALTER TABLE public.upcoming_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.upcoming_event FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users"
  ON public.upcoming_event FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
  ON public.upcoming_event FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated users"
  ON public.upcoming_event FOR DELETE TO authenticated USING (true);
