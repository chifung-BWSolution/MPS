-- Post-merge verification.

SELECT 'remaining_auto_dupes' AS check_name, count(*)::text AS value
FROM (
  SELECT public.canonical_domain_url(domain_url) AS k
  FROM public.webandsystem_list
  WHERE public.canonical_domain_url(domain_url) IS NOT NULL
  GROUP BY 1
  HAVING count(*) > 1
) d
UNION ALL
SELECT 'merge_log_rows', count(*)::text FROM public.webandsystem_merge_log
UNION ALL
SELECT 'conflict_rows', count(*)::text FROM public.webandsystem_duplicate_conflicts
UNION ALL
SELECT 'unique_index', CASE WHEN EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'webandsystem_list_domain_url_uidx'
) THEN 'present' ELSE 'missing' END
UNION ALL
SELECT 'dirty_domain_urls', count(*)::text
FROM public.webandsystem_list
WHERE domain_url IS DISTINCT FROM public.canonical_domain_url(domain_url)
UNION ALL
SELECT 'canonicalize_trigger', CASE WHEN EXISTS (
  SELECT 1 FROM pg_trigger
  WHERE tgname = 'trg_canonicalize_webandsystem_domain'
) THEN 'present' ELSE 'missing' END;
