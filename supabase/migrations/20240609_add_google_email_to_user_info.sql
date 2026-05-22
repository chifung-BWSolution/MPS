-- Add google_email, display_name, and email columns to user_info table
-- This supports dual-email authentication: company email + Google login email

ALTER TABLE public.user_info ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.user_info ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.user_info ADD COLUMN IF NOT EXISTS google_email TEXT;

CREATE INDEX IF NOT EXISTS idx_user_info_email ON public.user_info(email);
CREATE INDEX IF NOT EXISTS idx_user_info_google_email ON public.user_info(google_email);
