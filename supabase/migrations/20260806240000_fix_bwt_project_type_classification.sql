-- Restore correct project type inference for BWT Asana projects (not forced bwl_event)

-- BWT Active 1 開始緊密跟進中 — import from 2026+, infer bwt_web/bwt_system from task name
UPDATE public.asana_pitching_projects
SET
  project_types = ARRAY['bwt_web', 'bwt_system'],
  sync_year = NULL,
  sync_year_from = 2026,
  sync_date_mode = 'created_from',
  sync_section_name = NULL,
  sync_project_types_only = false,
  status_field_name = '狀態',
  enabled = true,
  updated_at = now()
WHERE project_gid = '1208704092427502';

-- BWT Active 3 已成交+開工 DONE Deal — from 2026, confirmed, infer types from task name
UPDATE public.asana_pitching_projects
SET
  project_types = ARRAY['bwt_web', 'bwt_system'],
  sync_year = NULL,
  sync_year_from = 2026,
  sync_date_mode = 'created_from',
  sync_default_status = 'confirmed',
  sync_section_name = NULL,
  sync_project_types_only = false,
  enabled = true,
  updated_at = now()
WHERE project_gid = '1208704092427590';

-- Re-infer project_types for existing BWT Asana rows (undo forced bwl_event bulk update)
UPDATE public.quotation_client_project q
SET
  project_types = (
    SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), ARRAY['bwt_web', 'bwt_system'])
    FROM (
      SELECT unnest(ARRAY['bwt_web', 'bwt_system']::text[]) AS t
      UNION
      SELECT 'bwl_event' WHERE q.display_name ~* 'bwl|活動|event|catering|fcc'
      UNION
      SELECT 'bwt_system' WHERE q.display_name ~* 'system|系統|ngo|platform|app'
      UNION
      SELECT 'bwt_web' WHERE q.display_name ~* 'web|網頁|website|shopify|site'
    ) inferred
  ),
  updated_at = now()
WHERE q.asana_project_gid IN ('1208704092427502', '1208704092427590');
