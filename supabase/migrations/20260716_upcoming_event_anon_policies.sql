-- Allow anon (publishable key) CRUD on upcoming_event — matches other MPS tables.
-- Previous policies only covered authenticated, so 新增活動 failed with permission denied.

CREATE POLICY "Allow anon select on upcoming_event"
  ON public.upcoming_event FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert on upcoming_event"
  ON public.upcoming_event FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update on upcoming_event"
  ON public.upcoming_event FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete on upcoming_event"
  ON public.upcoming_event FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.upcoming_event TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upcoming_event TO authenticated;
