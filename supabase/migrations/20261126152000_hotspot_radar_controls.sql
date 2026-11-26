-- ============================================================
-- 熱點雷達：每日抓取開關（給 Edge Function 呼叫）
--
-- 為什麼需要 RPC：cron schema 沒有暴露給 PostgREST，Edge Function（service_role）
-- 無法直接 update cron.job。用兩支 SECURITY DEFINER 函數包起來，只授權 service_role。
--
-- 安全性：
--   - 只操作 jobname = 'hotspot-radar-daily' 這一個 job，不碰其他 job
--   - 用 cron.alter_job(active => …) 切換，保留原 command（含授權）
--   - revoke 掉 public/anon/authenticated
-- ============================================================

CREATE OR REPLACE FUNCTION public.hotspot_radar_daily_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
              'enabled',  j.active,
              'schedule', j.schedule,
              'jobname',  j.jobname
            )
       FROM cron.job j
      WHERE j.jobname = 'hotspot-radar-daily'
      LIMIT 1),
    jsonb_build_object('enabled', false, 'schedule', NULL, 'jobname', NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.hotspot_radar_set_daily(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_jobid  bigint;
  v_active boolean;
BEGIN
  SELECT j.jobid, j.active
    INTO v_jobid, v_active
    FROM cron.job j
   WHERE j.jobname = 'hotspot-radar-daily'
   LIMIT 1;

  IF v_jobid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_missing');
  END IF;

  IF v_active IS DISTINCT FROM p_enabled THEN
    PERFORM cron.alter_job(job_id := v_jobid, active := p_enabled);
  END IF;

  RETURN public.hotspot_radar_daily_status();
END;
$$;

REVOKE ALL ON FUNCTION public.hotspot_radar_daily_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hotspot_radar_set_daily(boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hotspot_radar_daily_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.hotspot_radar_set_daily(boolean) TO service_role;
