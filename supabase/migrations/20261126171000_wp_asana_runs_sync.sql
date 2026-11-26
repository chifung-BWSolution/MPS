-- Copy Wine Passions Portal task runs into MPS every 5 minutes.
-- The command is cloned from bw-asana-mail so the service-role bearer stays in cron.

DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wp-asana-runs') THEN
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname = 'bw-asana-mail';

  IF src_cmd IS NULL THEN
    RAISE NOTICE 'wp-asana-runs not created — bw-asana-mail cron was not found';
    RETURN;
  END IF;

  new_cmd := replace(src_cmd, 'functions/v1/sync-bw-asana-mail', 'functions/v1/sync-wp-asana-runs');

  PERFORM cron.schedule(
    'wp-asana-runs',
    '*/5 * * * *',
    new_cmd
  );
END
$$;
