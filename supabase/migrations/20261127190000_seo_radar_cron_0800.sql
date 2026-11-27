-- ============================================================
-- SEO 雷達：每日自動抓取改為香港時間 08:00
--
-- pg_cron 維持 UTC（與既有 job 相同，不改 cron.timezone）。
-- 08:00 Asia/Hong_Kong = 00:00 UTC，無夏令時。
--   schedule: 0 0 * * *
--
-- 只改 seo-radar-daily 的 schedule。不改 command、不改 active、不 unschedule。
-- ============================================================

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid
    INTO v_jobid
    FROM cron.job
   WHERE jobname = 'seo-radar-daily';

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'seo-radar-daily not found — schedule change skipped';
    RETURN;
  END IF;

  PERFORM cron.alter_job(job_id := v_jobid, schedule := '0 0 * * *');

  RAISE NOTICE 'seo-radar-daily rescheduled to 08:00 Asia/Hong_Kong';
END
$$;
