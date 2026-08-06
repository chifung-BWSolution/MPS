-- Fix BWL Active 1 Quote Stage: use correct Asana project GID (was 1201898424971757)

-- Disable the old/wrong project (different Asana board)
UPDATE public.asana_pitching_projects
SET enabled = false, updated_at = now()
WHERE project_gid = '1201898424971757';

-- Register the correct Asana project
INSERT INTO public.asana_pitching_projects (
  project_gid,
  project_name,
  workspace_gid,
  project_types,
  sync_year,
  sync_year_from,
  sync_date_mode,
  status_field_name,
  sync_default_status,
  sync_section_name,
  sync_project_types_only,
  enabled
) VALUES (
  '1209067264157442',
  'BWL Active 1 準備報價單 Quote Stage',
  '6649488167653',
  ARRAY['bwl_event'],
  NULL,
  2026,
  'pipeline',
  '狀態',
  NULL,
  NULL,
  false,
  true
)
ON CONFLICT (project_gid) DO UPDATE SET
  project_name = EXCLUDED.project_name,
  project_types = EXCLUDED.project_types,
  sync_year = EXCLUDED.sync_year,
  sync_year_from = EXCLUDED.sync_year_from,
  sync_date_mode = EXCLUDED.sync_date_mode,
  sync_section_name = EXCLUDED.sync_section_name,
  sync_project_types_only = EXCLUDED.sync_project_types_only,
  enabled = true,
  updated_at = now();

-- Remove rows imported from the wrong Asana project to avoid duplicates on Pitching page
DELETE FROM public.quotation_client_project
WHERE asana_project_gid = '1201898424971757';
