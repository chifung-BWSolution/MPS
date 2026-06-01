-- ============================================================
-- company_project_details: catch-all project detail bag
--   one row per project (internal or client)
--   stores team members, tasks, client info, year plan, etc.
--   shape kept as JSONB so new detail fields don't need a migration
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_project_details (
  project_id     text PRIMARY KEY,
  team_members   jsonb NOT NULL DEFAULT '[]'::jsonb,
  tasks          jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_info    jsonb NOT NULL DEFAULT '{}'::jsonb,
  year_plan      jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_project_details_updated_idx
  ON public.company_project_details (updated_at DESC);

ALTER TABLE public.company_project_details ENABLE ROW LEVEL SECURITY;

-- Authenticated role
DROP POLICY IF EXISTS "Allow read for authenticated" ON public.company_project_details;
CREATE POLICY "Allow read for authenticated"
  ON public.company_project_details FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.company_project_details;
CREATE POLICY "Allow insert for authenticated"
  ON public.company_project_details FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for authenticated" ON public.company_project_details;
CREATE POLICY "Allow update for authenticated"
  ON public.company_project_details FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.company_project_details;
CREATE POLICY "Allow delete for authenticated"
  ON public.company_project_details FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_project_details TO authenticated;
GRANT ALL ON public.company_project_details TO service_role;

-- Anon role (this app uses dev-bypass auth without a Supabase session)
DROP POLICY IF EXISTS "Allow anon select on company_project_details" ON public.company_project_details;
CREATE POLICY "Allow anon select on company_project_details"
  ON public.company_project_details FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon insert on company_project_details" ON public.company_project_details;
CREATE POLICY "Allow anon insert on company_project_details"
  ON public.company_project_details FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on company_project_details" ON public.company_project_details;
CREATE POLICY "Allow anon update on company_project_details"
  ON public.company_project_details FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on company_project_details" ON public.company_project_details;
CREATE POLICY "Allow anon delete on company_project_details"
  ON public.company_project_details FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_project_details TO anon;
