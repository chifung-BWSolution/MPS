-- Allow anon role to read/write artist pipeline tables.
-- Reason: this app uses a dev-bypass auth flow that signs in via a hardcoded
-- whitelist WITHOUT establishing a Supabase Auth session — so PostgREST sees
-- the requests as `anon`, not `authenticated`. The original RLS only granted
-- the `authenticated` role, which caused 藝人列表 to render empty in incognito
-- (and any other browser session that didn't have an OAuth Supabase session).
-- This mirrors the pattern already established in 20240625_allow_anon_select_core_tables.sql.

-- =========================
-- confirmed_artist
-- =========================
DROP POLICY IF EXISTS "Allow anon select on confirmed_artist" ON public.confirmed_artist;
CREATE POLICY "Allow anon select on confirmed_artist"
  ON public.confirmed_artist FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert on confirmed_artist" ON public.confirmed_artist;
CREATE POLICY "Allow anon insert on confirmed_artist"
  ON public.confirmed_artist FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on confirmed_artist" ON public.confirmed_artist;
CREATE POLICY "Allow anon update on confirmed_artist"
  ON public.confirmed_artist FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on confirmed_artist" ON public.confirmed_artist;
CREATE POLICY "Allow anon delete on confirmed_artist"
  ON public.confirmed_artist FOR DELETE
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.confirmed_artist TO anon;

-- =========================
-- rejected_artist
-- =========================
DROP POLICY IF EXISTS "Allow anon select on rejected_artist" ON public.rejected_artist;
CREATE POLICY "Allow anon select on rejected_artist"
  ON public.rejected_artist FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert on rejected_artist" ON public.rejected_artist;
CREATE POLICY "Allow anon insert on rejected_artist"
  ON public.rejected_artist FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on rejected_artist" ON public.rejected_artist;
CREATE POLICY "Allow anon update on rejected_artist"
  ON public.rejected_artist FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on rejected_artist" ON public.rejected_artist;
CREATE POLICY "Allow anon delete on rejected_artist"
  ON public.rejected_artist FOR DELETE
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rejected_artist TO anon;

-- =========================
-- talent_form (the upstream source of confirmed/rejected artist rows)
-- =========================
DROP POLICY IF EXISTS "Allow anon select on talent_form" ON public.talent_form;
CREATE POLICY "Allow anon select on talent_form"
  ON public.talent_form FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert on talent_form" ON public.talent_form;
CREATE POLICY "Allow anon insert on talent_form"
  ON public.talent_form FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on talent_form" ON public.talent_form;
CREATE POLICY "Allow anon update on talent_form"
  ON public.talent_form FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on talent_form" ON public.talent_form;
CREATE POLICY "Allow anon delete on talent_form"
  ON public.talent_form FOR DELETE
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_form TO anon;
