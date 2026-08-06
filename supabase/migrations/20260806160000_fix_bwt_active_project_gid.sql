-- Fix wrong Asana project GID (1209549009281325 = BWA Video V12, not BWT Active 1)

UPDATE public.asana_pitching_projects
SET enabled = false, updated_at = now()
WHERE project_gid = '1209549009281325';

INSERT INTO public.asana_pitching_projects (
  project_gid, project_name, workspace_gid, project_types, sync_year, status_field_name, enabled
)
VALUES (
  '1208704092427502',
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

DELETE FROM public.pitching_records
WHERE asana_project_gid = '1209549009281325';
