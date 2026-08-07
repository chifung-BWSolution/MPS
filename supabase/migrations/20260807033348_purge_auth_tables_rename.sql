-- Phase 1: purge unused tables + rename auth tables
-- user_info -> users, staff_directory -> staffs
-- Drop work_table / system_users (login uses users + staffs only)

-- ---------------------------------------------------------------------------
-- 1) Drop unused / obsolete tables
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public._backup_phase1_user_info_20260630 CASCADE;
DROP TABLE IF EXISTS public._backup_phase1_day_reports_20260630 CASCADE;
DROP TABLE IF EXISTS public._backup_phase1_day_report_entries_20260630 CASCADE;
DROP TABLE IF EXISTS public.edm_campaigns CASCADE;
DROP TABLE IF EXISTS public.graphic_designs CASCADE;
DROP TABLE IF EXISTS public.work_table CASCADE;
DROP TABLE IF EXISTS public.system_users CASCADE;

-- ---------------------------------------------------------------------------
-- 2) Rename auth tables
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.user_info RENAME TO users;
ALTER TABLE IF EXISTS public.staff_directory RENAME TO staffs;

-- ---------------------------------------------------------------------------
-- 3) Rename indexes (keep names aligned with new tables)
-- ---------------------------------------------------------------------------
ALTER INDEX IF EXISTS public.user_info_pkey RENAME TO users_pkey;
ALTER INDEX IF EXISTS public.user_info_staff_id_key RENAME TO users_staff_id_key;
ALTER INDEX IF EXISTS public.idx_user_info_classification RENAME TO idx_users_classification;
ALTER INDEX IF EXISTS public.idx_user_info_email RENAME TO idx_users_email;
ALTER INDEX IF EXISTS public.idx_user_info_google_email RENAME TO idx_users_google_email;
ALTER INDEX IF EXISTS public.idx_user_info_staff_id RENAME TO idx_users_staff_id;
ALTER INDEX IF EXISTS public.idx_user_info_system_status RENAME TO idx_users_system_status;

ALTER INDEX IF EXISTS public.staff_directory_pkey RENAME TO staffs_pkey;
ALTER INDEX IF EXISTS public.staff_directory_bubble_staff_id_key RENAME TO staffs_bubble_staff_id_key;
ALTER INDEX IF EXISTS public.idx_staff_directory_bubble_id RENAME TO idx_staffs_bubble_id;
ALTER INDEX IF EXISTS public.idx_staff_directory_email RENAME TO idx_staffs_email;
ALTER INDEX IF EXISTS public.idx_staff_directory_status RENAME TO idx_staffs_status;
ALTER INDEX IF EXISTS public.idx_staff_directory_team RENAME TO idx_staffs_team;

-- ---------------------------------------------------------------------------
-- 4) Rename RLS policies on staffs (were on staff_directory)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staffs' AND policyname = 'staff_directory_select_all'
  ) THEN
    ALTER POLICY staff_directory_select_all ON public.staffs RENAME TO staffs_select_all;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staffs' AND policyname = 'staff_directory_insert_all'
  ) THEN
    ALTER POLICY staff_directory_insert_all ON public.staffs RENAME TO staffs_insert_all;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staffs' AND policyname = 'staff_directory_update_all'
  ) THEN
    ALTER POLICY staff_directory_update_all ON public.staffs RENAME TO staffs_update_all;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staffs' AND policyname = 'staff_directory_delete_all'
  ) THEN
    ALTER POLICY staff_directory_delete_all ON public.staffs RENAME TO staffs_delete_all;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Table comments (docs will be rewritten later; DB labels for clarity)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.users IS
  'App login allowlist / role classification. Used with Supabase Auth + staffs.';
COMMENT ON TABLE public.staffs IS
  'Employee directory (synced). Used with Supabase Auth + users for login enrichment.';
