-- Lookup table for quotation_docs.doc_type, then convert the text column to a UUID FK.

CREATE TABLE IF NOT EXISTS public.quotation_doc_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotation_doc_types_is_active_idx
  ON public.quotation_doc_types (is_active);

COMMENT ON TABLE public.quotation_doc_types IS
  'Selectable document types for quotation_docs.';

COMMENT ON COLUMN public.quotation_doc_types.display IS
  'Label shown in the project document dialog and settings page.';

INSERT INTO public.quotation_doc_types (display, is_active)
VALUES
  ('報價單', true),
  ('項目合約', true),
  ('參考圖片', true)
ON CONFLICT (display) DO NOTHING;

INSERT INTO public.quotation_doc_types (display, is_active)
SELECT DISTINCT
  CASE WHEN btrim(doc_type) = '' THEN '未分類' ELSE btrim(doc_type) END,
  true
FROM public.quotation_docs
WHERE doc_type IS NOT NULL
ON CONFLICT (display) DO NOTHING;

ALTER TABLE public.quotation_docs
  ADD COLUMN IF NOT EXISTS doc_type_id uuid;

UPDATE public.quotation_docs d
SET doc_type_id = t.id
FROM public.quotation_doc_types t
WHERE t.display = CASE WHEN btrim(d.doc_type) = '' THEN '未分類' ELSE btrim(d.doc_type) END
  AND d.doc_type_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.quotation_docs WHERE doc_type_id IS NULL) THEN
    RAISE EXCEPTION 'unmapped quotation_docs.doc_type values remain';
  END IF;
END $$;

DROP INDEX IF EXISTS public.quotation_docs_doc_type_idx;

ALTER TABLE public.quotation_docs
  DROP COLUMN IF EXISTS doc_type;

ALTER TABLE public.quotation_docs
  RENAME COLUMN doc_type_id TO doc_type;

ALTER TABLE public.quotation_docs
  ALTER COLUMN doc_type SET NOT NULL;

ALTER TABLE public.quotation_docs
  DROP CONSTRAINT IF EXISTS quotation_docs_doc_type_fkey;

ALTER TABLE public.quotation_docs
  ADD CONSTRAINT quotation_docs_doc_type_fkey
  FOREIGN KEY (doc_type) REFERENCES public.quotation_doc_types(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS quotation_docs_doc_type_idx
  ON public.quotation_docs (doc_type);

COMMENT ON COLUMN public.quotation_docs.doc_type IS
  'quotation_doc_types.id for this file.';

ALTER TABLE public.quotation_doc_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on quotation_doc_types" ON public.quotation_doc_types;
CREATE POLICY "Allow select on quotation_doc_types"
  ON public.quotation_doc_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on quotation_doc_types" ON public.quotation_doc_types;
CREATE POLICY "Allow insert on quotation_doc_types"
  ON public.quotation_doc_types FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on quotation_doc_types" ON public.quotation_doc_types;
CREATE POLICY "Allow update on quotation_doc_types"
  ON public.quotation_doc_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on quotation_doc_types" ON public.quotation_doc_types;
CREATE POLICY "Allow delete on quotation_doc_types"
  ON public.quotation_doc_types FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_doc_types TO authenticated;
GRANT ALL ON public.quotation_doc_types TO service_role;
