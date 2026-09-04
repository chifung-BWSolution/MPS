-- Payment receipt / record file attached to an income row.

ALTER TABLE public.incomes
  ADD COLUMN IF NOT EXISTS payment_record_file_name text,
  ADD COLUMN IF NOT EXISTS payment_record_file_url text,
  ADD COLUMN IF NOT EXISTS payment_record_storage_path text,
  ADD COLUMN IF NOT EXISTS payment_record_file_size bigint,
  ADD COLUMN IF NOT EXISTS payment_record_mime_type text;

COMMENT ON COLUMN public.incomes.payment_record_file_name IS
  'Original payment record file name shown in the UI.';

COMMENT ON COLUMN public.incomes.payment_record_file_url IS
  'Public URL from the income-payment-records storage bucket.';

COMMENT ON COLUMN public.incomes.payment_record_storage_path IS
  'Object path inside the income-payment-records bucket (needed to delete/replace).';

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('income-payment-records', 'income-payment-records', true, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Allow select on income-payment-records" ON storage.objects;
CREATE POLICY "Allow select on income-payment-records"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'income-payment-records');

DROP POLICY IF EXISTS "Allow insert on income-payment-records" ON storage.objects;
CREATE POLICY "Allow insert on income-payment-records"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'income-payment-records');

DROP POLICY IF EXISTS "Allow update on income-payment-records" ON storage.objects;
CREATE POLICY "Allow update on income-payment-records"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'income-payment-records')
  WITH CHECK (bucket_id = 'income-payment-records');

DROP POLICY IF EXISTS "Allow delete on income-payment-records" ON storage.objects;
CREATE POLICY "Allow delete on income-payment-records"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'income-payment-records');
