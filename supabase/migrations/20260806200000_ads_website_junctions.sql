-- ============================================================
-- Ads ↔ website auto-link junctions + discovered domain staging
-- ============================================================

-- Symmetry with google_ads_customer_id (GSC migration)
ALTER TABLE public.webandsystem_list
  ADD COLUMN IF NOT EXISTS facebook_ads_ad_account_id text;

CREATE INDEX IF NOT EXISTS webandsystem_list_fads_account_idx
  ON public.webandsystem_list (facebook_ads_ad_account_id);

-- Google: campaign ↔ website (many-to-many)
CREATE TABLE IF NOT EXISTS public.google_ads_campaign_websites (
  customer_id         text NOT NULL,
  campaign_id         text NOT NULL,
  website_profile_id  text NOT NULL REFERENCES public.webandsystem_list(id) ON DELETE CASCADE,
  campaign_row_id     text NOT NULL, -- customer_id:campaign_id
  matched_domain      text NOT NULL DEFAULT '',
  sample_final_url    text,
  match_source        text NOT NULL DEFAULT 'final_url', -- final_url | landing_page | name
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, campaign_id, website_profile_id)
);

CREATE INDEX IF NOT EXISTS gads_campaign_websites_website_idx
  ON public.google_ads_campaign_websites (website_profile_id);
CREATE INDEX IF NOT EXISTS gads_campaign_websites_customer_idx
  ON public.google_ads_campaign_websites (customer_id);
CREATE INDEX IF NOT EXISTS gads_campaign_websites_campaign_row_idx
  ON public.google_ads_campaign_websites (campaign_row_id);

ALTER TABLE public.google_ads_campaign_websites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on google_ads_campaign_websites"
  ON public.google_ads_campaign_websites FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on google_ads_campaign_websites"
  ON public.google_ads_campaign_websites FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on google_ads_campaign_websites"
  ON public.google_ads_campaign_websites FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on google_ads_campaign_websites"
  ON public.google_ads_campaign_websites FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_campaign_websites TO anon, authenticated;
GRANT ALL ON public.google_ads_campaign_websites TO service_role;

-- Facebook: account ↔ website (many-to-many)
CREATE TABLE IF NOT EXISTS public.facebook_ads_account_websites (
  ad_account_id       text NOT NULL,
  website_profile_id  text NOT NULL REFERENCES public.webandsystem_list(id) ON DELETE CASCADE,
  matched_domain      text NOT NULL DEFAULT '',
  sample_final_url    text,
  match_source        text NOT NULL DEFAULT 'creative_link', -- creative_link | name
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_account_id, website_profile_id)
);

CREATE INDEX IF NOT EXISTS fads_account_websites_website_idx
  ON public.facebook_ads_account_websites (website_profile_id);
CREATE INDEX IF NOT EXISTS fads_account_websites_account_idx
  ON public.facebook_ads_account_websites (ad_account_id);

ALTER TABLE public.facebook_ads_account_websites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on facebook_ads_account_websites"
  ON public.facebook_ads_account_websites FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on facebook_ads_account_websites"
  ON public.facebook_ads_account_websites FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on facebook_ads_account_websites"
  ON public.facebook_ads_account_websites FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on facebook_ads_account_websites"
  ON public.facebook_ads_account_websites FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_ads_account_websites TO anon, authenticated;
GRANT ALL ON public.facebook_ads_account_websites TO service_role;

-- Staging: every destination host seen from Ads APIs (for create-prompt coverage)
CREATE TABLE IF NOT EXISTS public.ads_discovered_domains (
  normalized_domain   text PRIMARY KEY,
  sample_url          text,
  sources             text[] NOT NULL DEFAULT '{}', -- google | facebook
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  website_profile_id  text REFERENCES public.webandsystem_list(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'unmatched', -- unmatched | linked | dismissed
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ads_discovered_domains_status_idx
  ON public.ads_discovered_domains (status);
CREATE INDEX IF NOT EXISTS ads_discovered_domains_website_idx
  ON public.ads_discovered_domains (website_profile_id);

ALTER TABLE public.ads_discovered_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on ads_discovered_domains"
  ON public.ads_discovered_domains FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on ads_discovered_domains"
  ON public.ads_discovered_domains FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on ads_discovered_domains"
  ON public.ads_discovered_domains FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on ads_discovered_domains"
  ON public.ads_discovered_domains FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_discovered_domains TO anon, authenticated;
GRANT ALL ON public.ads_discovered_domains TO service_role;
