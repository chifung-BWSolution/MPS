-- Rebuild seo_keywords from the GSC warehouse so a later website match
-- (or a low-impression property) still gets query rows after sync.

CREATE OR REPLACE FUNCTION public.upsert_gsc_seo_keywords_from_metrics(
  p_website_profile_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  WITH agg AS (
    SELECT
      s.website_profile_id,
      lower(trim(regexp_replace(m.query, '\s+', ' ', 'g'))) AS normalized_keyword,
      (array_agg(m.query ORDER BY m.metric_date DESC, m.impressions DESC))[1] AS keyword,
      (array_agg(m.site_url ORDER BY m.metric_date DESC))[1] AS gsc_site_url,
      sum(m.impressions) AS impressions,
      CASE
        WHEN sum(m.impressions) > 0
          THEN round((sum(m.position * m.impressions) / sum(m.impressions))::numeric, 1)
        ELSE round(avg(m.position)::numeric, 1)
      END AS avg_pos,
      max(m.last_synced_at) AS last_gsc_sync_at
    FROM public.gsc_query_daily_metrics m
    JOIN public.gsc_sites s ON s.site_url = m.site_url
    WHERE s.website_profile_id IS NOT NULL
      AND (p_website_profile_id IS NULL OR s.website_profile_id = p_website_profile_id)
      AND nullif(trim(m.query), '') IS NOT NULL
    GROUP BY 1, 2
    HAVING sum(m.impressions) >= 1
  )
  INSERT INTO public.seo_keywords (
    id,
    website_profile_id,
    keyword,
    normalized_keyword,
    level,
    current_ranking,
    status,
    source,
    gsc_site_url,
    last_gsc_sync_at,
    updated_at
  )
  SELECT
    gen_random_uuid()::text,
    a.website_profile_id,
    a.keyword,
    a.normalized_keyword,
    'level_3',
    a.avg_pos,
    'monitoring',
    'gsc',
    a.gsc_site_url,
    a.last_gsc_sync_at,
    now()
  FROM agg a
  ON CONFLICT (website_profile_id, normalized_keyword)
  DO UPDATE SET
    current_ranking = EXCLUDED.current_ranking,
    gsc_site_url = EXCLUDED.gsc_site_url,
    last_gsc_sync_at = EXCLUDED.last_gsc_sync_at,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_gsc_seo_keywords_from_metrics(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_gsc_seo_keywords_from_metrics(text) TO anon, authenticated, service_role;
