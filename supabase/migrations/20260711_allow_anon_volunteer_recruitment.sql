-- Allow anon role CRUD on volunteer recruitment tables.
-- Reason: MPS uses a whitelist / dev-bypass auth flow that often has no
-- Supabase Auth session, so PostgREST sees requests as `anon`.
-- Mirrors 20260601_allow_anon_confirmed_artist.sql.

-- =========================
-- volunteer_campaign
-- =========================
DROP POLICY IF EXISTS "Allow anon select on volunteer_campaign" ON public.volunteer_campaign;
CREATE POLICY "Allow anon select on volunteer_campaign"
  ON public.volunteer_campaign FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert on volunteer_campaign" ON public.volunteer_campaign;
CREATE POLICY "Allow anon insert on volunteer_campaign"
  ON public.volunteer_campaign FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on volunteer_campaign" ON public.volunteer_campaign;
CREATE POLICY "Allow anon update on volunteer_campaign"
  ON public.volunteer_campaign FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on volunteer_campaign" ON public.volunteer_campaign;
CREATE POLICY "Allow anon delete on volunteer_campaign"
  ON public.volunteer_campaign FOR DELETE
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_campaign TO anon;

-- =========================
-- volunteer_apply
-- =========================
DROP POLICY IF EXISTS "Allow anon select on volunteer_apply" ON public.volunteer_apply;
CREATE POLICY "Allow anon select on volunteer_apply"
  ON public.volunteer_apply FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert on volunteer_apply" ON public.volunteer_apply;
CREATE POLICY "Allow anon insert on volunteer_apply"
  ON public.volunteer_apply FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on volunteer_apply" ON public.volunteer_apply;
CREATE POLICY "Allow anon update on volunteer_apply"
  ON public.volunteer_apply FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on volunteer_apply" ON public.volunteer_apply;
CREATE POLICY "Allow anon delete on volunteer_apply"
  ON public.volunteer_apply FOR DELETE
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_apply TO anon;

-- Staff screening RPC must also be callable without a Supabase session.
GRANT EXECUTE ON FUNCTION public.review_volunteer_apply(uuid, text, text, text) TO anon;
