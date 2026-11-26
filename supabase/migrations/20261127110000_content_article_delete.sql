-- ============================================================
-- 內容自動化 · 已發文章「遠端刪除」（下架）
--
-- 需求：刪除要作用在「站點上真正發出去的文章」，
--       不是只刪 MPS 的發佈記錄（content_publish_logs 永遠 append-only）。
--
-- 本檔只做加法：
--   1. content_articles 增加 deleted_at／deleted_reason（保留審計）
--   2. content_jobs.type 允許 delete_article
--   3. content_publish_logs.action 允許 delete（每次刪除都留一筆回執）
--
-- 文章狀態不新增：遠端刪除成功後走既有終態 cancelled + reason，
-- 並把 live_url 清空（避免 UI 誤以為仍上線）。
-- ============================================================

ALTER TABLE public.content_articles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

COMMENT ON COLUMN public.content_articles.deleted_at IS
  '遠端刪除成功時間；有值代表站點上的文章已實際刪除（不是只刪 MPS 記錄）。';
COMMENT ON COLUMN public.content_articles.deleted_reason IS
  '遠端刪除原因（操作者填寫或系統帶入）。';

-- content_jobs.type：加入 delete_article
-- 用 DO 區塊找到實際 constraint 名稱再重建，避免依賴自動命名。
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.content_jobs'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%generate_social%'
  LOOP
    EXECUTE format('ALTER TABLE public.content_jobs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.content_jobs
  ADD CONSTRAINT content_jobs_type_check
  CHECK (type IN (
    'plan_slots', 'generate_article', 'publish_article', 'verify_publish',
    'refresh_site_pages', 'site_health', 'send_digest', 'generate_social',
    'delete_article'
  ));

-- content_publish_logs.action：加入 delete
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.content_publish_logs'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%package%'
  LOOP
    EXECUTE format('ALTER TABLE public.content_publish_logs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.content_publish_logs
  ADD CONSTRAINT content_publish_logs_action_check
  CHECK (action IN (
    'package', 'manual_done', 'publish', 'retry', 'verify',
    'approve', 'reject', 'confirm', 'schedule', 'restore', 'delete'
  ));
