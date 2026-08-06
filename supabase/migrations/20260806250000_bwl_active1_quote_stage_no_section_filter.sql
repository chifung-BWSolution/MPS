-- BWL Active 1 準備報價單 Quote Stage: import all project tasks from 2026 (no section filter)

ALTER TABLE public.asana_pitching_projects
  DROP CONSTRAINT IF EXISTS asana_pitching_projects_sync_date_mode_check;

ALTER TABLE public.asana_pitching_projects
  ADD CONSTRAINT asana_pitching_projects_sync_date_mode_check
  CHECK (sync_date_mode IS NULL OR sync_date_mode IN (
    'created_exact', 'created_from', 'active_deal', 'created_or_due_from', 'pipeline', 'all'
  ));

UPDATE public.asana_pitching_projects
SET
  project_name = 'BWL Active 1 準備報價單 Quote Stage',
  project_types = ARRAY['bwl_event'],
  sync_year = NULL,
  sync_year_from = 2026,
  sync_date_mode = 'all',
  sync_section_name = NULL,
  sync_project_types_only = false,
  status_field_name = '狀態',
  enabled = true,
  updated_at = now()
WHERE project_gid = '1201898424971757';
