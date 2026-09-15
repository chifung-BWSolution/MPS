-- Read-only dry run v2.
-- Board is only a tie-break. Display-name product words win first,
-- because BWL Quote Stage also holds "BWL Website Design" / "BWL system" tasks.

WITH illegal AS (
  SELECT
    q.id,
    q.pitching_code,
    q.display_name,
    q.project_types,
    q.asana_project_gid,
    q.asana_project_name,
    q.webandsystem_list_id,
    q.status,
    q.inquiry_date
  FROM public.quotation_client_project q
  WHERE (q.project_types && ARRAY['bwl_event', 'bwg_gift']::text[])
    AND (q.project_types && ARRAY['bwt_web', 'bwt_system']::text[])
),
signals AS (
  SELECT
    i.*,
    COALESCE(i.asana_project_name, '') ~* '(^|[^a-z])bwl([^a-z]|$)' AS board_bwl,
    COALESCE(i.asana_project_name, '') ~* '(^|[^a-z])bwt([^a-z]|$)' AS board_bwt,
    COALESCE(i.asana_project_name, '') ~* '(^|[^a-z])bwg([^a-z]|$)' AS board_bwg,
    i.webandsystem_list_id IS NOT NULL
      AND btrim(i.webandsystem_list_id) <> '' AS has_website,
    i.display_name ~* 'website|網頁|(^|[^a-z])web([^a-z]|$)|shopify' AS name_website,
    i.display_name ~* 'system|系統' AS name_system,
    i.display_name ~* '活動|catering|(^|[^a-z])event([^a-z]|$)|fcc' AS name_event
  FROM illegal i
),
classified AS (
  SELECT
    s.*,
    CASE
      WHEN s.name_website OR s.name_system THEN 'dev'
      WHEN s.name_event THEN 'market'
      WHEN s.board_bwt AND NOT s.board_bwl THEN 'dev'
      WHEN s.board_bwg AND NOT s.board_bwl THEN 'market'
      WHEN s.board_bwl AND NOT s.board_bwt THEN 'market'
      WHEN s.has_website THEN 'dev'
      ELSE NULL
    END AS winner,
    CASE
      WHEN s.name_website OR s.name_system THEN 'name_dev_product'
      WHEN s.name_event THEN 'name_event_product'
      WHEN s.board_bwt AND NOT s.board_bwl THEN 'asana_bwt_board'
      WHEN s.board_bwg AND NOT s.board_bwl THEN 'asana_bwg_board'
      WHEN s.board_bwl AND NOT s.board_bwt THEN 'asana_bwl_board'
      WHEN s.has_website THEN 'website_link'
      ELSE 'no_signal'
    END AS reason
  FROM signals s
),
proposed AS (
  SELECT
    c.*,
    CASE
      WHEN c.winner IS NOT NULL AND c.reason LIKE 'name_%' THEN 'high'
      WHEN c.winner IS NOT NULL AND c.reason LIKE 'asana_%' THEN 'high'
      WHEN c.winner IS NOT NULL THEN 'medium'
      ELSE 'review'
    END AS confidence,
    CASE
      WHEN c.winner = 'market' THEN (
        SELECT COALESCE(array_agg(t ORDER BY t), ARRAY[]::text[])
        FROM unnest(c.project_types) AS t
        WHERE t IN ('bwl_event', 'bwg_gift')
      )
      WHEN c.winner = 'dev' THEN (
        SELECT COALESCE(array_agg(t ORDER BY t), ARRAY[]::text[])
        FROM unnest(c.project_types) AS t
        WHERE t IN ('bwt_web', 'bwt_system')
      )
      ELSE c.project_types
    END AS proposed_types
  FROM classified c
)
SELECT
  winner,
  confidence,
  reason,
  count(*) AS rows,
  count(*) FILTER (
    WHERE CASE
      WHEN pitching_code ~ '^(BWT-S|BWT-W|BWL-E|BWG-G)'
      THEN substring(pitching_code FROM '^(BWT-S|BWT-W|BWL-E|BWG-G)')
    END IS DISTINCT FROM
      CASE
        WHEN 'bwt_system' = ANY(proposed_types) THEN 'BWT-S'
        WHEN 'bwl_event' = ANY(proposed_types) THEN 'BWL-E'
        WHEN 'bwg_gift' = ANY(proposed_types) THEN 'BWG-G'
        ELSE 'BWT-W'
      END
  ) AS pitching_code_would_change,
  count(*) FILTER (WHERE has_website) AS with_website,
  count(*) FILTER (WHERE status = 'confirmed') AS confirmed,
  count(*) FILTER (WHERE status = 'closed') AS closed,
  count(*) FILTER (WHERE status IN ('initial', 'following_up')) AS open_pitching
FROM proposed
GROUP BY winner, confidence, reason
ORDER BY confidence, winner, reason;
