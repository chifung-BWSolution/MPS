-- GSC sync writes seo_keywords in batches. Plain INSERT races the
-- (website_profile_id, normalized_keyword) unique index when the same
-- query already exists or two GSC properties map to one website.
-- This RPC upserts ranks without overwriting manual level/status.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seo_keywords_website_normalized_key'
  ) THEN
    ALTER TABLE public.seo_keywords
      ADD CONSTRAINT seo_keywords_website_normalized_key
      UNIQUE USING INDEX seo_keywords_website_normalized_uidx;
  END IF;
EXCEPTION
  WHEN duplicate_table THEN
    NULL;
  WHEN duplicate_object THEN
    NULL;
END
$$;

CREATE OR REPLACE FUNCTION public.upsert_gsc_seo_keywords(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'array' THEN
    RETURN 0;
  END IF;

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
    COALESCE(NULLIF(r->>'id', ''), gen_random_uuid()::text),
    r->>'website_profile_id',
    r->>'keyword',
    r->>'normalized_keyword',
    COALESCE(NULLIF(r->>'level', ''), 'level_3'),
    NULLIF(r->>'current_ranking', '')::numeric,
    COALESCE(NULLIF(r->>'status', ''), 'monitoring'),
    COALESCE(NULLIF(r->>'source', ''), 'gsc'),
    NULLIF(r->>'gsc_site_url', ''),
    NULLIF(r->>'last_gsc_sync_at', '')::timestamptz,
    COALESCE(NULLIF(r->>'updated_at', '')::timestamptz, now())
  FROM jsonb_array_elements(payload) AS r
  WHERE NULLIF(r->>'website_profile_id', '') IS NOT NULL
    AND NULLIF(r->>'normalized_keyword', '') IS NOT NULL
    AND NULLIF(r->>'keyword', '') IS NOT NULL
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

REVOKE ALL ON FUNCTION public.upsert_gsc_seo_keywords(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_gsc_seo_keywords(jsonb) TO service_role;
