-- Main project manager for Pitching / Project rows.
ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS main_pm_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotation_client_project_main_pm_id_fkey'
  ) THEN
    ALTER TABLE public.quotation_client_project
      ADD CONSTRAINT quotation_client_project_main_pm_id_fkey
      FOREIGN KEY (main_pm_id) REFERENCES public.staffs(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS quotation_client_project_main_pm_id_idx
  ON public.quotation_client_project (main_pm_id);

COMMENT ON COLUMN public.quotation_client_project.main_pm_id IS
  'Main project manager. UUID FK to staffs.id. Asana assignee email / name is used only to backfill.';

-- Name fallback: assigned_pm_name equals staffs.display_name, or Asana "Name - Role" prefix.
-- Email-based Asana GID matching is applied separately (Edge Function / script).
UPDATE public.quotation_client_project p
SET main_pm_id = matched.staff_id
FROM (
  SELECT DISTINCT ON (p2.id)
    p2.id AS project_id,
    s.id AS staff_id
  FROM public.quotation_client_project p2
  JOIN public.staffs s
    ON lower(btrim(COALESCE(s.status, ''))) = 'active'
   AND NULLIF(btrim(s.display_name), '') IS NOT NULL
   AND NULLIF(btrim(p2.assigned_pm_name), '') IS NOT NULL
   AND (
     lower(btrim(p2.assigned_pm_name)) = lower(btrim(s.display_name))
     OR lower(btrim(p2.assigned_pm_name)) LIKE lower(btrim(s.display_name)) || ' -%'
     OR lower(btrim(p2.assigned_pm_name)) LIKE lower(btrim(s.display_name)) || ' –%'
     OR lower(btrim(p2.assigned_pm_name)) LIKE lower(btrim(s.display_name)) || ' —%'
     OR lower(btrim(s.display_name)) LIKE lower(btrim(p2.assigned_pm_name)) || ' %'
   )
  WHERE p2.main_pm_id IS NULL
  ORDER BY p2.id, s.created_at DESC NULLS LAST
) matched
WHERE p.id = matched.project_id
  AND p.main_pm_id IS NULL;
