-- Convert quotation_project_types.id to uuid and quotation_client_project.project_types
-- from text[] slugs to a single UUID FK. Mixed bwt_web+bwt_system → bwt_system.

DROP TRIGGER IF EXISTS trg_assign_pitching_code ON public.quotation_client_project;
DROP TRIGGER IF EXISTS trg_quotation_project_types_block_in_use ON public.quotation_project_types;

ALTER TABLE public.quotation_project_types
  ADD COLUMN IF NOT EXISTS code text;

UPDATE public.quotation_project_types
SET code = id
WHERE code IS NULL;

ALTER TABLE public.quotation_project_types
  ALTER COLUMN code SET NOT NULL;

ALTER TABLE public.quotation_project_types
  DROP CONSTRAINT IF EXISTS quotation_project_types_code_key;

ALTER TABLE public.quotation_project_types
  ADD CONSTRAINT quotation_project_types_code_key UNIQUE (code);

ALTER TABLE public.quotation_project_types
  DROP CONSTRAINT IF EXISTS quotation_project_types_code_format;

ALTER TABLE public.quotation_project_types
  ADD CONSTRAINT quotation_project_types_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]*$');

ALTER TABLE public.quotation_project_types
  ADD COLUMN IF NOT EXISTS id_uuid uuid;

UPDATE public.quotation_project_types
SET id_uuid = gen_random_uuid()
WHERE id_uuid IS NULL;

ALTER TABLE public.quotation_project_types
  ALTER COLUMN id_uuid SET NOT NULL;

ALTER TABLE public.quotation_project_types
  ALTER COLUMN id_uuid SET DEFAULT gen_random_uuid();

ALTER TABLE public.quotation_project_types
  DROP CONSTRAINT IF EXISTS quotation_project_types_pkey;

ALTER TABLE public.quotation_project_types
  DROP CONSTRAINT IF EXISTS quotation_project_types_id_format;

ALTER TABLE public.quotation_project_types
  DROP COLUMN id;

ALTER TABLE public.quotation_project_types
  RENAME COLUMN id_uuid TO id;

ALTER TABLE public.quotation_project_types
  ADD PRIMARY KEY (id);

COMMENT ON COLUMN public.quotation_project_types.id IS
  'UUID primary key. quotation_client_project.project_types stores this value.';

COMMENT ON COLUMN public.quotation_project_types.code IS
  'Stable slug used by Asana inference and legacy mappings, e.g. bwt_web.';

ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS project_type_id uuid;

UPDATE public.quotation_client_project q
SET project_type_id = t.id
FROM public.quotation_project_types t
WHERE t.code = CASE
  WHEN COALESCE(q.project_types, '{}'::text[]) @> ARRAY['bwt_web']::text[]
   AND COALESCE(q.project_types, '{}'::text[]) @> ARRAY['bwt_system']::text[]
    THEN 'bwt_system'
  WHEN cardinality(COALESCE(q.project_types, '{}'::text[])) >= 1
    THEN q.project_types[1]
  ELSE NULL
END
AND q.project_type_id IS NULL;

ALTER TABLE public.quotation_client_project
  DROP COLUMN project_types;

ALTER TABLE public.quotation_client_project
  RENAME COLUMN project_type_id TO project_types;

ALTER TABLE public.quotation_client_project
  DROP CONSTRAINT IF EXISTS quotation_client_project_project_types_fkey;

ALTER TABLE public.quotation_client_project
  ADD CONSTRAINT quotation_client_project_project_types_fkey
  FOREIGN KEY (project_types) REFERENCES public.quotation_project_types(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS quotation_client_project_project_types_idx
  ON public.quotation_client_project (project_types);

COMMENT ON COLUMN public.quotation_client_project.project_types IS
  'quotation_project_types.id for this project (single type).';

DROP FUNCTION IF EXISTS public.pitching_code_prefix(text[]);
DROP FUNCTION IF EXISTS public.allocate_pitching_code(text[], date);

CREATE OR REPLACE FUNCTION public.pitching_code_prefix(p_type uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT t.code_initial
      FROM public.quotation_project_types t
      WHERE t.id = p_type
    ),
    'BWT-W'
  );
