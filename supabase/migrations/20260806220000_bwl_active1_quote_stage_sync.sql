-- BWL Active 1 Quote Stage section sync + section filter column

ALTER TABLE public.asana_pitching_projects
  ADD COLUMN IF NOT EXISTS sync_section_name text;

COMMENT ON COLUMN public.asana_pitching_projects.sync_section_name IS
  'When set, only sync tasks whose Asana section name contains this text (case-insensitive)';

-- BWL Active 1 準備報價單 — Quote Stage folder, tasks created from 2026
INSERT INTO public.asana_pitching_projects (
  project_gid,
  project_name,
  workspace_gid,
  project_types,
  sync_year_from,
  sync_date_mode,
  sync_section_name,
  status_field_name,
  enabled
)
VALUES (
  '1201898424971757',
  'BWL Active 1 準備報價單',
  '6649488167653',
  ARRAY['bwl_event'],
  2026,
  'created_from',
  'Quote Stage',
  '狀態',
  true
)
ON CONFLICT (project_gid) DO UPDATE SET
  project_name = EXCLUDED.project_name,
  project_types = EXCLUDED.project_types,
  sync_year_from = EXCLUDED.sync_year_from,
  sync_date_mode = EXCLUDED.sync_date_mode,
  sync_section_name = EXCLUDED.sync_section_name,
  status_field_name = EXCLUDED.status_field_name,
  enabled = true,
  updated_at = now();

-- BWT Active 3 DONE Deal — confirmed status, Project page (keep active_deal filter)
UPDATE public.asana_pitching_projects
SET
  project_name = 'BWT Active 3 已成交+開工 DONE Deal',
  sync_date_mode = 'active_deal',
  sync_year_from = 2026,
  sync_default_status = 'confirmed',
  sync_section_name = NULL,
  enabled = true,
  updated_at = now()
WHERE project_gid = '1208704092427590';
