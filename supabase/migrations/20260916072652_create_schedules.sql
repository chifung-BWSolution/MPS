-- Project schedules linked to the projects hub (not quotation_client_project),
-- so the same table can be reused by other project types.

CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  date date NOT NULL,
  description text,
  related_project_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedules_related_project_id_date_idx
  ON public.schedules (related_project_id, date, created_at);

COMMENT ON TABLE public.schedules IS
  'Dated schedule items for any projects-hub row (client, website, video, etc.).';

COMMENT ON COLUMN public.schedules.related_project_id IS
  'public.projects.id. Do not point this at quotation_client_project.';

COMMENT ON COLUMN public.schedules.date IS
  'Calendar date of the schedule item.';

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on schedules" ON public.schedules;
CREATE POLICY "Allow select on schedules"
  ON public.schedules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on schedules" ON public.schedules;
CREATE POLICY "Allow insert on schedules"
  ON public.schedules FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on schedules" ON public.schedules;
CREATE POLICY "Allow update on schedules"
  ON public.schedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on schedules" ON public.schedules;
CREATE POLICY "Allow delete on schedules"
  ON public.schedules FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
