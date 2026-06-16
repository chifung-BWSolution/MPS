ALTER TABLE public.staff_directory DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.staff_directory TO anon;
GRANT ALL ON public.staff_directory TO authenticated;
GRANT ALL ON public.staff_directory TO service_role;
