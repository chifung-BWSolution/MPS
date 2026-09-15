-- Read-only dry run: classify illegal Market+Dev project_types mixes.
-- Does not UPDATE. Winner rules match the event/website backfill plan.

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
    q.inquiry_date,
    q.description,
    (q.project_types && ARRAY['bwl_event', 'bwg_gift']::text[])
      AND (q.project_types && ARRAY['bwt_web', 'bwt_system']::text[]) AS is_illegal
  FROM public.quotation_client_project q
  WHERE (q.project_types && ARRAY['bwl_event', 'bwg_gift']::text[])
    AND (q.project_types && ARRAY['bwt_web', 'bwt_system']::text[])
),
signals AS (
  SELECT
    i.*,
    COALESCE(i.asana_project_name, '') ~* '(^|[^a-z])bwl([^a-z]|$)'
      OR COALESCE(i.asana_project_gid, '') IN (
        '1201898424971757',
        '1211890558196535'
      ) AS board_bwl,
    COALESCE(i.asana_project_name, '') ~* '(^|[^a-z])bwt([^a-z]|$)'
      OR COALESCE(i.asana_project_gid, '') IN (
        '1209549009281325',
        '1211890558234957',
        '1208704092427502',
        '1208704092427590'
      ) AS board_bwt,
    COALESCE(i.asana_project_name, '') ~* '(^|[^a-z])bwg([^a-z]|$)'
      OR COALESCE(i.asana_project_gid, '') = '1210520368067621' AS board_bwg,
    i.webandsystem_list_id IS NOT NULL
      AND btrim(i.webandsystem_list_id) <> '' AS has_website,
    (
      COALESCE(i.display_name, '') || ' ' || COALESCE(i.description, '')
    ) ~* 'bwl|活動|event|catering|fcc' AS name_event,
    (
      COALESCE(i.display_name, '') || ' ' || COALESCE(i.description, '')
    ) ~* 'web|網頁|website|shopify|site' AS name_web,
    (
      COALESCE(i.display_name, '') || ' ' || COALESCE(i.description, '')
    ) ~* 'system|系統|ngo|platform|app' AS name_system
  FROM illegal i
),
classified AS (
  SELECT
    s.*,
    CASE
      WHEN s.board_bwl AND NOT s.board_bwt AND NOT s.board_bwg THEN 'market'
      WHEN s.board_bwt AND NOT s.board_bwl AND NOT s.board_bwg THEN 'dev'
      WHEN s.board_bwg AND NOT s.board_bwl AND NOT s.board_bwt THEN 'market'
      WHEN s.board_bwl AND (s.board_bwt OR s.board_bwg) THEN NULL
      WHEN s.has_website AND NOT s.board_bwl THEN 'dev'
      WHEN s.name_event AND NOT s.name_web AND NOT s.name_system THEN 'market'
      WHEN (s.name_web OR s.name_system) AND NOT s.name_event THEN 'dev'
      ELSE NULL
    END AS winner,
    CASE
      WHEN s.board_bwl AND NOT s.board_bwt AND NOT s.board_bwg THEN 'asana_bwl_board'
      WHEN s.board_bwt AND NOT s.board_bwl AND NOT s.board_bwg THEN 'asana_bwt_board'
      WHEN s.board_bwg AND NOT s.board_bwl AND NOT s.board_bwt THEN 'asana_bwg_board'
      WHEN s.board_bwl AND (s.board_bwt OR s.board_bwg) THEN 'conflicting_boards'
      WHEN s.has_website AND NOT s.board_bwl THEN 'website_link'
      WHEN s.name_event AND NOT s.name_web AND NOT s.name_system THEN 'name_event_only'
      WHEN (s.name_web OR s.name_system) AND NOT s.name_event THEN 'name_dev_only'
      WHEN s.name_event AND (s.name_web OR s.name_system) THEN 'name_both_families'
      ELSE 'no_signal'
    END AS reason
  FROM signals s
),
proposed AS (
  SELECT
    c.*,
    CASE
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
),
with_prefix AS (
  SELECT
    p.*,
    CASE
      WHEN p.pitching_code ~ '^(BWT-S|BWT-W|BWL-E|BWG-G)[0-9]{2}-[0-9]{3}$'
      THEN substring(p.pitching_code FROM '^(BWT-S|BWT-W|BWL-E|BWG-G)')
    END AS current_prefix,
    CASE
      WHEN 'bwt_system' = ANY(p.proposed_types) THEN 'BWT-S'
      WHEN 'bwl_event' = ANY(p.proposed_types) THEN 'BWL-E'
      WHEN 'bwg_gift' = ANY(p.proposed_types) THEN 'BWG-G'
      ELSE 'BWT-W'
    END AS proposed_prefix
  FROM proposed p
)
SELECT
  id,
  pitching_code,
  current_prefix,
  proposed_prefix,
  (current_prefix IS DISTINCT FROM proposed_prefix) AS pitching_code_would_change,
  display_name,
  project_types AS old_types,
  proposed_types,
  winner,
  confidence,
  reason,
  asana_project_name,
  asana_project_gid,
  has_website,
  status,
  inquiry_date
FROM with_prefix
ORDER BY
  CASE confidence WHEN 'review' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
  reason,
  inquiry_date,
  id;
