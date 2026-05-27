DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'system_users') THEN
    UPDATE public.system_users SET department = 'System' WHERE bubble_staff_id = 'manual_super_admin_lowell';
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_info') THEN
    UPDATE public.user_info SET department = 'System' WHERE staff_id = 'manual_super_admin_lowell';
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'staff_directory') THEN
    UPDATE public.staff_directory SET department = 'System' WHERE bubble_staff_id = 'manual_super_admin_lowell';
  END IF;
END $$;
