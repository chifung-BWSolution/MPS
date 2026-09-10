-- Point quotation_bv at the projects hub so pitching and webandsystem
-- (and later vchannel / manual) can share the same collaborator BV rows.
-- Existing rows are remapped via projects.related_type = quotation_client.

-- 1) Ensure a hub row exists for every quotation_client_project that already has BV.
INSERT INTO public.projects (
  related_id, related_type, name, status, is_active, client_name, meta, updated_at
)
SELECT
  q.id,
  'quotation_client',
  COALESCE(
    NULLIF(btrim(q.display_name), ''),
    NULLIF(btrim(q.client_name), ''),
    NULLIF(btrim(q.pitching_code), ''),
    q.id
  ),
  COALESCE(q.status, ''),
  (COALESCE(q.status, '') IS DISTINCT FROM 'closed'),
  q.client_name,
  jsonb_build_object(
    'pitching_code', q.pitching_code,
    'project_types', COALESCE(to_jsonb(q.project_types), '[]'::jsonb),
    'assigned_pm_name', q.assigned_pm_name,
    'asana_link', q.asana_link
  ),
  now()
FROM public.quotation_client_project q
WHERE EXISTS (
  SELECT 1
  FROM public.quotation_bv bv
  WHERE bv.quotation_client_project_id = q.id
)
AND NOT EXISTS (
  SELECT 1
  FROM public.projects p
  WHERE p.related_type = 'quotation_client'
    AND p.related_id = q.id
);

-- 2) Add hub FK column, backfill, then drop the old QCP FK.
ALTER TABLE public.quotation_bv
  ADD COLUMN IF NOT EXISTS project_id uuid;

UPDATE public.quotation_bv bv
SET project_id = p.id
FROM public.projects p
WHERE p.related_type = 'quotation_client'
  AND p.related_id = bv.quotation_client_project_id
  AND bv.project_id IS NULL;

DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM public.quotation_bv
  WHERE project_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'quotation_bv backfill failed: % rows have no matching projects hub',
      orphan_count;
  END IF;
END $$;

ALTER TABLE public.quotation_bv
  DROP CONSTRAINT IF EXISTS quotation_bv_project_staff_key;

ALTER TABLE public.quotation_bv
  DROP CONSTRAINT IF EXISTS quotation_bv_quotation_client_project_id_fkey;

DROP INDEX IF EXISTS quotation_bv_project_id_idx;

ALTER TABLE public.quotation_bv
  DROP COLUMN quotation_client_project_id;

ALTER TABLE public.quotation_bv
  ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE public.quotation_bv
  ADD CONSTRAINT quotation_bv_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.quotation_bv
  ADD CONSTRAINT quotation_bv_project_staff_key UNIQUE (project_id, staff_id);

CREATE INDEX quotation_bv_project_id_idx
  ON public.quotation_bv (project_id);

COMMENT ON TABLE public.quotation_bv IS
  'Collaborator BV ratio per projects hub row. Ratios for a project should add up to 100.';

COMMENT ON COLUMN public.quotation_bv.project_id IS
  'Related projects.id (quotation_client, webandsystem, vchannel, or manual).';

-- 3) Main-PM seed/transfer writes projects.id.
-- Trigger name sorts after trg_sync_projects_quotation_client so the hub row exists first.
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

  -- New project, or first time a main PM is set: seed 100% when no BV exists.
  IF TG_OP = 'INSERT' OR OLD.main_pm_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.quotation_bv
      WHERE project_id = v_project_id
    ) THEN
      INSERT INTO public.quotation_bv (project_id, staff_id, bv_ratio)
      VALUES (v_project_id, NEW.main_pm_id, 100)
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

  -- New PM already has a BV share: leave collaborator rows as-is.
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
    VALUES (v_project_id, NEW.main_pm_id, 100)
    ON CONFLICT (project_id, staff_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_bv_seed_main_pm ON public.quotation_client_project;
DROP TRIGGER IF EXISTS trg_sync_quotation_bv_seed_main_pm ON public.quotation_client_project;
CREATE TRIGGER trg_sync_quotation_bv_seed_main_pm
AFTER INSERT OR UPDATE OF main_pm_id ON public.quotation_client_project
FOR EACH ROW
EXECUTE FUNCTION public.trg_quotation_bv_seed_main_pm();

COMMENT ON FUNCTION public.trg_quotation_bv_seed_main_pm() IS
  'Seeds main PM at 100% BV on the projects hub row when a quotation_client_project has no collaborators; on main_pm change, transfers the old PM ratio to the new PM if they are not already a collaborator.';
