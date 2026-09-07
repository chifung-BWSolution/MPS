-- Block unauthenticated (anon) access to internal business data.
-- Authenticated staff keep full shared access (USING true policies unchanged).
-- Public forms keep SECURITY DEFINER RPCs (+ kol_apply insert).

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Public artist invite form
GRANT EXECUTE ON FUNCTION public.submit_artist_apply(jsonb, jsonb) TO anon;

-- Public volunteer apply form
GRANT EXECUTE ON FUNCTION public.get_volunteer_campaign_public(text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_volunteer_apply(jsonb) TO anon;

-- Public KOL apply insert (staff screens use authenticated)
GRANT INSERT ON TABLE public.kol_apply TO anon;
DROP POLICY IF EXISTS "Allow anon select on kol_apply" ON public.kol_apply;
DROP POLICY IF EXISTS "Allow anon update on kol_apply" ON public.kol_apply;
DROP POLICY IF EXISTS "Allow anon delete on kol_apply" ON public.kol_apply;

-- Storage: authenticated only
DROP POLICY IF EXISTS "Allow select on quotation-docs" ON storage.objects;
CREATE POLICY "Allow select on quotation-docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quotation-docs');

DROP POLICY IF EXISTS "Allow insert on quotation-docs" ON storage.objects;
CREATE POLICY "Allow insert on quotation-docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quotation-docs');

DROP POLICY IF EXISTS "Allow update on quotation-docs" ON storage.objects;
CREATE POLICY "Allow update on quotation-docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'quotation-docs')
  WITH CHECK (bucket_id = 'quotation-docs');

DROP POLICY IF EXISTS "Allow delete on quotation-docs" ON storage.objects;
CREATE POLICY "Allow delete on quotation-docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'quotation-docs');

DROP POLICY IF EXISTS "Allow select on income-payment-records" ON storage.objects;
CREATE POLICY "Allow select on income-payment-records"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'income-payment-records');

DROP POLICY IF EXISTS "Allow insert on income-payment-records" ON storage.objects;
CREATE POLICY "Allow insert on income-payment-records"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'income-payment-records');

DROP POLICY IF EXISTS "Allow update on income-payment-records" ON storage.objects;
CREATE POLICY "Allow update on income-payment-records"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'income-payment-records')
  WITH CHECK (bucket_id = 'income-payment-records');

DROP POLICY IF EXISTS "Allow delete on income-payment-records" ON storage.objects;
CREATE POLICY "Allow delete on income-payment-records"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'income-payment-records');
