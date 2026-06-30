-- Work report auto-link: pending queue + artist interview hours + talent_interview category

-- ------------------------------------------------------------
-- 1) artist_apply.report_hours — filled at interview completion
-- ------------------------------------------------------------
ALTER TABLE public.artist_apply
  ADD COLUMN IF NOT EXISTS report_hours numeric(4,1);

-- ------------------------------------------------------------
-- 2) pending_report_items — bridge between business tasks and day reports
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pending_report_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          text NOT NULL,
  report_date       date NOT NULL,
  source_module     text NOT NULL,
  source_type       text NOT NULL,
  source_id         text NOT NULL,
  category          text NOT NULL,
  related_id        text,
  related_name      text,
  title             text NOT NULL,
  suggested_hours   numeric(4,1) NOT NULL DEFAULT 0,
  outcome_type      text,
  outcome_url       text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'pulled', 'consumed', 'dismissed')),
  completed_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_report_items_unique_source
    UNIQUE (staff_id, source_module, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS pending_report_items_staff_date_status_idx
  ON public.pending_report_items (staff_id, report_date, status);

CREATE INDEX IF NOT EXISTS pending_report_items_status_idx
  ON public.pending_report_items (status);

ALTER TABLE public.pending_report_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read pending_report_items" ON public.pending_report_items;
CREATE POLICY "Allow authenticated read pending_report_items"
  ON public.pending_report_items FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert pending_report_items" ON public.pending_report_items;
CREATE POLICY "Allow authenticated insert pending_report_items"
  ON public.pending_report_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update pending_report_items" ON public.pending_report_items;
CREATE POLICY "Allow authenticated update pending_report_items"
  ON public.pending_report_items FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated delete pending_report_items" ON public.pending_report_items;
CREATE POLICY "Allow authenticated delete pending_report_items"
  ON public.pending_report_items FOR DELETE
  TO authenticated
  USING (true);

-- Dev-bypass (anon) — mirrors day_reports pattern
DROP POLICY IF EXISTS "Allow anon select on pending_report_items" ON public.pending_report_items;
CREATE POLICY "Allow anon select on pending_report_items"
  ON public.pending_report_items FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert on pending_report_items" ON public.pending_report_items;
CREATE POLICY "Allow anon insert on pending_report_items"
  ON public.pending_report_items FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on pending_report_items" ON public.pending_report_items;
CREATE POLICY "Allow anon update on pending_report_items"
  ON public.pending_report_items FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on pending_report_items" ON public.pending_report_items;
CREATE POLICY "Allow anon delete on pending_report_items"
  ON public.pending_report_items FOR DELETE
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_report_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_report_items TO anon;
GRANT ALL ON public.pending_report_items TO service_role;

-- ------------------------------------------------------------
-- 3) day_report_type seed: talent_interview
-- ------------------------------------------------------------
INSERT INTO public.day_report_type
  (id, label, icon, color, bg, relation_type, description, is_active, sort_order, associated_modules)
VALUES
  ('talent_interview', '藝人面試', '🎤', 'text-fuchsia-700', 'bg-fuchsia-100', 'none', '藝人招聘面試評分', true, 14, ARRAY['talent']::text[])
ON CONFLICT (id) DO NOTHING;
