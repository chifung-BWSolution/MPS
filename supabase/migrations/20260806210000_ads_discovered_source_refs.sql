-- Store Ads account/campaign provenance on discovered domains
ALTER TABLE public.ads_discovered_domains
  ADD COLUMN IF NOT EXISTS source_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ads_discovered_domains.source_refs IS
  'Array of {platform, accountId, accountName, campaignId?, campaignName?} from Google/Facebook Ads discovery';
