-- ============================================================
-- 熱點雷達：每日自動抓取（pg_cron + pg_net）
--
-- 生產設定：
--   jobname : hotspot-radar-daily
--   schedule: 45 23 * * *  UTC（排在 seo-radar-daily 23:15 之後）
--   target  : /functions/v1/hotspot-radar
--   body    : {}            → 函數在 service_role 且無 action 時視為 cron_scan
--
-- 授權沿用既有 functions HTTP cron（service_role bearer 不寫進本檔）。
-- 安全網：
--   1. 找不到可複製的來源 job → 不建立，只 RAISE NOTICE
--   2. URL 替換失敗 → 不建立，印出原命令前 200 字
--   3. 建立成功 → 印出最終命令供人工核對
--   4. 不 unschedule、不改任何既有 job
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hotspot-radar-daily') THEN
    RAISE NOTICE 'hotspot-radar-daily already scheduled — skipped';
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname IN (
    'seo-radar-daily',
    'gsc-incremental-daily',
    'google-ads-incremental-daily',
    'ga4-incremental-daily',
    'facebook-ads-incremental-daily'
  )
    AND command ILIKE '%net.http_post%'
    AND command ILIKE '%/functions/v1/%'
  ORDER BY CASE jobname
    WHEN 'seo-radar-daily' THEN 1
    WHEN 'gsc-incremental-daily' THEN 2
    WHEN 'google-ads-incremental-daily' THEN 3
    WHEN 'ga4-incremental-daily' THEN 4
    ELSE 5
  END
  LIMIT 1;

  IF src_cmd IS NULL THEN
    RAISE NOTICE
      'hotspot-radar-daily not created — no existing functions HTTP cron to clone auth from';
    RETURN;
  END IF;

  new_cmd := regexp_replace(
    src_cmd,
    'functions/v1/[^'']+',
    'functions/v1/hotspot-radar'
  );

  IF new_cmd NOT LIKE '%/functions/v1/hotspot-radar%' THEN
    RAISE NOTICE
      'hotspot-radar-daily not created — URL rewrite failed; source command=%',
      left(src_cmd, 200);
    RETURN;
  END IF;

  PERFORM cron.schedule('hotspot-radar-daily', '45 23 * * *', new_cmd);

  RAISE NOTICE 'hotspot-radar-daily scheduled: %', left(new_cmd, 300);
END
$$;
