-- Read-only summary of illegal Market+Dev mixes.

SELECT 'mix_inventory' AS section, project_types::text AS key, count(*)::text AS value
FROM public.quotation_client_project
WHERE project_types && ARRAY['bwl_event', 'bwg_gift']::text[]
  AND project_types && ARRAY['bwt_web', 'bwt_system']::text[]
GROUP BY project_types

UNION ALL

SELECT
  'board',
  COALESCE(asana_project_name, '(none)'),
  count(*)::text
FROM public.quotation_client_project
WHERE project_types && ARRAY['bwl_event', 'bwg_gift']::text[]
  AND project_types && ARRAY['bwt_web', 'bwt_system']::text[]
GROUP BY asana_project_name

UNION ALL

SELECT
  'status',
  status,
  count(*)::text
FROM public.quotation_client_project
WHERE project_types && ARRAY['bwl_event', 'bwg_gift']::text[]
  AND project_types && ARRAY['bwt_web', 'bwt_system']::text[]
GROUP BY status

UNION ALL

SELECT
  'website_link',
  CASE
    WHEN webandsystem_list_id IS NOT NULL AND btrim(webandsystem_list_id) <> '' THEN 'yes'
    ELSE 'no'
  END,
  count(*)::text
FROM public.quotation_client_project
WHERE project_types && ARRAY['bwl_event', 'bwg_gift']::text[]
  AND project_types && ARRAY['bwt_web', 'bwt_system']::text[]
GROUP BY 2

UNION ALL

SELECT
  'name_shape',
  CASE
    WHEN display_name ~* 'website|網頁|web' AND display_name ~* 'system|系統'
      THEN 'name_web_and_system'
    WHEN display_name ~* 'website|網頁|web' THEN 'name_website'
    WHEN display_name ~* 'system|系統' THEN 'name_system'
    WHEN display_name ~* '活動|event|catering|fcc' THEN 'name_event'
    ELSE 'name_other'
  END,
  count(*)::text
FROM public.quotation_client_project
WHERE project_types && ARRAY['bwl_event', 'bwg_gift']::text[]
  AND project_types && ARRAY['bwt_web', 'bwt_system']::text[]
GROUP BY 2

UNION ALL

SELECT 'illegal_total', 'quotation_client_project', count(*)::text
FROM public.quotation_client_project
WHERE project_types && ARRAY['bwl_event', 'bwg_gift']::text[]
  AND project_types && ARRAY['bwt_web', 'bwt_system']::text[]

UNION ALL

SELECT 'illegal_total', 'asana_synced_tasks', count(*)::text
FROM public.asana_synced_tasks
WHERE project_types && ARRAY['bwl_event', 'bwg_gift']::text[]
  AND project_types && ARRAY['bwt_web', 'bwt_system']::text[]

UNION ALL

SELECT
  'has_incomes',
  CASE WHEN i.quotation_client_project_id IS NOT NULL THEN 'yes' ELSE 'no' END,
  count(*)::text
FROM public.quotation_client_project q
LEFT JOIN (
  SELECT DISTINCT quotation_client_project_id
  FROM public.incomes
) i ON i.quotation_client_project_id = q.id
WHERE q.project_types && ARRAY['bwl_event', 'bwg_gift']::text[]
  AND q.project_types && ARRAY['bwt_web', 'bwt_system']::text[]
GROUP BY 2

ORDER BY 1, 2;
