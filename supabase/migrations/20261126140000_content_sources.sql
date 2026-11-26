-- ============================================================
-- 社媒自動化營運 · M5-02 熱點自動抓取（P4b）
--
-- 只做加法：
--   1. content_sources：RSS／熱榜來源清單（分級、抓取間隔、連續失敗）
--   2. content_hot_events.dedupe_key：URL／simhash 去重鍵（自動抓取與 CSV 匯入共用）
--   3. 每小時 content-sources-hourly → content-sources?action=fetch_sources
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_sources (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  kind                    text NOT NULL DEFAULT 'rss'
                            CHECK (kind IN ('rss', 'hotlist', 'manual')),
  url                     text NOT NULL,
  tier                    integer NOT NULL DEFAULT 2
                            CHECK (tier BETWEEN 1 AND 3),
  enabled                 boolean NOT NULL DEFAULT true,
  fetch_interval_minutes  integer NOT NULL DEFAULT 60,
  last_fetched_at         timestamptz,
  consecutive_empty       integer NOT NULL DEFAULT 0,
  last_error              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS content_sources_due_idx
  ON public.content_sources (enabled, last_fetched_at);

COMMENT ON TABLE public.content_sources IS
  '熱點來源（M5-02）：tier 1–3 對應熱度權重；last_error/consecutive_empty 供健康告警';

ALTER TABLE public.content_hot_events
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS content_hot_events_dedupe_uidx
  ON public.content_hot_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON COLUMN public.content_hot_events.dedupe_key IS
  '去重鍵：url:<正規化 URL> 或 sim:<simhash>；自動抓取與 CSV 匯入共用';

-- 種子來源（tier 1 = 主要品牌/官方；tier 2 = 一般媒體）
INSERT INTO public.content_sources (name, kind, url, tier, fetch_interval_minutes)
VALUES
  (
    'Google News · 美妝（香港）',
    'rss',
    'https://news.google.com/rss/search?q=%E7%BE%8E%E5%A6%9D&hl=zh-HK&gl=HK&ceid=HK:zh-Hant',
    1,
    60
  ),
  (
    'Google News · 護膚（香港）',
    'rss',
    'https://news.google.com/rss/search?q=%E8%AD%B7%E8%86%9A&hl=zh-HK&gl=HK&ceid=HK:zh-Hant',
    2,
    60
  )
ON CONFLICT (url) DO NOTHING;

-- 每小時 :15 抓取；auth 從 content-worker-tick 複製（service_role 不入庫）
DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'content-sources-hourly') THEN
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname = 'content-worker-tick';

  IF src_cmd IS NULL THEN
    RAISE NOTICE 'content-sources-hourly 未建立：找不到 content-worker-tick 可複製 auth';
    RETURN;
  END IF;

  new_cmd := regexp_replace(
    src_cmd,
    'functions/v1/content-worker',
    'functions/v1/content-sources?action=fetch_sources'
  );

  PERFORM cron.schedule('content-sources-hourly', '15 * * * *', new_cmd);
  RAISE NOTICE 'content-sources-hourly 已建立（每小時 :15）';
END
$$;
