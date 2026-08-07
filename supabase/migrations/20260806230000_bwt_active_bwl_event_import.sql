-- BWT Active 1 + BWT Active 3: import from 2026+, classify as BWL 活動報價

ALTER TABLE public.asana_pitching_projects
  ADD COLUMN IF NOT EXISTS sync_project_types_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.asana_pitching_projects.sync_project_types_only IS
  'When true, synced rows use project_types from config without task-name inference';

-- BWT Active 1 開始緊密跟進中 — all tasks created from 2026, fixed bwl_event type
UPDATE public.asana_pitching_projects
SET
  project_types = ARRAY['bwl_event'],
  sync_year = NULL,
  sync_year_from = 2026,
  sync_date_mode = 'created_from',
  sync_section_name = NULL,
  sync_project_types_only = true,
  status_field_name = '狀態',
  enabled = true,
  updated_at = now()
WHERE project_gid = '1208704092427502';

-- BWT Active 3 已成交+開工 DONE Deal — from 2026, confirmed, fixed bwl_event type
UPDATE public.asana_pitching_projects
SET
  project_types = ARRAY['bwl_event'],
  sync_year = NULL,
  sync_year_from = 2026,
  sync_date_mode = 'created_from',
  sync_default_status = 'confirmed',
  sync_section_name = NULL,
  sync_project_types_only = true,
  enabled = true,
  updated_at = now()
WHERE project_gid = '1208704092427590';

-- Reclassify already-imported rows from these two Asana projects
UPDATE public.quotation_client_project
SET
  project_types = ARRAY['bwl_event'],
  updated_at = now()
WHERE asana_project_gid IN ('1208704092427502', '1208704092427590');