$$;

CREATE OR REPLACE FUNCTION public.allocate_pitching_code(
  p_type uuid,
  p_inquiry_date date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_fy integer;
  v_seq integer;
  v_pattern text;
BEGIN
  IF p_inquiry_date IS NULL THEN
    RAISE EXCEPTION 'inquiry_date is required to allocate pitching_code';
  END IF;

  v_prefix := public.pitching_code_prefix(p_type);
  v_fy := public.pitching_code_fy(p_inquiry_date);
  v_pattern := '^' || v_prefix || lpad(v_fy::text, 2, '0') || '-[0-9]{3}$';

  PERFORM pg_advisory_xact_lock(hashtext(v_prefix), v_fy);

  SELECT COALESCE(MAX(substring(q.pitching_code FROM '[0-9]{3}$')::int), 0) + 1
  INTO v_seq
  FROM public.quotation_client_project q
  WHERE q.pitching_code ~ v_pattern;

  RETURN v_prefix || lpad(v_fy::text, 2, '0') || '-' || lpad(v_seq::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_assign_pitching_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_fy_label text;
BEGIN
  v_prefix := public.pitching_code_prefix(NEW.project_types);
  v_fy_label := lpad(public.pitching_code_fy(NEW.inquiry_date)::text, 2, '0');

  IF NEW.pitching_code IS NOT NULL
     AND btrim(NEW.pitching_code) <> ''
     AND NEW.pitching_code ~ ('^' || v_prefix || v_fy_label || '-[0-9]{3}$')
  THEN
    RETURN NEW;
  END IF;

  NEW.pitching_code := public.allocate_pitching_code(NEW.project_types, NEW.inquiry_date);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pitching_code_prefix(uuid) IS
  'Pitching code prefix from quotation_project_types.code_initial for the selected type.';

COMMENT ON FUNCTION public.allocate_pitching_code(uuid, date) IS
  'Next pitching_code for a type prefix + financial year (max last-3-digits + 1).';

GRANT EXECUTE ON FUNCTION public.pitching_code_prefix(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_pitching_code(uuid, date) TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_assign_pitching_code ON public.quotation_client_project;
CREATE TRIGGER trg_assign_pitching_code
BEFORE INSERT OR UPDATE ON public.quotation_client_project
FOR EACH ROW
EXECUTE FUNCTION public.trg_assign_pitching_code();

CREATE OR REPLACE FUNCTION public.trg_quotation_project_types_block_in_use()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.quotation_client_project q
    WHERE q.project_types IS NOT NULL
      AND q.project_types = OLD.id
  ) THEN
    RAISE EXCEPTION 'quotation_project_types % is still used by quotation_client_project', OLD.id
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_quotation_project_types_block_in_use
BEFORE DELETE ON public.quotation_project_types
FOR EACH ROW
EXECUTE FUNCTION public.trg_quotation_project_types_block_in_use();

CREATE OR REPLACE FUNCTION public.trg_sync_projects_from_quotation_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_types jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_project_row('quotation_client', OLD.id);
    RETURN OLD;
  END IF;

  v_name := COALESCE(
    NULLIF(btrim(NEW.display_name), ''),
    NULLIF(btrim(NEW.client_name), ''),
    NULLIF(btrim(NEW.pitching_code), ''),
    NEW.id
  );

  SELECT COALESCE(to_jsonb(ARRAY[t.code]), '[]'::jsonb)
  INTO v_types
  FROM public.quotation_project_types t
  WHERE t.id = NEW.project_types;

  PERFORM public.upsert_project_row(
    'quotation_client',
    NEW.id,
    v_name,
    COALESCE(NEW.status, ''),
    (COALESCE(NEW.status, '') IS DISTINCT FROM 'closed'),
    NULL,
    NULL,
    NEW.client_name,
    jsonb_build_object(
      'pitching_code', NEW.pitching_code,
      'project_types', COALESCE(v_types, '[]'::jsonb),
      'assigned_pm_name', NEW.assigned_pm_name,
      'asana_link', NEW.asana_link
    )
  );
  RETURN NEW;
END;
$$;
