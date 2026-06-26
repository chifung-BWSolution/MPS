-- The app currently uses a dev-bypass login flow that may call Supabase as the
-- anon role from authenticated UI screens. Mirror the existing talent pipeline
-- permissions so artist_apply can replace talent_form without breaking those
-- screens.

DROP POLICY IF EXISTS "Allow anon read on artist_apply" ON public.artist_apply;
DROP POLICY IF EXISTS "Allow anon update on artist_apply" ON public.artist_apply;
DROP POLICY IF EXISTS "Allow anon read on artist_apply_photo" ON public.artist_apply_photo;

CREATE POLICY "Allow anon read on artist_apply"
  ON public.artist_apply FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon update on artist_apply"
  ON public.artist_apply FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon read on artist_apply_photo"
  ON public.artist_apply_photo FOR SELECT
  TO anon
  USING (true);

GRANT SELECT, UPDATE ON public.artist_apply TO anon;
GRANT SELECT ON public.artist_apply_photo TO anon;
