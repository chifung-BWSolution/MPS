-- ============================================================
-- 社媒自動化營運 · v0 自動營運（autopilot）
-- 目的：讓「熱點 → 自動生成 → 審核 → 待發佈 → 已發佈」今天就能在 UI 看到效果
--
-- 只做加法：
--   1. content_social_posts 加 group_id（批次歸屬；B100 的「批次屬於哪個品牌組」語義）
--   2. content_hot_events 加 url / heat / source（手動貼熱點與熱度顯示）
--   3. 每 2 分鐘的 content-social-tick，自動掃描新熱點並產稿、推進到期稿件
-- ============================================================

ALTER TABLE public.content_social_posts
  ADD COLUMN IF NOT EXISTS group_id uuid
    REFERENCES public.content_social_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_social_posts_group_idx
  ON public.content_social_posts (group_id);

-- 同一熱點 × 同一品牌組只產一批（自動掃描與手動生成的冪等鍵）
CREATE UNIQUE INDEX IF NOT EXISTS content_social_posts_event_group_uidx
  ON public.content_social_posts (event_id, group_id)
  WHERE event_id IS NOT NULL AND group_id IS NOT NULL;

ALTER TABLE public.content_hot_events
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS heat integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.content_hot_events.heat IS
  '熱度（0–100）：v0 由人工／來源標記，未來由 pipeline 的權重 × 半衰公式計算';
COMMENT ON COLUMN public.content_hot_events.source IS
  '來源：manual / csv / rss / hotlist';

-- ------------------------------------------------------------
-- 自動掃描：每 2 分鐘呼叫 content-social?action=auto_tick
--   先部署 content-social 函式，再讓本 migration 建 job（函式未部署會每 2 分鐘失敗）
--   auth 從既有 content-worker-tick 複製，service_role bearer 不入庫
-- ------------------------------------------------------------
DO $$
DECLARE
  src_cmd text;
  new_cmd text;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'content-social-tick') THEN
    RETURN;
  END IF;

  SELECT command INTO src_cmd
  FROM cron.job
  WHERE jobname = 'content-worker-tick';

  IF src_cmd IS NULL THEN
    RAISE NOTICE 'content-social-tick 未建立：找不到 content-worker-tick 可複製 auth';
    RETURN;
  END IF;

  new_cmd := replace(
    src_cmd,
    'functions/v1/content-worker',
    'functions/v1/content-social?action=auto_tick'
  );

  PERFORM cron.schedule('content-social-tick', '*/2 * * * *', new_cmd);
  RAISE NOTICE 'content-social-tick 已建立（每 2 分鐘）';
END
$$;
