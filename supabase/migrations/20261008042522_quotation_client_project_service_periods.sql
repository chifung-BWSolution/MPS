-- Flexible period dates for 系統開發管理 client projects (BWT-網頁 / BWT-系統).
-- Known keys: revision (可修改期), testing (測試期), warranty (保養期).
-- Additional period keys can be stored later without a schema change.
ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS service_periods jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.quotation_client_project.service_periods IS
  'JSON map of named date ranges for system-dev projects. Each value is { startDate, endDate } (YYYY-MM-DD). Known keys: revision (可修改期), testing (測試期), warranty (保養期). Extra keys may be added without a migration.';
