-- Rotated Google OAuth refresh tokens (GA4 reuses the Ads OAuth client)
CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  provider          text PRIMARY KEY,
  refresh_token     text NOT NULL,
  last_used_at      timestamptz,
  last_rotated_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.google_oauth_tokens FROM anon, authenticated;
GRANT ALL ON public.google_oauth_tokens TO service_role;
