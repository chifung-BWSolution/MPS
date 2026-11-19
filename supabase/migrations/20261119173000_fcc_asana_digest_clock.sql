-- Send the FC Asana digest at the saved Hong Kong time, not every 15 minutes.
-- 18:00 HKT is 10:00 UTC. Saving the settings reschedules this job again.

CREATE OR REPLACE FUNCTION public.reschedule_fcc_asana_digest(cron_expr text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  src_cmd text;
BEGIN
  IF cron_expr IS NULL OR cron_expr !~ '^[0-9]+ [0-9]+ \* \* [0-9*,-]+$' THEN
    RAISE EXCEPTION 'invalid cron';
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname = 'fcc-asana-digest';

  IF src_cmd IS NULL THEN
    RAISE EXCEPTION 'fcc-asana-digest cron missing';
  END IF;

  PERFORM cron.unschedule('fcc-asana-digest');
  PERFORM cron.schedule('fcc-asana-digest', cron_expr, src_cmd);
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_fcc_asana_digest(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_fcc_asana_digest(text) TO service_role;

SELECT public.reschedule_fcc_asana_digest('0 10 * * *');
