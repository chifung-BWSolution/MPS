-- BWT Active 2 boards → asana_synced_tasks (Asana 待匯入 auto sync).
-- https://app.asana.com/1/6649488167653/project/1208704092427508
-- https://app.asana.com/1/6649488167653/project/1208704092427578
-- Same rules as BWT Active 1: tasks created from 2026, infer bwt_web / bwt_system
-- from the task name, status from the 狀態 custom field.
-- The /list/ ids in the source URLs are list views, not sections.

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
VALUES
  (
    '1208704092427508',
    'BWT Active 2 真客 Pitching Proposal',
    '6649488167653',
    ARRAY['bwt_web', 'bwt_system'],
    NULL,
    2026,
    'created_from',
    NULL,
    false,
    NULL,
    '狀態',
    true
  ),
  (
    '1208704092427578',
    'BWT Active 2A 重大項目投標 Key Pitching',
    '6649488167653',
    ARRAY['bwt_web', 'bwt_system'],
    NULL,
    2026,
    'created_from',
    NULL,
    false,
    NULL,
    '狀態',
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
