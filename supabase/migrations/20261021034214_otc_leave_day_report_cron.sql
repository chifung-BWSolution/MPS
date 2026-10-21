-- Approved OTC leave → missing day_reports headers.
--
-- Production job:
--   jobname : otc-leave-day-report-daily
--   schedule: 0 3 * * *     -- 11:00 Asia/Hong_Kong, every day
--   target  : /functions/v1/otc-leave-day-report
--   window  : Hong Kong today ± 14 days (the function default; no from/to)
--
-- Auth is cloned from an existing functions HTTP cron so the service_role
-- bearer is never written into this file. A one-time backfill is a manual
-- call with from and to. It is not scheduled here.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'otc-leave-day-report-daily'
  ) THEN
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname IN (
    'google-ads-incremental-daily',
    'ga4-incremental-daily',
    'facebook-ads-incremental-daily',
    'receivables-alert-daily'
  )
    AND command ILIKE '%net.http_post%'
    AND command ILIKE '%/functions/v1/%'
  ORDER BY CASE jobname
    WHEN 'receivables-alert-daily' THEN 1
    WHEN 'google-ads-incremental-daily' THEN 2
    WHEN 'ga4-incremental-daily' THEN 3
    ELSE 4
  END
  LIMIT 1;

  IF src_cmd IS NULL THEN
    RAISE NOTICE
      'otc-leave-day-report-daily not created — no existing functions HTTP cron to clone auth from';
    RETURN;
  END IF;

  new_cmd := regexp_replace(
    src_cmd,
    'functions/v1/[^'']+',
    'functions/v1/otc-leave-day-report'
  );

  PERFORM cron.schedule(
    'otc-leave-day-report-daily',
    '0 3 * * *',
    new_cmd
  );
END
$$;
