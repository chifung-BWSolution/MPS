DROP POLICY IF EXISTS "Allow anon select on company_list" ON public.company_list;
CREATE POLICY "Allow anon select on company_list"
  ON public.company_list FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon select on brand_list" ON public.brand_list;
CREATE POLICY "Allow anon select on brand_list"
  ON public.brand_list FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon select on projects_list" ON public.projects_list;
CREATE POLICY "Allow anon select on projects_list"
  ON public.projects_list FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon select on day_report_type" ON public.day_report_type;
CREATE POLICY "Allow anon select on day_report_type"
  ON public.day_report_type FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Allow anon select on webandsystem_list" ON public.webandsystem_list;
CREATE POLICY "Allow anon select on webandsystem_list"
  ON public.webandsystem_list FOR SELECT
  TO anon
  USING (true);
