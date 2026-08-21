-- quotation_client_list.brand_id becomes a unique comma-separated
-- list of brand_list.id values. Drop denormalized brand_code / brand_name
-- and unused whatsapp. Backfill from related project_types:
--   bwl_event              -> BWL  1bbb9536-cae7-54f0-a3ce-993711c2cf46
--   bwt_web / bwt_system   -> BWT  fed21b87-cf60-51cd-881f-99c4014c72a4

ALTER TABLE public.quotation_client_list
  DROP COLUMN IF EXISTS brand_code,
  DROP COLUMN IF EXISTS brand_name,
  DROP COLUMN IF EXISTS whatsapp;

UPDATE public.quotation_client_list c
SET brand_id = mapped.brand_ids
FROM (
  SELECT
    p.client_id,
    string_agg(DISTINCT brand_uuid, ',' ORDER BY brand_uuid) AS brand_ids
  FROM public.quotation_client_project p
  CROSS JOIN LATERAL unnest(COALESCE(p.project_types, ARRAY[]::text[])) AS t(project_type)
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN t.project_type = 'bwl_event' THEN '1bbb9536-cae7-54f0-a3ce-993711c2cf46'
      WHEN t.project_type IN ('bwt_web', 'bwt_system') THEN 'fed21b87-cf60-51cd-881f-99c4014c72a4'
    END AS brand_uuid
  ) m
  WHERE p.client_id IS NOT NULL
    AND m.brand_uuid IS NOT NULL
  GROUP BY p.client_id
) mapped
WHERE c.id = mapped.client_id;

COMMENT ON COLUMN public.quotation_client_list.brand_id IS
  'Comma-separated unique brand_list.id values; resolved from brand_list.';
