-- ============================================================
-- 熱點雷達：自動抓取由「每天 23:45 UTC 一次」改為香港時間分段頻率
--
-- pg_cron 維持 UTC（與既有 job 相同，不改 cron.timezone，避免牽動其他排程）。
-- 香港時間 = UTC+8，無夏令時。
--
-- 香港時間（整點）：
--   每天（含週日）每 6 小時：00:00、06:00、12:00、18:00
--     → UTC  0 4,10,16,22 * * *
--       16:00 UTC = 次日 00:00 HKT，22:00 UTC = 次日 06:00 HKT
--       04:00 UTC = 當日 12:00 HKT，10:00 UTC = 當日 18:00 HKT
--       跨日後仍覆蓋週日與週一至六，所以這條七天都跑。
--   週一至六，09:00–17:00 另外每 2 小時：09:00、11:00、13:00、15:00、17:00
--     → UTC  0 1,3,5,7,9 * * 1-6
--       這些鐘點都在當天 08:00 之後，星期幾與香港時間相同。
--       12:00 已含在每 6 小時那條，不重複排。
--
-- 兩條 job 共用同一條 HTTP command（service_role 不寫進本檔）。
-- 新 job 的 active 跟既有 hotspot-radar-daily 走，避免本來暫停的抓取被打開。
-- 不 unschedule、不改其他 job。
-- ============================================================

DO $$
DECLARE
  v_jobid bigint;
  v_cmd text;
  v_active boolean;
  v_day_id bigint;
BEGIN
  SELECT jobid, command, active
    INTO v_jobid, v_cmd, v_active
    FROM cron.job
   WHERE jobname = 'hotspot-radar-daily';

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'hotspot-radar-daily not found — cadence change skipped';
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    job_id := v_jobid,
    schedule := '0 4,10,16,22 * * *'
  );

  SELECT jobid
    INTO v_day_id
    FROM cron.job
   WHERE jobname = 'hotspot-radar-daytime';

  IF v_day_id IS NULL THEN
    PERFORM cron.schedule(
      'hotspot-radar-daytime',
      '0 1,3,5,7,9 * * 1-6',
      v_cmd
    );

    SELECT jobid
      INTO v_day_id
      FROM cron.job
     WHERE jobname = 'hotspot-radar-daytime';

    IF v_active IS NOT TRUE AND v_day_id IS NOT NULL THEN
      PERFORM cron.alter_job(job_id := v_day_id, active := false);
    END IF;
  ELSE
    PERFORM cron.alter_job(
      job_id := v_day_id,
      schedule := '0 1,3,5,7,9 * * 1-6'
    );
  END IF;

  RAISE NOTICE 'hotspot radar cadence updated for Asia/Hong_Kong';
END
$$;

-- 開關要同時切兩條 job，否則暫停後日間加密仍會跑。
CREATE OR REPLACE FUNCTION public.hotspot_radar_daily_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT CASE
    WHEN (
      SELECT count(*)
        FROM cron.job j
       WHERE j.jobname IN ('hotspot-radar-daily', 'hotspot-radar-daytime')
    ) < 2 THEN
      jsonb_build_object('enabled', false, 'schedule', NULL, 'jobname', NULL)
    ELSE (
      SELECT jsonb_build_object(
               'enabled', bool_and(j.active),
               'schedule', string_agg(j.jobname || '=' || j.schedule, ' | ' ORDER BY j.jobname),
               'jobname', 'hotspot-radar-daily'
             )
        FROM cron.job j
       WHERE j.jobname IN ('hotspot-radar-daily', 'hotspot-radar-daytime')
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.hotspot_radar_set_daily(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_jobid bigint;
  v_active boolean;
BEGIN
  IF (
    SELECT count(*)
      FROM cron.job j
     WHERE j.jobname IN ('hotspot-radar-daily', 'hotspot-radar-daytime')
  ) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_missing');
  END IF;

  FOR v_jobid, v_active IN
    SELECT j.jobid, j.active
      FROM cron.job j
     WHERE j.jobname IN ('hotspot-radar-daily', 'hotspot-radar-daytime')
  LOOP
    IF v_active IS DISTINCT FROM p_enabled THEN
      PERFORM cron.alter_job(job_id := v_jobid, active := p_enabled);
    END IF;
  END LOOP;

  RETURN public.hotspot_radar_daily_status();
END;
$$;

REVOKE ALL ON FUNCTION public.hotspot_radar_daily_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hotspot_radar_set_daily(boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hotspot_radar_daily_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.hotspot_radar_set_daily(boolean) TO service_role;
