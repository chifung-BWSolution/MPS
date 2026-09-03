-- staff_directory is a leftover read-only alias of staffs
-- (created in 20260902083308_auth_legacy_table_views).
-- The live frontend queries public.staffs only.

DROP VIEW IF EXISTS public.staff_directory;
DROP TABLE IF EXISTS public.staff_directory;

NOTIFY pgrst, 'reload schema';
