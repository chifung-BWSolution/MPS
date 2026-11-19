-- FC Asana daily digest. Send time and recipients are saved on the FCC rule.
-- The checker cron is every 15 minutes; the function only sends once the saved
-- Hong Kong time has passed and this occurrence has not already been sent.
-- The existing fcc-asana-mail cron also calls the same check.

ALTER TABLE public.asana_mail_rules
  ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.asana_mail_rules
  ADD COLUMN IF NOT EXISTS digest_recipients text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.asana_mail_rules
  ADD COLUMN IF NOT EXISTS digest_send_time time NOT NULL DEFAULT '18:00';

ALTER TABLE public.asana_mail_rules
  ADD COLUMN IF NOT EXISTS digest_cadence text NOT NULL DEFAULT 'daily';

ALTER TABLE public.asana_mail_rules
  ADD COLUMN IF NOT EXISTS digest_weekday smallint NOT NULL DEFAULT 1;

ALTER TABLE public.asana_mail_rules
  ADD COLUMN IF NOT EXISTS digest_last_sent_on date;

ALTER TABLE public.asana_mail_rules
  DROP CONSTRAINT IF EXISTS asana_mail_rules_digest_cadence_check;

ALTER TABLE public.asana_mail_rules
  ADD CONSTRAINT asana_mail_rules_digest_cadence_check
  CHECK (digest_cadence IN ('daily', 'weekdays', 'weekly'));

ALTER TABLE public.asana_mail_rules
  DROP CONSTRAINT IF EXISTS asana_mail_rules_digest_weekday_check;

ALTER TABLE public.asana_mail_rules
  ADD CONSTRAINT asana_mail_rules_digest_weekday_check
  CHECK (digest_weekday BETWEEN 1 AND 7);

DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fcc-asana-digest') THEN
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname = 'fcc-asana-mail'
    AND command ILIKE '%net.http_post%'
  LIMIT 1;

  IF src_cmd IS NULL THEN
    RAISE NOTICE 'fcc-asana-digest not created — fcc-asana-mail cron was not found';
    RETURN;
  END IF;

  new_cmd := regexp_replace(
    src_cmd,
    'functions/v1/[^'']+',
    'functions/v1/fcc-asana-digest'
  );

  PERFORM cron.schedule(
    'fcc-asana-digest',
    '*/15 * * * *',
    new_cmd
  );
END
$$;
