-- ============================================================
-- Talent Form (talent_form)
-- Stores submissions from the public 藝人面試登記表 self-fill page
-- (URL: /talent/invite/<token>).
--
-- Allows anonymous (unauthenticated) inserts because the talent
-- fills the form via a public link, before being created as a
-- system user.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.talent_form (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token    text,
  fill_date       date,
  name_zh         text,
  name_en         text,
  gender          text,
  age             text,
  phone           text,
  wechat          text,
  height          text,
  weight          text,
  -- The full form payload (every field, including arrays of selected options)
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Signature stored as a PNG data URL (image/png;base64,...)
  signature_image text,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS talent_form_token_idx
  ON public.talent_form (invite_token);

CREATE INDEX IF NOT EXISTS talent_form_submitted_idx
  ON public.talent_form (submitted_at DESC);

-- RLS disabled and grants opened so the public invite page can submit
-- without an authenticated session. Mirrors the login_logs pattern.
ALTER TABLE public.talent_form DISABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.talent_form TO anon;
GRANT INSERT ON public.talent_form TO authenticated;
GRANT ALL    ON public.talent_form TO service_role;
GRANT SELECT, UPDATE, DELETE ON public.talent_form TO authenticated;
