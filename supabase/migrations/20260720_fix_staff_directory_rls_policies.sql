-- staff_directory had RLS enabled with zero policies, so anon/authenticated
-- clients received 0 rows while service_role still saw data.
-- Restore app access with explicit permissive policies.

ALTER TABLE public.staff_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_directory_select_all" ON public.staff_directory;
DROP POLICY IF EXISTS "staff_directory_insert_all" ON public.staff_directory;
DROP POLICY IF EXISTS "staff_directory_update_all" ON public.staff_directory;
DROP POLICY IF EXISTS "staff_directory_delete_all" ON public.staff_directory;

CREATE POLICY "staff_directory_select_all"
  ON public.staff_directory FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "staff_directory_insert_all"
  ON public.staff_directory FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "staff_directory_update_all"
  ON public.staff_directory FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "staff_directory_delete_all"
  ON public.staff_directory FOR DELETE
  TO anon, authenticated
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_directory TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_directory TO authenticated;
