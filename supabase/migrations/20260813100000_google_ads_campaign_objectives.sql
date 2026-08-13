-- Store Google Ads campaign conversion / optimization objectives
-- (biddable campaign_conversion_goal categories, plus app / local optimization goals).

ALTER TABLE public.google_ads_campaigns
  ADD COLUMN IF NOT EXISTS objectives text[] NOT NULL DEFAULT '{}';
