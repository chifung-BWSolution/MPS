-- Company BV is a named policy, not a collaborator row:
-- Branding Works always occupies 30%; staff rows share the remaining 70%.
-- Keep src/lib/quotationBv.ts COMPANY_BV_RATIO / STAFF_BV_POOL in sync.

CREATE OR REPLACE FUNCTION public.quotation_bv_company_ratio()
RETURNS numeric(6, 2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 30::numeric(6, 2);
$$;

CREATE OR REPLACE FUNCTION public.quotation_bv_staff_pool()
RETURNS numeric(6, 2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 70::numeric(6, 2);
$$;

CREATE OR REPLACE FUNCTION public.quotation_bv_company_label()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'Branding Works'::text;
$$;

COMMENT ON FUNCTION public.quotation_bv_company_ratio() IS
  'Fixed company BV share (Branding Works). Not stored on quotation_bv.';

COMMENT ON FUNCTION public.quotation_bv_staff_pool() IS
  'Max sum of quotation_bv.bv_ratio per project. New main-PM seeds use this value.';

COMMENT ON FUNCTION public.quotation_bv_company_label() IS
  'Display name for the company BV policy slice.';

-- Remap existing staff shares from the old 100% pool onto the 70% staff pool.
-- Skip projects already at/under the staff pool so this is safe to re-run.
UPDATE public.quotation_bv bv
SET
  bv_ratio = GREATEST(
    0.01,
    ROUND(bv.bv_ratio * public.quotation_bv_staff_pool() / 100.0, 2)
  ),
  updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT project_id, SUM(bv_ratio) AS staff_sum
    FROM public.quotation_bv
    GROUP BY project_id
  ) s
  WHERE s.project_id = bv.project_id
    AND s.staff_sum > public.quotation_bv_staff_pool()
);

ALTER TABLE public.quotation_bv
  DROP CONSTRAINT IF EXISTS quotation_bv_bv_ratio_check;

ALTER TABLE public.quotation_bv
  ADD CONSTRAINT quotation_bv_bv_ratio_check
  CHECK (bv_ratio > 0 AND bv_ratio <= 70);

COMMENT ON TABLE public.quotation_bv IS
  'Staff collaborator BV ratio per projects hub row. Staff ratios for a project should add up to quotation_bv_staff_pool() (70). Branding Works company share is quotation_bv_company_ratio() (30) and is not stored here.';

COMMENT ON COLUMN public.quotation_bv.bv_ratio IS
  'Staff contribution share of the 70% collaborator pool.';

-- Seed / transfer uses the staff pool instead of 100.
CREATE OR REPLACE FUNCTION public.trg_quotation_bv_seed_main_pm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_old_ratio numeric(6, 2);
  v_new_exists boolean;
  v_staff_pool numeric(6, 2) := public.quotation_bv_staff_pool();
BEGIN
  IF NEW.main_pm_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id
  INTO v_project_id
  FROM public.projects p
  WHERE p.related_type = 'quotation_client'
    AND p.related_id = NEW.id;

  IF v_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- New project, or first time a main PM is set: seed staff pool when no BV exists.
  IF TG_OP = 'INSERT' OR OLD.main_pm_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.quotation_bv
      WHERE project_id = v_project_id
    ) THEN
      INSERT INTO public.quotation_bv (project_id, staff_id, bv_ratio)
      VALUES (v_project_id, NEW.main_pm_id, v_staff_pool)
      ON CONFLICT (project_id, staff_id) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.main_pm_id IS NOT DISTINCT FROM NEW.main_pm_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.quotation_bv
    WHERE project_id = v_project_id
      AND staff_id = NEW.main_pm_id
  ) INTO v_new_exists;

  IF v_new_exists THEN
    RETURN NEW;
  END IF;

  SELECT bv_ratio
  INTO v_old_ratio
  FROM public.quotation_bv
  WHERE project_id = v_project_id
    AND staff_id = OLD.main_pm_id;

  IF v_old_ratio IS NOT NULL THEN
    DELETE FROM public.quotation_bv
    WHERE project_id = v_project_id
      AND staff_id = OLD.main_pm_id;

    INSERT INTO public.quotation_bv (project_id, staff_id, bv_ratio)
    VALUES (v_project_id, NEW.main_pm_id, v_old_ratio)
    ON CONFLICT (project_id, staff_id) DO NOTHING;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.quotation_bv
    WHERE project_id = v_project_id
  ) THEN
    INSERT INTO public.quotation_bv (project_id, staff_id, bv_ratio)
    VALUES (v_project_id, NEW.main_pm_id, v_staff_pool)
    ON CONFLICT (project_id, staff_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_quotation_bv_seed_main_pm() IS
  'Seeds main PM at quotation_bv_staff_pool() BV on the projects hub row when a quotation_client_project has no collaborators; on main_pm change, transfers the old PM ratio to the new PM if they are not already a collaborator.';

CREATE OR REPLACE VIEW public.quotation_bv_with_company
WITH (security_invoker = true) AS
SELECT
  bv.id,
  bv.project_id,
  bv.staff_id,
  s.display_name AS party_name,
  bv.bv_ratio,
  'staff'::text AS slice_kind,
  bv.created_at,
  bv.updated_at
FROM public.quotation_bv bv
LEFT JOIN public.staffs s ON s.id = bv.staff_id
UNION ALL
SELECT
  NULL::uuid,
  p.id,
  NULL::uuid,
  public.quotation_bv_company_label(),
  public.quotation_bv_company_ratio(),
  'company'::text,
  p.created_at,
  p.updated_at
FROM public.projects p
WHERE EXISTS (
  SELECT 1
  FROM public.quotation_bv bv
  WHERE bv.project_id = p.id
);

COMMENT ON VIEW public.quotation_bv_with_company IS
  'Staff quotation_bv rows plus the Branding Works company policy slice for reporting. Do not write to this view.';

GRANT SELECT ON public.quotation_bv_with_company TO anon, authenticated;
GRANT SELECT ON public.quotation_bv_with_company TO service_role;
