-- GSC daily incremental cron (pg_cron + pg_net)
-- Mirrors google-ads-incremental-daily / ga4-incremental-daily.
--
-- Production job:
--   jobname : gsc-incremental-daily
--   schedule: 45 22 * * *   -- 22:45 UTC daily (after GA4 at 22:30)
--   target  : /functions/v1/sync-gsc
--   body    : {}            -- function default lookback is 28 days
--
-- Auth is cloned from an existing functions HTTP cron so the service_role
-- bearer is never written into this file.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'gsc-incremental-daily'
  ) THEN
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname IN (
    'google-ads-incremental-daily',
    'ga4-incremental-daily',
    'facebook-ads-incremental-daily'
  )
    AND command ILIKE '%net.http_post%'
    AND command ILIKE '%/functions/v1/%'
  ORDER BY CASE jobname
    WHEN 'google-ads-incremental-daily' THEN 1
    WHEN 'ga4-incremental-daily' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF src_cmd IS NULL THEN
    RAISE NOTICE
      'gsc-incremental-daily not created — no existing functions HTTP cron to clone auth from';
    RETURN;
  END IF;

  new_cmd := regexp_replace(
    src_cmd,
    'functions/v1/[^'']+',
    'functions/v1/sync-gsc'
  );

  PERFORM cron.schedule(
    'gsc-incremental-daily',
    '45 22 * * *',
    new_cmd
  );
END
$$;
