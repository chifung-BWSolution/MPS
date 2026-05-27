-- Allow anon role to INSERT/UPDATE/DELETE on client_project and company_project.
-- Reason: dev-bypass login does not establish a Supabase auth session, so requests
-- run as the anon role. Matches the lenient pattern used in 20240625_allow_anon_select_core_tables.sql.

-- company_project
CREATE POLICY "Allow anon insert"
  ON public.company_project FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update"
  ON public.company_project FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete"
  ON public.company_project FOR DELETE TO anon USING (true);

-- client_project
CREATE POLICY "Allow anon insert"
  ON public.client_project FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update"
  ON public.client_project FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete"
  ON public.client_project FOR DELETE TO anon USING (true);
