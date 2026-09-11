-- Merge format-only webandsystem_list clones, backfill domain_url, then lock.

CREATE TABLE IF NOT EXISTS public.webandsystem_merge_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keeper_id text NOT NULL,
  loser_ids text[] NOT NULL,
  canonical_domain text,
  coalesced_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  discarded_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webandsystem_duplicate_conflicts (
  canonical_domain text PRIMARY KEY,
  profile_ids text[] NOT NULL,
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webandsystem_merge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webandsystem_duplicate_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on webandsystem_merge_log" ON public.webandsystem_merge_log;
CREATE POLICY "Allow select on webandsystem_merge_log"
  ON public.webandsystem_merge_log FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow select on webandsystem_duplicate_conflicts" ON public.webandsystem_duplicate_conflicts;
CREATE POLICY "Allow select on webandsystem_duplicate_conflicts"
  ON public.webandsystem_duplicate_conflicts FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.webandsystem_merge_log TO anon, authenticated;
GRANT SELECT ON public.webandsystem_duplicate_conflicts TO anon, authenticated;
GRANT ALL ON public.webandsystem_merge_log TO service_role;
GRANT ALL ON public.webandsystem_duplicate_conflicts TO service_role;

CREATE OR REPLACE FUNCTION public.merge_webandsystem_profile(
  p_keeper_id text,
  p_loser_ids text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  keeper public.webandsystem_list%ROWTYPE;
  loser public.webandsystem_list%ROWTYPE;
  loser_id text;
  keeper_project_id uuid;
  loser_project_ids uuid[];
  canonical text;
  coalesced jsonb := '{}'::jsonb;
  discarded jsonb := '{}'::jsonb;
BEGIN
  IF p_keeper_id IS NULL OR p_loser_ids IS NULL OR cardinality(p_loser_ids) = 0 THEN
    RAISE EXCEPTION 'merge_webandsystem_profile requires keeper and loser ids';
  END IF;
  IF p_keeper_id = ANY (p_loser_ids) THEN
    RAISE EXCEPTION 'keeper_id cannot also be a loser';
  END IF;

  SELECT * INTO keeper FROM public.webandsystem_list WHERE id = p_keeper_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'keeper website % is missing', p_keeper_id;
  END IF;

  FOREACH loser_id IN ARRAY p_loser_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.webandsystem_list WHERE id = loser_id) THEN
      RAISE EXCEPTION 'loser website % is missing', loser_id;
    END IF;
  END LOOP;

  canonical := COALESCE(
    public.canonical_domain_url(keeper.domain_url),
    (
      SELECT public.canonical_domain_url(w.domain_url)
      FROM public.webandsystem_list w
      WHERE w.id = ANY (p_loser_ids)
        AND public.canonical_domain_url(w.domain_url) IS NOT NULL
      LIMIT 1
    )
  );

  FOREACH loser_id IN ARRAY p_loser_ids LOOP
    SELECT * INTO loser FROM public.webandsystem_list WHERE id = loser_id;

    IF keeper.ga4_property_id IS NULL AND loser.ga4_property_id IS NOT NULL THEN
      keeper.ga4_property_id := loser.ga4_property_id;
      coalesced := coalesced || jsonb_build_object('ga4_property_id', loser.ga4_property_id);
    ELSIF keeper.ga4_property_id IS NOT NULL AND loser.ga4_property_id IS NOT NULL
      AND keeper.ga4_property_id IS DISTINCT FROM loser.ga4_property_id THEN
      discarded := discarded || jsonb_build_object(loser_id || '.ga4_property_id', loser.ga4_property_id);
    END IF;

    IF keeper.gsc_site_url IS NULL AND loser.gsc_site_url IS NOT NULL THEN
      keeper.gsc_site_url := loser.gsc_site_url;
      coalesced := coalesced || jsonb_build_object('gsc_site_url', loser.gsc_site_url);
    ELSIF keeper.gsc_site_url IS NOT NULL AND loser.gsc_site_url IS NOT NULL
      AND keeper.gsc_site_url IS DISTINCT FROM loser.gsc_site_url THEN
      discarded := discarded || jsonb_build_object(loser_id || '.gsc_site_url', loser.gsc_site_url);
    END IF;

    IF keeper.google_ads_customer_id IS NULL AND loser.google_ads_customer_id IS NOT NULL THEN
      keeper.google_ads_customer_id := loser.google_ads_customer_id;
      coalesced := coalesced || jsonb_build_object('google_ads_customer_id', loser.google_ads_customer_id);
    ELSIF keeper.google_ads_customer_id IS NOT NULL AND loser.google_ads_customer_id IS NOT NULL
      AND keeper.google_ads_customer_id IS DISTINCT FROM loser.google_ads_customer_id THEN
      discarded := discarded || jsonb_build_object(loser_id || '.google_ads_customer_id', loser.google_ads_customer_id);
    END IF;

    IF keeper.brand_list_id IS NULL AND loser.brand_list_id IS NOT NULL THEN
      keeper.brand_list_id := loser.brand_list_id;
      coalesced := coalesced || jsonb_build_object('brand_list_id', loser.brand_list_id);
    END IF;
    IF keeper.company_list_id IS NULL AND loser.company_list_id IS NOT NULL THEN
      keeper.company_list_id := loser.company_list_id;
      coalesced := coalesced || jsonb_build_object('company_list_id', loser.company_list_id);
    END IF;
    IF keeper.brand IS NULL AND loser.brand IS NOT NULL THEN
      keeper.brand := loser.brand;
    END IF;
    IF keeper.company IS NULL AND loser.company IS NOT NULL THEN
      keeper.company := loser.company;
    END IF;
    IF keeper.platform IS NULL AND loser.platform IS NOT NULL THEN
      keeper.platform := loser.platform;
    END IF;
    IF keeper.notes IS NULL AND loser.notes IS NOT NULL THEN
      keeper.notes := loser.notes;
    END IF;
    IF keeper.project_id IS NULL AND loser.project_id IS NOT NULL THEN
      keeper.project_id := loser.project_id;
    END IF;
    keeper.articles_count := COALESCE(keeper.articles_count, 0) + COALESCE(loser.articles_count, 0);
    keeper.videos_count := COALESCE(keeper.videos_count, 0) + COALESCE(loser.videos_count, 0);
  END LOOP;

  UPDATE public.webandsystem_list SET
    domain_url = COALESCE(canonical, domain_url),
    ga4_property_id = keeper.ga4_property_id,
    gsc_site_url = keeper.gsc_site_url,
    google_ads_customer_id = keeper.google_ads_customer_id,
    brand_list_id = keeper.brand_list_id,
    company_list_id = keeper.company_list_id,
    brand = keeper.brand,
    company = keeper.company,
    platform = keeper.platform,
    notes = keeper.notes,
    project_id = keeper.project_id,
    articles_count = keeper.articles_count,
    videos_count = keeper.videos_count,
    updated_at = now()
  WHERE id = p_keeper_id;

  INSERT INTO public.webandsystem_merge_log (
    keeper_id, loser_ids, canonical_domain, coalesced_fields, discarded_fields
  ) VALUES (
    p_keeper_id, p_loser_ids, canonical, coalesced, discarded
  );

  IF to_regclass('public.gsc_sites') IS NOT NULL THEN
    UPDATE public.gsc_sites
    SET website_profile_id = p_keeper_id
    WHERE website_profile_id = ANY (p_loser_ids);
  END IF;

  IF to_regclass('public.seo_keywords') IS NOT NULL THEN
    UPDATE public.seo_keywords k
    SET website_profile_id = p_keeper_id
    WHERE k.website_profile_id = ANY (p_loser_ids)
      AND NOT EXISTS (
        SELECT 1
        FROM public.seo_keywords k2
        WHERE k2.website_profile_id = p_keeper_id
          AND k2.normalized_keyword = k.normalized_keyword
      );
    DELETE FROM public.seo_keywords
    WHERE website_profile_id = ANY (p_loser_ids);
  END IF;

  IF to_regclass('public.google_ads_campaign_websites') IS NOT NULL THEN
    UPDATE public.google_ads_campaign_websites g
    SET website_profile_id = p_keeper_id
    WHERE g.website_profile_id = ANY (p_loser_ids)
      AND NOT EXISTS (
        SELECT 1
        FROM public.google_ads_campaign_websites g2
        WHERE g2.customer_id = g.customer_id
          AND g2.campaign_id = g.campaign_id
          AND g2.website_profile_id = p_keeper_id
      );
    DELETE FROM public.google_ads_campaign_websites
    WHERE website_profile_id = ANY (p_loser_ids);
  END IF;

  IF to_regclass('public.ads_discovered_domains') IS NOT NULL THEN
    UPDATE public.ads_discovered_domains
    SET website_profile_id = p_keeper_id
    WHERE website_profile_id = ANY (p_loser_ids);
  END IF;

  IF to_regclass('public.ga4_properties') IS NOT NULL THEN
    UPDATE public.ga4_properties
    SET website_profile_id = p_keeper_id
    WHERE website_profile_id = ANY (p_loser_ids);
  END IF;

  IF to_regclass('public.website_video_links') IS NOT NULL THEN
    UPDATE public.website_video_links v
    SET website_profile_id = p_keeper_id
    WHERE v.website_profile_id = ANY (p_loser_ids)
      AND NOT EXISTS (
        SELECT 1
        FROM public.website_video_links v2
        WHERE v2.website_profile_id = p_keeper_id
          AND v2.video_output_id = v.video_output_id
      );
    DELETE FROM public.website_video_links
    WHERE website_profile_id = ANY (p_loser_ids);
  END IF;

  IF to_regclass('public.quotation_client_project') IS NOT NULL THEN
    UPDATE public.quotation_client_project
    SET webandsystem_list_id = p_keeper_id
    WHERE webandsystem_list_id = ANY (p_loser_ids);
  END IF;

  IF to_regclass('public.social_posts') IS NOT NULL THEN
    UPDATE public.social_posts
    SET website_profile_id = p_keeper_id
    WHERE website_profile_id = ANY (p_loser_ids);
  END IF;

  IF to_regclass('public.backlink_purchases') IS NOT NULL THEN
    UPDATE public.backlink_purchases
    SET website_profile_id = p_keeper_id
    WHERE website_profile_id = ANY (p_loser_ids);
  END IF;

  IF to_regclass('public.google_business_registrations') IS NOT NULL THEN
    UPDATE public.google_business_registrations
    SET website_profile_id = p_keeper_id
    WHERE website_profile_id = ANY (p_loser_ids);
  END IF;

  IF to_regclass('public.seo_upgrades') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE public.seo_upgrades
      SET website_profile_id = $1
      WHERE website_profile_id = ANY ($2)
    $q$ USING p_keeper_id, p_loser_ids;
  END IF;

  SELECT p.id
  INTO keeper_project_id
  FROM public.projects p
  WHERE p.related_type = 'webandsystem'
    AND p.related_id = p_keeper_id;

  IF keeper_project_id IS NULL THEN
    PERFORM public.upsert_project_row(
      'webandsystem',
      p_keeper_id,
      COALESCE(NULLIF(btrim(keeper.website_name), ''), p_keeper_id),
      COALESCE(keeper.status, ''),
      (COALESCE(keeper.status, '') IS DISTINCT FROM 'archived'),
      keeper.company_list_id,
      keeper.brand_list_id,
      NULL,
      jsonb_build_object(
        'profile_type', keeper.profile_type,
        'project_category', keeper.project_category,
        'domain_url', COALESCE(canonical, keeper.domain_url),
        'level', keeper.level
      )
    );
    SELECT p.id
    INTO keeper_project_id
    FROM public.projects p
    WHERE p.related_type = 'webandsystem'
      AND p.related_id = p_keeper_id;
  END IF;

  SELECT coalesce(array_agg(p.id), ARRAY[]::uuid[])
  INTO loser_project_ids
  FROM public.projects p
  WHERE p.related_type = 'webandsystem'
    AND p.related_id = ANY (p_loser_ids);

  IF keeper_project_id IS NOT NULL THEN
    UPDATE public.day_report_entries
    SET related_id = keeper_project_id::text
    WHERE related_id = ANY (p_loser_ids);

    IF cardinality(loser_project_ids) > 0 THEN
      UPDATE public.day_report_entries
      SET related_id = keeper_project_id::text
      WHERE related_id IN (SELECT unnest(loser_project_ids)::text);

      IF to_regclass('public.expenses') IS NOT NULL THEN
        UPDATE public.expenses
        SET related_id = keeper_project_id
        WHERE related_type = 'project'
          AND related_id = ANY (loser_project_ids);
      END IF;

      IF to_regclass('public.recurring_expenses') IS NOT NULL THEN
        UPDATE public.recurring_expenses
        SET related_id = keeper_project_id
        WHERE related_type = 'project'
          AND related_id = ANY (loser_project_ids);
      END IF;

      IF to_regclass('public.quotation_bv') IS NOT NULL THEN
        UPDATE public.quotation_bv b
        SET project_id = keeper_project_id
        WHERE b.project_id = ANY (loser_project_ids)
          AND NOT EXISTS (
            SELECT 1
            FROM public.quotation_bv b2
            WHERE b2.project_id = keeper_project_id
              AND b2.staff_id = b.staff_id
          );
        DELETE FROM public.quotation_bv
        WHERE project_id = ANY (loser_project_ids);
      END IF;
    END IF;
  END IF;

  DELETE FROM public.webandsystem_list
  WHERE id = ANY (p_loser_ids);

  IF keeper_project_id IS NOT NULL THEN
    UPDATE public.webandsystem_list ws
    SET total_hours = (
      SELECT COALESCE(SUM(e.hours), 0)
      FROM public.day_report_entries e
      JOIN public.projects p ON p.id::text = e.related_id
      WHERE p.related_type = 'webandsystem'
        AND p.related_id = ws.id
    )
    WHERE ws.id = p_keeper_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_webandsystem_profile(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_webandsystem_profile(text, text[]) TO service_role;

-- Auto-merge format-only clones; skip groups with conflicting 1:1 fields.
DO $$
DECLARE
  rec record;
  keeper_id text;
  loser_ids text[];
  has_conflict boolean;
  conflict_details jsonb;
BEGIN
  FOR rec IN
    SELECT
      public.canonical_domain_url(domain_url) AS canonical_domain,
      array_agg(id ORDER BY created_at NULLS LAST, id) AS ids
    FROM public.webandsystem_list
    WHERE public.canonical_domain_url(domain_url) IS NOT NULL
    GROUP BY 1
    HAVING count(*) > 1
  LOOP
    SELECT
      count(DISTINCT ga4_property_id) FILTER (WHERE ga4_property_id IS NOT NULL) > 1
      OR count(DISTINCT gsc_site_url) FILTER (WHERE gsc_site_url IS NOT NULL) > 1
      OR count(DISTINCT google_ads_customer_id) FILTER (WHERE google_ads_customer_id IS NOT NULL) > 1
      OR count(DISTINCT brand_list_id) FILTER (WHERE brand_list_id IS NOT NULL) > 1
      OR count(DISTINCT company_list_id) FILTER (WHERE company_list_id IS NOT NULL) > 1
      OR count(DISTINCT profile_type) FILTER (WHERE profile_type IS NOT NULL) > 1
      OR count(DISTINCT NULLIF(btrim(brand), '')) FILTER (WHERE NULLIF(btrim(brand), '') IS NOT NULL) > 1
      OR count(DISTINCT NULLIF(btrim(company), '')) FILTER (WHERE NULLIF(btrim(company), '') IS NOT NULL) > 1,
      jsonb_build_object(
        'ga4_property_id', coalesce(jsonb_agg(DISTINCT ga4_property_id) FILTER (WHERE ga4_property_id IS NOT NULL), '[]'::jsonb),
        'gsc_site_url', coalesce(jsonb_agg(DISTINCT gsc_site_url) FILTER (WHERE gsc_site_url IS NOT NULL), '[]'::jsonb),
        'google_ads_customer_id', coalesce(jsonb_agg(DISTINCT google_ads_customer_id) FILTER (WHERE google_ads_customer_id IS NOT NULL), '[]'::jsonb),
        'brand_list_id', coalesce(jsonb_agg(DISTINCT brand_list_id) FILTER (WHERE brand_list_id IS NOT NULL), '[]'::jsonb),
        'company_list_id', coalesce(jsonb_agg(DISTINCT company_list_id) FILTER (WHERE company_list_id IS NOT NULL), '[]'::jsonb),
        'profile_type', coalesce(jsonb_agg(DISTINCT profile_type) FILTER (WHERE profile_type IS NOT NULL), '[]'::jsonb),
        'brand', coalesce(jsonb_agg(DISTINCT NULLIF(btrim(brand), '')) FILTER (WHERE NULLIF(btrim(brand), '') IS NOT NULL), '[]'::jsonb),
        'company', coalesce(jsonb_agg(DISTINCT NULLIF(btrim(company), '')) FILTER (WHERE NULLIF(btrim(company), '') IS NOT NULL), '[]'::jsonb)
      )
    INTO has_conflict, conflict_details
    FROM public.webandsystem_list
    WHERE id = ANY (rec.ids);

    IF has_conflict THEN
      INSERT INTO public.webandsystem_duplicate_conflicts (
        canonical_domain, profile_ids, reason, details
      ) VALUES (
        rec.canonical_domain,
        rec.ids,
        'conflicting 1:1 fields',
        conflict_details
      )
      ON CONFLICT (canonical_domain) DO UPDATE SET
        profile_ids = EXCLUDED.profile_ids,
        reason = EXCLUDED.reason,
        details = EXCLUDED.details;
      CONTINUE;
    END IF;

    SELECT id
    INTO keeper_id
    FROM public.webandsystem_list
    WHERE id = ANY (rec.ids)
    ORDER BY
      (lower(COALESCE(status, '')) = 'live') DESC,
      (ga4_property_id IS NOT NULL)::int
        + (gsc_site_url IS NOT NULL)::int
        + (google_ads_customer_id IS NOT NULL)::int DESC,
      created_at ASC NULLS LAST,
      id ASC
    LIMIT 1;

    loser_ids := array_remove(rec.ids, keeper_id);
    IF cardinality(loser_ids) = 0 THEN
      CONTINUE;
    END IF;

    PERFORM public.merge_webandsystem_profile(keeper_id, loser_ids);
  END LOOP;
END $$;

UPDATE public.webandsystem_list
SET domain_url = public.canonical_domain_url(domain_url)
WHERE domain_url IS DISTINCT FROM public.canonical_domain_url(domain_url);

CREATE OR REPLACE FUNCTION public.trg_canonicalize_webandsystem_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.domain_url IS NOT NULL THEN
    NEW.domain_url := public.canonical_domain_url(NEW.domain_url);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonicalize_webandsystem_domain ON public.webandsystem_list;
CREATE TRIGGER trg_canonicalize_webandsystem_domain
BEFORE INSERT OR UPDATE OF domain_url ON public.webandsystem_list
FOR EACH ROW
EXECUTE FUNCTION public.trg_canonicalize_webandsystem_domain();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT public.canonical_domain_url(domain_url) AS canonical_domain
      FROM public.webandsystem_list
      WHERE public.canonical_domain_url(domain_url) IS NOT NULL
      GROUP BY 1
      HAVING count(*) > 1
    ) d
  ) THEN
    RAISE NOTICE 'Skipping unique index: remaining duplicate canonical domains. See webandsystem_duplicate_conflicts.';
  ELSE
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS webandsystem_list_domain_url_uidx
        ON public.webandsystem_list (domain_url)
        WHERE domain_url IS NOT NULL AND domain_url <> ''
    $idx$;
  END IF;
END $$;
