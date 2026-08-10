-- ============================================================
-- Revert Facebook Ads ↔ vchannel_accounts linking
-- Add manual brand_list FK on facebook_ads_campaigns
-- ============================================================

DROP TABLE IF EXISTS public.facebook_ads_account_vchannels CASCADE;

DROP INDEX IF EXISTS public.vchannel_accounts_fads_account_uidx;

ALTER TABLE public.vchannel_accounts
  DROP COLUMN IF EXISTS facebook_ads_ad_account_id;

-- Manual brand assignment (not overwritten by Ads sync upserts that omit this column)
ALTER TABLE public.facebook_ads_campaigns
  ADD COLUMN IF NOT EXISTS brand_list_id uuid REFERENCES public.brand_list(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS facebook_ads_campaigns_brand_list_idx
  ON public.facebook_ads_campaigns (brand_list_id);
