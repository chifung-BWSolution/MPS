-- Junction: website/system profiles ↔ video_output (影片製作)

CREATE TABLE IF NOT EXISTS public.website_video_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_profile_id  text NOT NULL REFERENCES public.webandsystem_list(id) ON DELETE CASCADE,
  video_output_id     uuid NOT NULL REFERENCES public.video_output(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (website_profile_id, video_output_id)
);

CREATE INDEX IF NOT EXISTS idx_website_video_links_website
  ON public.website_video_links (website_profile_id);

CREATE INDEX IF NOT EXISTS idx_website_video_links_video
  ON public.website_video_links (video_output_id);

ALTER TABLE public.website_video_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read website_video_links for authenticated"
  ON public.website_video_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert website_video_links for authenticated"
  ON public.website_video_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update website_video_links for authenticated"
  ON public.website_video_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete website_video_links for authenticated"
  ON public.website_video_links FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select on website_video_links"
  ON public.website_video_links FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on website_video_links"
  ON public.website_video_links FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on website_video_links"
  ON public.website_video_links FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on website_video_links"
  ON public.website_video_links FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_video_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_video_links TO anon;
GRANT ALL ON public.website_video_links TO service_role;
