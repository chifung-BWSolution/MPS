-- Unify Pitching + Project data in quotation_client_project table

ALTER TABLE public.pitching_records RENAME TO quotation_client_project;

ALTER INDEX IF EXISTS pitching_records_inquiry_date_idx
  RENAME TO quotation_client_project_inquiry_date_idx;
ALTER INDEX IF EXISTS pitching_records_status_idx
  RENAME TO quotation_client_project_status_idx;
ALTER INDEX IF EXISTS pitching_records_asana_project_idx
  RENAME TO quotation_client_project_asana_project_idx;

-- BWT Active 3 deals appear on Project page as 確認項目
UPDATE public.asana_pitching_projects
SET sync_default_status = 'confirmed', updated_at = now()
WHERE project_gid = '1208704092427590';

UPDATE public.quotation_client_project
SET status = 'confirmed', updated_at = now()
WHERE asana_project_gid = '1208704092427590' AND status = 'closed';

COMMENT ON TABLE public.quotation_client_project IS
  'Pitching + Project pages share this table; Project page filters status = confirmed';
