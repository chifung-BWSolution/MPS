-- Lookup for quotation_client_project.project_types (stored ids) and pitching code prefixes.

CREATE TABLE IF NOT EXISTS public.quotation_project_types (
  id text PRIMARY KEY,
  display text NOT NULL UNIQUE,
  code_initial text NOT NULL,
  section text NOT NULL CHECK (section IN ('quotation', 'system-dev')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotation_project_types_id_format
    CHECK (id ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT quotation_project_types_code_initial_format
    CHECK (code_initial ~ '^[A-Z0-9]+-[A-Z0-9]+$')
);

CREATE INDEX IF NOT EXISTS quotation_project_types_is_active_idx
  ON public.quotation_project_types (is_active);

CREATE INDEX IF NOT EXISTS quotation_project_types_section_idx
  ON public.quotation_project_types (section);

COMMENT ON TABLE public.quotation_project_types IS
  'Selectable project types. quotation_client_project.project_types stores these ids.';

COMMENT ON COLUMN public.quotation_project_types.id IS
  'Stable slug stored in quotation_client_project.project_types.';

COMMENT ON COLUMN public.quotation_project_types.display IS
  'Label shown in Pitching / Project forms and the settings page.';

COMMENT ON COLUMN public.quotation_project_types.code_initial IS
  'Pitching code prefix, e.g. BWT-W / BWT-S.';

COMMENT ON COLUMN public.quotation_project_types.section IS
  'quotation = 市場項目管理, system-dev = 系統開發管理.';

INSERT INTO public.quotation_project_types (id, display, code_initial, section, is_active)
VALUES
  ('bwl_event', 'BWL 活動報價', 'BWL-E', 'quotation', true),
  ('bwg_gift', 'BWG-禮品', 'BWG-G', 'quotation', true),
  ('bwt_web', 'BWT-網頁', 'BWT-W', 'system-dev', true),
  ('bwt_system', 'BWT-系統', 'BWT-S', 'system-dev', true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN public.quotation_client_project.project_types IS
  'quotation_project_types.id values for this project.';

CREATE OR REPLACE FUNCTION public.pitching_code_prefix(p_types text[])
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT t.code_initial
      FROM public.quotation_project_types t
      WHERE p_types IS NOT NULL
        AND t.id = ANY(p_types)
      ORDER BY
        CASE t.id
          WHEN 'bwt_system' THEN 1
          WHEN 'bwl_event' THEN 2
          WHEN 'bwg_gift' THEN 3
          WHEN 'bwt_web' THEN 4
          ELSE 100
        END,
        t.id
      LIMIT 1
    ),
    'BWT-W'
  );
$$;

COMMENT ON FUNCTION public.pitching_code_prefix(text[]) IS
  'Pitching code prefix from quotation_project_types.code_initial. Priority: bwt_system, bwl_event, bwg_gift, bwt_web, then other ids.';

CREATE OR REPLACE FUNCTION public.trg_quotation_project_types_block_in_use()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.quotation_client_project q
    WHERE q.project_types IS NOT NULL
      AND OLD.id = ANY(q.project_types)
  ) THEN
    RAISE EXCEPTION 'quotation_project_types % is still used by quotation_client_project', OLD.id
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_project_types_block_in_use ON public.quotation_project_types;
CREATE TRIGGER trg_quotation_project_types_block_in_use
BEFORE DELETE ON public.quotation_project_types
FOR EACH ROW
EXECUTE FUNCTION public.trg_quotation_project_types_block_in_use();

ALTER TABLE public.quotation_project_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on quotation_project_types" ON public.quotation_project_types;
CREATE POLICY "Allow select on quotation_project_types"
  ON public.quotation_project_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on quotation_project_types" ON public.quotation_project_types;
CREATE POLICY "Allow insert on quotation_project_types"
  ON public.quotation_project_types FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on quotation_project_types" ON public.quotation_project_types;
CREATE POLICY "Allow update on quotation_project_types"
  ON public.quotation_project_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on quotation_project_types" ON public.quotation_project_types;
CREATE POLICY "Allow delete on quotation_project_types"
  ON public.quotation_project_types FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_project_types TO authenticated;
GRANT ALL ON public.quotation_project_types TO service_role;
