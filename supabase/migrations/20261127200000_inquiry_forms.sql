-- Colleagues keep their own inquiry forms and the websites each form link was placed on.

CREATE TABLE IF NOT EXISTS public.inquiry_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by_staff_id uuid,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inquiry_forms_name_not_blank CHECK (char_length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public.inquiry_form_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.inquiry_forms (id) ON DELETE CASCADE,
  url text NOT NULL,
  website_id text REFERENCES public.webandsystem_list (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inquiry_form_links_url_not_blank CHECK (char_length(btrim(url)) > 0)
);

CREATE INDEX IF NOT EXISTS inquiry_form_links_form_id_idx
  ON public.inquiry_form_links (form_id);

CREATE INDEX IF NOT EXISTS inquiry_form_links_website_id_idx
  ON public.inquiry_form_links (website_id);

ALTER TABLE public.inquiry_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_form_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on inquiry_forms" ON public.inquiry_forms;
DROP POLICY IF EXISTS "Allow insert on inquiry_forms" ON public.inquiry_forms;
DROP POLICY IF EXISTS "Allow update on inquiry_forms" ON public.inquiry_forms;
DROP POLICY IF EXISTS "Allow delete on inquiry_forms" ON public.inquiry_forms;
CREATE POLICY "Allow select on inquiry_forms"
  ON public.inquiry_forms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert on inquiry_forms"
  ON public.inquiry_forms FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update on inquiry_forms"
  ON public.inquiry_forms FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on inquiry_forms"
  ON public.inquiry_forms FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow select on inquiry_form_links" ON public.inquiry_form_links;
DROP POLICY IF EXISTS "Allow insert on inquiry_form_links" ON public.inquiry_form_links;
DROP POLICY IF EXISTS "Allow update on inquiry_form_links" ON public.inquiry_form_links;
DROP POLICY IF EXISTS "Allow delete on inquiry_form_links" ON public.inquiry_form_links;
CREATE POLICY "Allow select on inquiry_form_links"
  ON public.inquiry_form_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert on inquiry_form_links"
  ON public.inquiry_form_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update on inquiry_form_links"
  ON public.inquiry_form_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on inquiry_form_links"
  ON public.inquiry_form_links FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiry_forms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiry_form_links TO authenticated;
GRANT ALL ON public.inquiry_forms TO service_role;
GRANT ALL ON public.inquiry_form_links TO service_role;
