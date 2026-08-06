-- BWT Active 3: sync active incomplete deals (due/created 2026+), not created_at only

ALTER TABLE public.asana_pitching_projects
  ADD COLUMN IF NOT EXISTS sync_date_mode text
    CHECK (sync_date_mode IS NULL OR sync_date_mode IN ('created_exact', 'created_from', 'active_deal'));

UPDATE public.asana_pitching_projects
SET sync_date_mode = 'created_exact', updated_at = now()
WHERE project_gid = '1208704092427502' AND sync_date_mode IS NULL;

UPDATE public.asana_pitching_projects
SET
  sync_date_mode = 'active_deal',
  sync_year_from = 2026,
  updated_at = now()
WHERE project_gid = '1208704092427590';
