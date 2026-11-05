-- BWL Active 2 boards → asana_synced_tasks (Asana 待匯入 auto sync).
-- https://app.asana.com/1/6649488167653/project/1210778431910916
-- https://app.asana.com/1/6649488167653/project/1211379536259396
-- Pitching boards, not DONE Deal: created from 2026, status from 狀態.
-- Active 2A's board name contains "Website"; lock bwl_event so that word
-- does not also tag every task as bwt_web.
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
    '1210778431910916',
    'BWL Active 2 真客 緊密互動 Design Pitching',
    '6649488167653',
    ARRAY['bwl_event'],
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
    '1211379536259396',
    'BWL Active 2A Website 高機會投標 Pitching',
    '6649488167653',
    ARRAY['bwl_event'],
    NULL,
    2026,
    'created_from',
    NULL,
    true,
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
