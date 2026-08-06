-- Pitching Asana sync rules: single project, 2026 tasks, custom-field status

ALTER TABLE public.pitching_records
  ADD COLUMN IF NOT EXISTS asana_status_label text;

ALTER TABLE public.asana_pitching_projects
  ADD COLUMN IF NOT EXISTS sync_year integer,
  ADD COLUMN IF NOT EXISTS status_field_name text;

-- Only sync BWT Active 1 開始緊密跟進中; disable other seeded projects
UPDATE public.asana_pitching_projects
SET enabled = false, updated_at = now()
WHERE project_gid <> '1209549009281325';

UPDATE public.asana_pitching_projects
SET
  project_name = 'BWT Active 1 開始緊密跟進中',
  workspace_gid = '6649488167653',
  project_types = ARRAY['bwt_web', 'bwt_system'],
  sync_year = 2026,
  status_field_name = '狀態',
  enabled = true,
  updated_at = now()
WHERE project_gid = '1209549009281325';

INSERT INTO public.asana_pitching_projects (
  project_gid, project_name, workspace_gid, project_types, sync_year, status_field_name, enabled
)
VALUES (
  '1209549009281325',
  'BWT Active 1 開始緊密跟進中',
  '6649488167653',
  ARRAY['bwt_web', 'bwt_system'],
  2026,
  '狀態',
  true
)
ON CONFLICT (project_gid) DO UPDATE SET
  project_name = EXCLUDED.project_name,
  sync_year = EXCLUDED.sync_year,
  status_field_name = EXCLUDED.status_field_name,
  enabled = true,
  updated_at = now();

ALTER TABLE public.asana_pitching_sync_runs
  ADD COLUMN IF NOT EXISTS tasks_skipped integer NOT NULL DEFAULT 0;
