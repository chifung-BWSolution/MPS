-- Read-only: v2 classified rows (name product words beat board).

WITH illegal AS (
  SELECT
    q.id,
    q.pitching_code,
    q.display_name,
    q.project_types,
    q.asana_project_name,
    q.status,
    q.inquiry_date
  FROM public.quotation_client_project q
  WHERE (q.project_types && ARRAY['bwl_event', 'bwg_gift']::text[])
    AND (q.project_types && ARRAY['bwt_web', 'bwt_system']::text[])
),
classified AS (
  SELECT
    i.*,
    CASE
      WHEN i.display_name ~* 'website|網頁|(^|[^a-z])web([^a-z]|$)|shopify'
        OR i.display_name ~* 'system|系統'
      THEN ARRAY(
        SELECT t
        FROM unnest(i.project_types) AS t
        WHERE t IN ('bwt_web', 'bwt_system')
        ORDER BY t
      )
      ELSE i.project_types
    END AS proposed_types
  FROM illegal i
)
SELECT
  pitching_code,
  CASE
    WHEN pitching_code ~ '^(BWT-S|BWT-W|BWL-E|BWG-G)'
    THEN substring(pitching_code FROM '^(BWT-S|BWT-W|BWL-E|BWG-G)')
  END AS current_prefix,
  CASE
    WHEN 'bwt_system' = ANY(proposed_types) THEN 'BWT-S'
    WHEN 'bwl_event' = ANY(proposed_types) THEN 'BWL-E'
    WHEN 'bwg_gift' = ANY(proposed_types) THEN 'BWG-G'
    ELSE 'BWT-W'
  END AS proposed_prefix,
  project_types AS old_types,
  proposed_types,
  status,
  inquiry_date,
  display_name
FROM classified
ORDER BY
  CASE
    WHEN pitching_code ~ '^(BWT-S|BWT-W|BWL-E|BWG-G)'
    THEN substring(pitching_code FROM '^(BWT-S|BWT-W|BWL-E|BWG-G)')
  END,
  pitching_code;
