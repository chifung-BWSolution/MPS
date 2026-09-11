-- Phase 0 audit: duplicate webandsystem_list rows after canonical_domain_url().
-- Run via: supabase db query --linked -f scripts/audit-webandsystem-domain-duplicates.sql

WITH keyed AS (
  SELECT
    w.id,
    w.website_name,
    w.domain_url,
    w.status,
    w.profile_type,
    w.brand,
    w.company,
    w.brand_list_id,
    w.company_list_id,
    w.ga4_property_id,
    w.gsc_site_url,
    w.google_ads_customer_id,
    w.created_at,
    public.canonical_domain_url(w.domain_url) AS canonical_domain
  FROM public.webandsystem_list w
),
dupes AS (
  SELECT canonical_domain
  FROM keyed
  WHERE canonical_domain IS NOT NULL
  GROUP BY canonical_domain
  HAVING count(*) > 1
)
SELECT
  k.canonical_domain,
  k.id,
  k.website_name,
  k.domain_url,
  k.status,
  k.profile_type,
  k.brand,
  k.company,
  k.ga4_property_id,
  k.gsc_site_url,
  k.google_ads_customer_id,
  (
    SELECT count(*) FROM public.seo_keywords s WHERE s.website_profile_id = k.id
  ) AS seo_keywords,
  (
    SELECT count(*) FROM public.google_ads_campaign_websites g WHERE g.website_profile_id = k.id
  ) AS ads_links,
  (
    SELECT count(*) FROM public.ga4_properties p WHERE p.website_profile_id = k.id
  ) AS ga4_properties,
  (
    SELECT count(*) FROM public.gsc_sites s WHERE s.website_profile_id = k.id
  ) AS gsc_sites,
  (
    SELECT count(*) FROM public.quotation_client_project q WHERE q.webandsystem_list_id = k.id
  ) AS pitching_links,
  (
    SELECT count(*) FROM public.social_posts s WHERE s.website_profile_id = k.id
  ) AS social_posts,
  (
    SELECT count(*) FROM public.backlink_purchases b WHERE b.website_profile_id = k.id
  ) AS backlinks,
  (
    SELECT COALESCE(sum(e.hours), 0)
    FROM public.day_report_entries e
    JOIN public.projects p ON p.id::text = e.related_id
    WHERE p.related_type = 'webandsystem'
      AND p.related_id = k.id
  ) AS project_hours
FROM keyed k
JOIN dupes d ON d.canonical_domain = k.canonical_domain
ORDER BY k.canonical_domain, k.created_at, k.id;
