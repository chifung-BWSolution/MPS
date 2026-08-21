-- brand_list was recreated with authenticated-only writes. The app often
-- uses the anon key without a Supabase session (dev-bypass login), so
-- UPDATE/INSERT/DELETE returned HTTP 200 with 0 rows and the UI looked saved.
-- Match the rest of MPS: allow anon CRUD on this lookup table.
-- Also backfill the display names already entered on 品牌管理.

DROP POLICY IF EXISTS "Allow anon insert on brand_list" ON public.brand_list;
CREATE POLICY "Allow anon insert on brand_list"
  ON public.brand_list FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update on brand_list" ON public.brand_list;
CREATE POLICY "Allow anon update on brand_list"
  ON public.brand_list FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete on brand_list" ON public.brand_list;
CREATE POLICY "Allow anon delete on brand_list"
  ON public.brand_list FOR DELETE
  TO anon
  USING (true);

UPDATE public.brand_list AS b
SET display_name = v.display_name
FROM (VALUES
  ('BSC',     'Attitude Beauty'),
  ('BWG',     'BW Gift'),
  ('CF',      '志豐集團'),
  ('CFA',     '志豐香港'),
  ('CFB',     '志豐深圳'),
  ('FCC',     'Food Channels Catering'),
  ('OB',      'Online Business')
) AS v(brand_code, display_name)
WHERE b.brand_code = v.brand_code
  AND b.display_name IS DISTINCT FROM v.display_name;
