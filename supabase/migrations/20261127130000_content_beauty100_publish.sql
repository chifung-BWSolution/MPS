-- ============================================================
-- 內容自動化 · Beauty100 自動發佈（憑證 kind／連線檢查 kind）
--
-- 只做加法：
--   1. content_site_credentials.kind 允許 beauty100_admin
--      （存的是 Beauty100 專用 staff 帳號 JSON，AES-256-GCM 加密）
--   2. content_site_checks.kind 允許 adapter
--      （測試連線時真的呼叫 adapter.testConnection）
--
-- 不改 Beauty100 的任何資料表；不改既有資料。
-- ============================================================

-- 1) 憑證類型：找到實際 constraint 名稱再重建，避免依賴自動命名。
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.content_site_credentials'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%wp_app_password%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.content_site_credentials DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.content_site_credentials
  DROP CONSTRAINT IF EXISTS content_site_credentials_kind_check;

ALTER TABLE public.content_site_credentials
  ADD CONSTRAINT content_site_credentials_kind_check
  CHECK (kind IN (
    'http_bearer', 'http_hmac', 'wp_app_password',
    'shopify_admin', 'webflow_token', 'beauty100_admin'
  ));

COMMENT ON COLUMN public.content_site_credentials.kind IS
  '憑證類型；beauty100_admin 為 Beauty100 專用 staff 帳號 JSON（加密儲存）。';

-- 2) 連線檢查類型：settings/domain/sitemap/credential/adapter
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.content_site_checks'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%sitemap%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.content_site_checks DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.content_site_checks
  DROP CONSTRAINT IF EXISTS content_site_checks_kind_check;

ALTER TABLE public.content_site_checks
  ADD CONSTRAINT content_site_checks_kind_check
  CHECK (kind IN ('settings', 'domain', 'sitemap', 'credential', 'adapter'));

COMMENT ON COLUMN public.content_site_checks.kind IS
  '檢查類型；adapter 代表真的呼叫站點 adapter（例如 Beauty100 登入／文章表／封面 bucket）。';
