-- Pitching codes: PREFIX + FY(from inquiry_date) + seq
-- Prefix from project_types: bwt_system > bwl_event > bwg_gift > BWT-W

CREATE OR REPLACE FUNCTION public.pitching_code_prefix(p_types text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_types IS NOT NULL AND 'bwt_system' = ANY(p_types) THEN 'BWT-S'
    WHEN p_types IS NOT NULL AND 'bwl_event' = ANY(p_types) THEN 'BWL-E'
    WHEN p_types IS NOT NULL AND 'bwg_gift' = ANY(p_types) THEN 'BWG-G'
    ELSE 'BWT-W'
  END;
$$;

CREATE OR REPLACE FUNCTION public.pitching_code_fy(p_inquiry_date date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_inquiry_date IS NULL THEN NULL
    WHEN EXTRACT(MONTH FROM p_inquiry_date) >= 4 THEN MOD(EXTRACT(YEAR FROM p_inquiry_date)::int, 100)
    ELSE MOD(EXTRACT(YEAR FROM p_inquiry_date)::int - 1, 100)
  END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_pitching_code(
  p_types text[],
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

  v_prefix := public.pitching_code_prefix(p_types);
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
BEGIN
  IF NEW.pitching_code IS NULL
     OR btrim(NEW.pitching_code) = ''
     OR NEW.pitching_code !~ '^(BWT-S|BWT-W|BWL-E|BWG-G)[0-9]{2}-[0-9]{3}$'
  THEN
    NEW.pitching_code := public.allocate_pitching_code(NEW.project_types, NEW.inquiry_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_pitching_code ON public.quotation_client_project;
CREATE TRIGGER trg_assign_pitching_code
BEFORE INSERT ON public.quotation_client_project
FOR EACH ROW
EXECUTE FUNCTION public.trg_assign_pitching_code();

GRANT EXECUTE ON FUNCTION public.pitching_code_prefix(text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pitching_code_fy(date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_pitching_code(text[], date) TO anon, authenticated, service_role;

-- Internal BWL admin sheet — remove before numbering
DELETE FROM public.quotation_client_project
WHERE pitching_code = 'ASANA-32248664'
   OR id = 'asana_1211111932248664';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, project_types, inquiry_date
    FROM public.quotation_client_project
    WHERE pitching_code IS NULL
       OR btrim(pitching_code) = ''
       OR pitching_code !~ '^(BWT-S|BWT-W|BWL-E|BWG-G)[0-9]{2}-[0-9]{3}$'
    ORDER BY
      public.pitching_code_prefix(project_types),
      public.pitching_code_fy(inquiry_date),
      inquiry_date,
      created_at,
      id
  LOOP
    UPDATE public.quotation_client_project
    SET pitching_code = public.allocate_pitching_code(r.project_types, r.inquiry_date)
    WHERE id = r.id;
  END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS quotation_client_project_pitching_code_uidx
  ON public.quotation_client_project (pitching_code)
  WHERE pitching_code IS NOT NULL AND btrim(pitching_code) <> '';

COMMENT ON FUNCTION public.pitching_code_prefix(text[]) IS
  'Pitching code prefix from project_types: bwt_system → BWT-S, else bwl_event → BWL-E, else bwg_gift → BWG-G, else BWT-W.';

COMMENT ON FUNCTION public.pitching_code_fy(date) IS
  'Two-digit financial year from inquiry_date. Apr–Mar: 1/4/2026–31/3/2027 = 26.';

COMMENT ON FUNCTION public.allocate_pitching_code(text[], date) IS
  'Next pitching_code for a prefix + financial year (max last-3-digits + 1).';
