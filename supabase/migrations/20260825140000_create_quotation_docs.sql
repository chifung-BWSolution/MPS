-- Project documents for Pitching / Project detail (quotation_client_project).

CREATE TABLE IF NOT EXISTS public.quotation_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_client_project_id text NOT NULL
    REFERENCES public.quotation_client_project(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  storage_path text NOT NULL,
  document_date date,
  expiry_date date,
  file_size bigint,
  mime_type text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotation_docs_project_id_idx
  ON public.quotation_docs (quotation_client_project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quotation_docs_doc_type_idx
  ON public.quotation_docs (doc_type);

CREATE INDEX IF NOT EXISTS quotation_docs_expiry_date_idx
  ON public.quotation_docs (expiry_date);

COMMENT ON TABLE public.quotation_docs IS
  'Files attached to a Pitching / Project row (quotation_client_project).';

COMMENT ON COLUMN public.quotation_docs.quotation_client_project_id IS
  'Related Pitching / Project row (quotation_client_project.id).';

COMMENT ON COLUMN public.quotation_docs.doc_type IS
  'Free-text type. Suggested values: 報價單 / 項目合約 / 參考圖片.';

COMMENT ON COLUMN public.quotation_docs.file_name IS
  'Original file name shown in the UI.';

COMMENT ON COLUMN public.quotation_docs.file_url IS
  'Public URL from the quotation-docs storage bucket.';

COMMENT ON COLUMN public.quotation_docs.storage_path IS
  'Object path inside the quotation-docs bucket (needed to delete/replace).';

COMMENT ON COLUMN public.quotation_docs.document_date IS
  'Optional document / issue date.';

COMMENT ON COLUMN public.quotation_docs.expiry_date IS
  'Optional expiry date (contracts, quotations).';

ALTER TABLE public.quotation_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on quotation_docs" ON public.quotation_docs;
CREATE POLICY "Allow select on quotation_docs"
  ON public.quotation_docs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on quotation_docs" ON public.quotation_docs;
CREATE POLICY "Allow insert on quotation_docs"
  ON public.quotation_docs FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on quotation_docs" ON public.quotation_docs;
CREATE POLICY "Allow update on quotation_docs"
  ON public.quotation_docs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on quotation_docs" ON public.quotation_docs;
CREATE POLICY "Allow delete on quotation_docs"
  ON public.quotation_docs FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_docs TO anon, authenticated;
GRANT ALL ON public.quotation_docs TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('quotation-docs', 'quotation-docs', true, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Allow select on quotation-docs" ON storage.objects;
CREATE POLICY "Allow select on quotation-docs"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'quotation-docs');

DROP POLICY IF EXISTS "Allow insert on quotation-docs" ON storage.objects;
CREATE POLICY "Allow insert on quotation-docs"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'quotation-docs');

DROP POLICY IF EXISTS "Allow update on quotation-docs" ON storage.objects;
CREATE POLICY "Allow update on quotation-docs"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'quotation-docs')
  WITH CHECK (bucket_id = 'quotation-docs');

DROP POLICY IF EXISTS "Allow delete on quotation-docs" ON storage.objects;
CREATE POLICY "Allow delete on quotation-docs"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'quotation-docs');
