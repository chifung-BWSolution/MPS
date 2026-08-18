-- GA4 daily incremental cron (pg_cron + pg_net)
-- Mirrors google-ads-incremental-daily.
--
-- Production job (applied via SQL editor / `supabase db query --linked`):
--   jobname : ga4-incremental-daily
--   schedule: 30 22 * * *   -- 22:30 UTC daily
--   target  : /functions/v1/sync-ga4
--   body    : {}            -- function default lookback is 7 days
--
-- Recreate by cloning the Bearer from google-ads-incremental-daily
-- (do not commit service_role keys). See docs/ga4-setup.md.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'ga4-incremental-daily'
  ) THEN
    RAISE NOTICE
      'ga4-incremental-daily not found — create it via docs/ga4-setup.md (clone auth from google-ads-incremental-daily)';
  END IF;
END
$$;
