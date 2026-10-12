-- Receivables digest runs Monday 09:00 Asia/Hong_Kong only (01:00 UTC).
-- cron.schedule keeps the existing HTTP command, including its service-role auth.
-- Direct UPDATE on cron.job is not granted to the migration role.

DO $$
DECLARE
  existing_cmd text;
BEGIN
  SELECT command INTO existing_cmd
  FROM cron.job
  WHERE jobname = 'receivables-alert-daily';

  IF existing_cmd IS NULL THEN
    RAISE NOTICE 'receivables-alert-daily not found';
    RETURN;
  END IF;

  PERFORM cron.unschedule('receivables-alert-daily');
  PERFORM cron.schedule(
    'receivables-alert-daily',
    '0 1 * * 1',
    existing_cmd
  );
END
$$;
