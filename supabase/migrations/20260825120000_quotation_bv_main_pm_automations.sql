-- Keep quotation_bv in sync with quotation_client_project.main_pm_id:
-- 1) On create (or first main_pm assignment) with no BV rows, seed main PM at 100%.
-- 2) When main_pm changes to a staff who is not already a collaborator,
--    remove the old PM's BV row and give that same ratio to the new PM.

CREATE OR REPLACE FUNCTION public.trg_quotation_bv_seed_main_pm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_ratio numeric(6, 2);
  v_new_exists boolean;
BEGIN
  IF NEW.main_pm_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- New project, or first time a main PM is set: seed 100% when no BV exists.
  IF TG_OP = 'INSERT' OR OLD.main_pm_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.quotation_bv
      WHERE quotation_client_project_id = NEW.id
    ) THEN
      INSERT INTO public.quotation_bv (quotation_client_project_id, staff_id, bv_ratio)
      VALUES (NEW.id, NEW.main_pm_id, 100)
      ON CONFLICT (quotation_client_project_id, staff_id) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.main_pm_id IS NOT DISTINCT FROM NEW.main_pm_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.quotation_bv
    WHERE quotation_client_project_id = NEW.id
      AND staff_id = NEW.main_pm_id
  ) INTO v_new_exists;

  -- New PM already has a BV share: leave collaborator rows as-is.
  IF v_new_exists THEN
    RETURN NEW;
  END IF;

  SELECT bv_ratio
  INTO v_old_ratio
  FROM public.quotation_bv
  WHERE quotation_client_project_id = NEW.id
    AND staff_id = OLD.main_pm_id;

  IF v_old_ratio IS NOT NULL THEN
    DELETE FROM public.quotation_bv
    WHERE quotation_client_project_id = NEW.id
      AND staff_id = OLD.main_pm_id;

    INSERT INTO public.quotation_bv (quotation_client_project_id, staff_id, bv_ratio)
    VALUES (NEW.id, NEW.main_pm_id, v_old_ratio)
    ON CONFLICT (quotation_client_project_id, staff_id) DO NOTHING;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.quotation_bv
    WHERE quotation_client_project_id = NEW.id
  ) THEN
    INSERT INTO public.quotation_bv (quotation_client_project_id, staff_id, bv_ratio)
    VALUES (NEW.id, NEW.main_pm_id, 100)
    ON CONFLICT (quotation_client_project_id, staff_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_bv_seed_main_pm ON public.quotation_client_project;
CREATE TRIGGER trg_quotation_bv_seed_main_pm
AFTER INSERT OR UPDATE OF main_pm_id ON public.quotation_client_project
FOR EACH ROW
EXECUTE FUNCTION public.trg_quotation_bv_seed_main_pm();

COMMENT ON FUNCTION public.trg_quotation_bv_seed_main_pm() IS
  'Seeds main PM at 100% BV when a project has no collaborators; on main_pm change, transfers the old PM ratio to the new PM if they are not already a collaborator.';
