-- Reallocate pitching_code when inquiry_date or project_types no longer match FY/prefix.

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

DROP TRIGGER IF EXISTS trg_assign_pitching_code ON public.quotation_client_project;
CREATE TRIGGER trg_assign_pitching_code
BEFORE INSERT OR UPDATE ON public.quotation_client_project
FOR EACH ROW
EXECUTE FUNCTION public.trg_assign_pitching_code();

COMMENT ON FUNCTION public.trg_assign_pitching_code() IS
  'Keep pitching_code aligned with project_types prefix and inquiry_date financial year.';
