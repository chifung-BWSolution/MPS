-- Read-only. Classify illegal Market+Dev mixes from Asana task title only.
-- No BWL/BWT board or prefix. Do not change pitching_code.

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
signals AS (
  SELECT
    i.*,
    i.display_name ~* '網站|網頁|website' AS hit_web,
    i.display_name ~* '系統|程式|system|網店' AS hit_system,
    i.display_name ~* '活動|event' AS hit_event
  FROM illegal i
),
classified AS (
  SELECT
    s.*,
    ARRAY_REMOVE(
      ARRAY[
        CASE WHEN s.hit_web THEN 'bwt_web' END,
        CASE WHEN s.hit_system THEN 'bwt_system' END,
        CASE WHEN s.hit_event THEN 'bwl_event' END
      ],
      NULL
    ) AS title_types,
    CASE
      WHEN NOT (s.hit_web OR s.hit_system OR s.hit_event) THEN 'review_no_keyword'
      WHEN s.hit_event AND (s.hit_web OR s.hit_system) THEN 'review_title_conflict'
      WHEN s.hit_web OR s.hit_system OR s.hit_event THEN 'auto'
      ELSE 'review_no_keyword'
    END AS decision
  FROM signals s
)
SELECT
  decision,
  pitching_code,
  status,
  inquiry_date,
  project_types AS old_types,
  title_types AS proposed_types,
  hit_web,
  hit_system,
  hit_event,
  display_name
FROM classified
ORDER BY
  CASE decision
    WHEN 'review_no_keyword' THEN 0
    WHEN 'review_title_conflict' THEN 1
    ELSE 2
  END,
  pitching_code;
