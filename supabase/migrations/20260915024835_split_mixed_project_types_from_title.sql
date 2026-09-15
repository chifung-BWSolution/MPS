-- Split illegal Market+Dev project_types using Asana task title keywords.
--   網站 / 網頁 / website → bwt_web
--   系統 / 程式 / system / 網店 → bwt_system
--   活動 / event → bwl_event
-- BWT-S26-001 title hits both system and event; assigned bwt_system.
-- Pitching codes stay as-is; realign them in a later pass.

ALTER TABLE public.quotation_client_project
  DISABLE TRIGGER trg_assign_pitching_code;

UPDATE public.quotation_client_project q
SET
  project_types = v.proposed_types,
  updated_at = now()
FROM (
  SELECT
    id,
    CASE
      WHEN pitching_code = 'BWT-S26-001' THEN ARRAY['bwt_system']::text[]
      ELSE ARRAY_REMOVE(
        ARRAY[
          CASE WHEN display_name ~* '網站|網頁|website' THEN 'bwt_web' END,
          CASE WHEN display_name ~* '系統|程式|system|網店' THEN 'bwt_system' END,
          CASE WHEN display_name ~* '活動|event' THEN 'bwl_event' END
        ],
        NULL
      )
    END AS proposed_types
  FROM public.quotation_client_project
  WHERE project_types && ARRAY['bwl_event', 'bwg_gift']::text[]
    AND project_types && ARRAY['bwt_web', 'bwt_system']::text[]
) v
WHERE q.id = v.id
  AND cardinality(v.proposed_types) > 0
  AND NOT (
    v.proposed_types && ARRAY['bwl_event', 'bwg_gift']::text[]
    AND v.proposed_types && ARRAY['bwt_web', 'bwt_system']::text[]
  )
  AND q.project_types IS DISTINCT FROM v.proposed_types;

ALTER TABLE public.quotation_client_project
  ENABLE TRIGGER trg_assign_pitching_code;
