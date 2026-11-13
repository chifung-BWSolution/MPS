-- B2B Wine Event client board → asana_synced_tasks (Asana 待匯入 auto sync).
-- https://app.asana.com/1/6649488167653/project/6985906817346
-- 市場項目管理 / BWL 活動 (bwl_event). Pitching-style window: created from 2026.
-- The /list/ id is a saved list view, not a section. The board has no 狀態
-- field; Work Status is the status field ("Job Done!" maps to closed).
-- Lock bwl_event so a task name cannot also tag the row as web or system.

INSERT INTO public.asana_pitching_projects (
  project_gid,
  project_name,
  workspace_gid,
  project_types,
  sync_year,
  sync_year_from,
  sync_date_mode,
  sync_section_name,
  sync_project_types_only,
  sync_default_status,
  status_field_name,
  enabled
)
VALUES (
  '6985906817346',
  'B2B Wine Event Client 跟進 商業客戶',
  '6649488167653',
  ARRAY['bwl_event'],
  NULL,
  2026,
  'created_from',
  NULL,
  true,
  NULL,
  'Work Status',
  true
)
ON CONFLICT (project_gid) DO UPDATE SET
  project_name = EXCLUDED.project_name,
  workspace_gid = EXCLUDED.workspace_gid,
  project_types = EXCLUDED.project_types,
  sync_year = EXCLUDED.sync_year,
  sync_year_from = EXCLUDED.sync_year_from,
  sync_date_mode = EXCLUDED.sync_date_mode,
  sync_section_name = EXCLUDED.sync_section_name,
  sync_project_types_only = EXCLUDED.sync_project_types_only,
  sync_default_status = EXCLUDED.sync_default_status,
  status_field_name = EXCLUDED.status_field_name,
  enabled = true,
  updated_at = now();
