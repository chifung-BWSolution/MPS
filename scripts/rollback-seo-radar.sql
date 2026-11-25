-- ============================================================
-- SEO 雷達 回滾腳本（H3：先快照 → 再撤回 → 最後 drop）
--
-- 這支不是 migration，不會被 `db push` 執行；出事時在 SQL Editor 逐段手動跑。
-- 前提：只處理本次新增的兩張表與一個 cron job，不動 seo_keywords 的既有列
--       （除了第 ② 段你明確要撤回的那幾列）。
-- ============================================================

-- ------------------------------------------------------------
-- ① 快照：drop 之後就查不到「哪些詞被這個工具採納過」，先留下對照
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seo_radar_rollback_refs AS
SELECT i.adopted_keyword_id AS keyword_id,
       i.keyword,
       i.website_profile_id,
       i.market_code,
       i.source,
       i.score,
       now() AS captured_at
  FROM public.seo_keyword_ideas i
 WHERE i.adopted_keyword_id IS NOT NULL;

SELECT count(*) AS captured_rows FROM public.seo_radar_rollback_refs;

-- ------------------------------------------------------------
-- ② 撤回副作用（預設註解掉；要一起撤回才打開）
--    只撤回「仍是 backlog」且「屬本次採納」的列；已 in_progress / published 不動。
-- ------------------------------------------------------------
-- UPDATE public.seo_keywords k
--    SET pipeline_status = NULL,
--        updated_at = now()
--   FROM public.seo_radar_rollback_refs r
--  WHERE k.id = r.keyword_id
--    AND k.pipeline_status = 'backlog';

-- ------------------------------------------------------------
-- ③ 移除本次新增物件
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'seo-radar-daily') THEN
    PERFORM cron.unschedule('seo-radar-daily');
    RAISE NOTICE 'cron job seo-radar-daily unscheduled';
  ELSE
    RAISE NOTICE 'cron job seo-radar-daily not found — skipped';
  END IF;
END
$$;

DROP TABLE IF EXISTS public.seo_keyword_ideas;
DROP TABLE IF EXISTS public.seo_radar_runs;

-- 版本記錄也要一起刪，否則日後 `supabase db push` 會以為這兩支已套用而跳過，
-- 表就永遠不會被重建。
DELETE FROM supabase_migrations.schema_migrations
 WHERE version IN ('20261127090000', '20261127091000');

-- rollback_refs 先留著供事後核對；確認無誤後再手動刪：
-- DROP TABLE IF EXISTS public.seo_radar_rollback_refs;

-- ------------------------------------------------------------
-- ④ 非 SQL 部分（要一起處理）
--    - git revert：src/context/AppContext.tsx、src/components/tools-center/ToolsCenterModule.tsx、
--      supabase/config.toml、package.json，並刪除 src/components/tools-center/seo-radar/、
--      src/hooks/useSeoRadar.ts、src/lib/seoRadar*.ts、src/types/seoRadar.ts
--    - npx supabase functions delete seo-radar
-- ------------------------------------------------------------
