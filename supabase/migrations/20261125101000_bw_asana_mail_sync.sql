-- BW mail can open Asana tasks after the settings switch is turned on.
-- not_before stays empty until that switch is saved, so old mail is not backfilled.

ALTER TABLE public.bw_asana_mail_settings
  ADD COLUMN IF NOT EXISTS not_before timestamptz;

DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bw-asana-mail') THEN
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname = 'fcc-asana-mail';

  IF src_cmd IS NULL THEN
    RAISE NOTICE 'bw-asana-mail not created — fcc-asana-mail cron was not found';
    RETURN;
  END IF;

  new_cmd := replace(src_cmd, 'functions/v1/sync-fcc-asana-mail', 'functions/v1/sync-bw-asana-mail');

  PERFORM cron.schedule(
    'bw-asana-mail',
    '*/5 * * * *',
    new_cmd
  );
END
$$;
