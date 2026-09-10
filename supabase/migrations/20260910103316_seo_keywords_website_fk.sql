-- PostgREST embed seo_keywords → webandsystem_list needs a real FK.
-- Legacy seo_keywords was created without one.

ALTER TABLE public.seo_keywords
  DROP CONSTRAINT IF EXISTS seo_keywords_website_profile_id_fkey;

ALTER TABLE public.seo_keywords
  ADD CONSTRAINT seo_keywords_website_profile_id_fkey
  FOREIGN KEY (website_profile_id)
  REFERENCES public.webandsystem_list(id)
  ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
