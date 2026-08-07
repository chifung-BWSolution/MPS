-- Project page: BWT Active 3 Asana sync + extended project config columns

ALTER TABLE public.asana_pitching_projects
  ADD COLUMN IF NOT EXISTS sync_year_from integer,
  ADD COLUMN IF NOT EXISTS sync_default_status text
    CHECK (sync_default_status IS NULL OR sync_default_status IN ('initial', 'following_up', 'confirmed', 'closed'));

INSERT INTO public.asana_pitching_projects (
  project_gid,
  project_name,
  workspace_gid,
  project_types,
  sync_year_from,
  sync_default_status,
  enabled
)
VALUES (
  '1208704092427590',
  'BWT Active 3 已成交+開工 DONE Deal',
  '6649488167653',
  ARRAY['bwt_web', 'bwt_system'],
  2026,
  'confirmed',
  true
)
ON CONFLICT (project_gid) DO UPDATE SET
  project_name = EXCLUDED.project_name,
  sync_year_from = EXCLUDED.sync_year_from,
  sync_default_status = EXCLUDED.sync_default_status,
  enabled = true,
  updated_at = now();
