-- ============================================================
-- 社媒自動化營運 · pg_cron + pg_net 四支工作
-- 對應 PRD v1.1 §7.3、執行清單 M2-16
--
-- 建立順序（強制）：
--   1. 先部署 content-worker / content-digest 等函式並確認可用
--   2. 再跑本 migration（或依 docs/content-cron-setup.md 手動執行）
--   3. 手動觸發一次，確認 cron.job_run_details 顯示 succeeded
--
-- Auth 與既有 functions HTTP cron 一樣，從現有 job 複製命令，
-- service_role bearer 永不寫進版本控制。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
DECLARE
  src_cmd text;
  job_names text[] := ARRAY[
    'content-worker-tick',
    'content-planner-daily',
    'content-digest-tick',
    'content-health-daily'
  ];
  job_schedules text[] := ARRAY[
    '*/2 * * * *',   -- 每 2 分鐘：處理佇列
    '10 16 * * *',   -- 00:10 HKT：產生未來 30 天 slots
    '0 * * * *',     -- 每小時：對上 digest_time 才寄日報
    '0 18 * * *'     -- 02:00 HKT：站點健康 + 內鏈頁面刷新
  ];
  job_targets text[] := ARRAY[
    'functions/v1/content-worker',
    'functions/v1/content-worker?enqueue=plan_slots',
    'functions/v1/content-worker?enqueue=send_digest',
    'functions/v1/content-worker?enqueue=site_health'
  ];
  idx integer;
  new_cmd text;
BEGIN
  -- 任一已存在的 functions HTTP cron 皆可作為 auth 模板
  SELECT command INTO src_cmd
  FROM cron.job
  WHERE command ILIKE '%net.http_post%'
    AND command ILIKE '%/functions/v1/%'
  ORDER BY jobname
  LIMIT 1;

  IF src_cmd IS NULL THEN
    RAISE NOTICE
      'content-* cron 未建立：找不到可複製 auth 的 functions HTTP cron。請依 docs/content-cron-setup.md 手動建立。';
    RETURN;
  END IF;

  FOR idx IN 1..array_length(job_names, 1) LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_names[idx]);

    new_cmd := regexp_replace(src_cmd, 'functions/v1/[^'']+', job_targets[idx], 'g');

    PERFORM cron.schedule(job_names[idx], job_schedules[idx], new_cmd);
    RAISE NOTICE 'content cron 已建立：% (%)', job_names[idx], job_schedules[idx];
  END LOOP;
END
$$;

-- 驗證（部署後手動執行）：
--   select jobname, schedule, active from cron.job where jobname like 'content-%';
--   select jobname, status, return_message, start_time
--   from cron.job_run_details
--   where jobname like 'content-%'
--   order by start_time desc limit 20;
