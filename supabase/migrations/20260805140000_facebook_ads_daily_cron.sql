-- ============================================================
-- Facebook Ads daily incremental cron (pg_cron + pg_net)
-- Mirrors google-ads-incremental-daily (configured in prod).
--
-- Production job (already applied):
--   jobname : facebook-ads-incremental-daily
--   schedule: 15 22 * * *   -- 22:15 UTC daily (15 min after Google Ads)
--   target  : /functions/v1/supabase-functions-sync-facebook-ads
--
-- This migration is intentionally a no-op for secrets safety.
-- Recreate / repair in SQL editor by cloning the Bearer token from
-- google-ads-incremental-daily (do not commit service_role keys).
-- ============================================================

-- Ensure extensions exist (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Document expected job presence for operators (does not create the HTTP call
-- with embedded secrets). If the job is missing, run the setup DO block from
-- docs/facebook-ads-setup.md § Daily cron.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'facebook-ads-incremental-daily'
  ) THEN
    RAISE NOTICE
      'facebook-ads-incremental-daily not found — create it via docs/facebook-ads-setup.md (clone auth from google-ads-incremental-daily)';
  END IF;
END
$$;
