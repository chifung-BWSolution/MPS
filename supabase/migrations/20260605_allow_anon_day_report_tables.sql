-- Allow anon role to read/write day-report related tables.
-- Reason: the app's dev-bypass login flow does NOT establish a Supabase auth
-- session, so PostgREST sees those requests as `anon`. Without these
-- policies, bypass users can read seeded rows but every insert/update/delete
-- is silently rejected — eg. "工作類型" 新增不能保存 to day_report_type, and
-- "提交匯報" cannot write day_reports / day_report_entries.
-- Mirrors the pattern in 20260601_allow_anon_confirmed_artist.sql.

-- =========================
-- day_report_type
-- =========================
DROP POLICY IF EXISTS "Allow anon select on day_report_type" ON public.day_report_type;
CREATE POLICY "Allow anon select on day_report_type"
  ON public.day_report_type FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert on day_report_type" ON public.day_report_type;
CREATE POLICY "Allow anon insert on day_report_type"
  ON public.day_report_type FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on day_report_type" ON public.day_report_type;
CREATE POLICY "Allow anon update on day_report_type"
  ON public.day_report_type FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on day_report_type" ON public.day_report_type;
CREATE POLICY "Allow anon delete on day_report_type"
  ON public.day_report_type FOR DELETE
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_report_type TO anon;

-- =========================
-- day_reports
-- =========================
DROP POLICY IF EXISTS "Allow anon select on day_reports" ON public.day_reports;
CREATE POLICY "Allow anon select on day_reports"
  ON public.day_reports FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert on day_reports" ON public.day_reports;
CREATE POLICY "Allow anon insert on day_reports"
  ON public.day_reports FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on day_reports" ON public.day_reports;
CREATE POLICY "Allow anon update on day_reports"
  ON public.day_reports FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on day_reports" ON public.day_reports;
CREATE POLICY "Allow anon delete on day_reports"
  ON public.day_reports FOR DELETE
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_reports TO anon;

-- =========================
-- day_report_entries
-- =========================
DROP POLICY IF EXISTS "Allow anon select on day_report_entries" ON public.day_report_entries;
CREATE POLICY "Allow anon select on day_report_entries"
  ON public.day_report_entries FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon insert on day_report_entries" ON public.day_report_entries;
CREATE POLICY "Allow anon insert on day_report_entries"
  ON public.day_report_entries FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on day_report_entries" ON public.day_report_entries;
CREATE POLICY "Allow anon update on day_report_entries"
  ON public.day_report_entries FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on day_report_entries" ON public.day_report_entries;
CREATE POLICY "Allow anon delete on day_report_entries"
  ON public.day_report_entries FOR DELETE
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_report_entries TO anon;
