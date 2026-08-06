-- BWL Active 3 已成交+開工 DONE Deal: sync to Pitching + Project (status 確認項目)

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
  '1210778431910929',
  'BWL Active 3 已成交+開工 DONE Deal',
  '6649488167653',
  ARRAY['bwl_event'],
  NULL,
  2026,
  'created_from',
  '狀態',
  'confirmed',
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
  status_field_name = EXCLUDED.status_field_name,
  sync_default_status = EXCLUDED.sync_default_status,
  sync_section_name = EXCLUDED.sync_section_name,
  sync_project_types_only = EXCLUDED.sync_project_types_only,
  enabled = true,
  updated_at = now();
