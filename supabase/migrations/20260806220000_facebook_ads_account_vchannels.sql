-- ============================================================
-- Pivot Facebook Ads linking: websites → vchannel_accounts
-- ============================================================

-- 1) Drop obsolete Facebook ↔ website junction + column
DROP TABLE IF EXISTS public.facebook_ads_account_websites CASCADE;

ALTER TABLE public.webandsystem_list
  DROP COLUMN IF EXISTS facebook_ads_ad_account_id;

-- Clean Facebook discoveries from website unmatched staging
DELETE FROM public.ads_discovered_domains
WHERE sources = ARRAY['facebook']::text[];

UPDATE public.ads_discovered_domains
SET
  sources = array_remove(sources, 'facebook'),
  source_refs = COALESCE((
    SELECT jsonb_agg(ref)
    FROM jsonb_array_elements(COALESCE(source_refs, '[]'::jsonb)) AS ref
    WHERE COALESCE(ref->>'platform', '') <> 'facebook'
  ), '[]'::jsonb),
  updated_at = now()
WHERE 'facebook' = ANY (sources);

-- 2) Explicit Meta ad account id on vchannel login accounts
ALTER TABLE public.vchannel_accounts
  ADD COLUMN IF NOT EXISTS facebook_ads_ad_account_id text;

CREATE UNIQUE INDEX IF NOT EXISTS vchannel_accounts_fads_account_uidx
  ON public.vchannel_accounts (facebook_ads_ad_account_id)
  WHERE facebook_ads_ad_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vchannel_accounts_platform_idx
  ON public.vchannel_accounts (platform);

-- 3) New junction: Facebook Ads account ↔ vchannel account (many-to-many safe)
CREATE TABLE IF NOT EXISTS public.facebook_ads_account_vchannels (
  ad_account_id         text NOT NULL,
  vchannel_account_id   uuid NOT NULL REFERENCES public.vchannel_accounts(id) ON DELETE CASCADE,
  matched_label         text NOT NULL DEFAULT '',
  match_source          text NOT NULL DEFAULT 'name', -- explicit | name | auto_created
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_account_id, vchannel_account_id)
);

CREATE INDEX IF NOT EXISTS fads_account_vchannels_vchannel_idx
  ON public.facebook_ads_account_vchannels (vchannel_account_id);
CREATE INDEX IF NOT EXISTS fads_account_vchannels_account_idx
  ON public.facebook_ads_account_vchannels (ad_account_id);

ALTER TABLE public.facebook_ads_account_vchannels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on facebook_ads_account_vchannels"
  ON public.facebook_ads_account_vchannels FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert on facebook_ads_account_vchannels"
  ON public.facebook_ads_account_vchannels FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update on facebook_ads_account_vchannels"
  ON public.facebook_ads_account_vchannels FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on facebook_ads_account_vchannels"
  ON public.facebook_ads_account_vchannels FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_ads_account_vchannels TO anon, authenticated;
GRANT ALL ON public.facebook_ads_account_vchannels TO service_role;
