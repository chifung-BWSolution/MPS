-- Bid strategy and eligible keyword count for the ads campaign tables.
-- Keyword count is a Google Ads concept (system_serving_status = ELIGIBLE).
-- Meta campaigns store bid strategy only; eligible keywords stay null.

ALTER TABLE public.google_ads_campaigns
  ADD COLUMN IF NOT EXISTS bidding_strategy_type text,
  ADD COLUMN IF NOT EXISTS eligible_keyword_count integer;

ALTER TABLE public.facebook_ads_campaigns
  ADD COLUMN IF NOT EXISTS bidding_strategy_type text,
  ADD COLUMN IF NOT EXISTS eligible_keyword_count integer;
