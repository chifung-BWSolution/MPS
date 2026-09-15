-- Read-only summary for title-keyword classification of illegal mixes.

WITH illegal AS (
  SELECT q.id, q.display_name, q.project_types, q.status, q.pitching_code
  FROM public.quotation_client_project q
  WHERE (q.project_types && ARRAY['bwl_event', 'bwg_gift']::text[])
    AND (q.project_types && ARRAY['bwt_web', 'bwt_system']::text[])
),
classified AS (
  SELECT
    i.*,
    i.display_name ~* '網站|網頁|website' AS hit_web,
    i.display_name ~* '系統|程式|system|網店' AS hit_system,
    i.display_name ~* '活動|event' AS hit_event
  FROM illegal i
)
SELECT
  CASE
    WHEN NOT (hit_web OR hit_system OR hit_event) THEN 'review_no_keyword'
    WHEN hit_event AND (hit_web OR hit_system) THEN 'review_title_conflict'
    ELSE 'auto'
  END AS decision,
  CASE
    WHEN NOT (hit_web OR hit_system OR hit_event) THEN NULL
    WHEN hit_event AND (hit_web OR hit_system) THEN NULL
    ELSE ARRAY_REMOVE(
      ARRAY[
        CASE WHEN hit_web THEN 'bwt_web' END,
        CASE WHEN hit_system THEN 'bwt_system' END,
        CASE WHEN hit_event THEN 'bwl_event' END
      ],
      NULL
    )::text
  END AS proposed_types,
  count(*) AS rows,
  count(*) FILTER (WHERE status = 'closed') AS closed,
  count(*) FILTER (WHERE status = 'confirmed') AS confirmed,
  count(*) FILTER (WHERE status IN ('initial', 'following_up')) AS open_pitching
FROM classified
GROUP BY 1, 2
ORDER BY 1, 2;
