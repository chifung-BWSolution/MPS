-- Remove Ad Groups / Keywords / Search Terms warehouse (live on-demand instead).

DROP FUNCTION IF EXISTS public.google_ads_ad_group_metrics_for_campaign(text, text, date, date);
DROP FUNCTION IF EXISTS public.google_ads_keyword_metrics_for_campaign(text, text, date, date);
DROP FUNCTION IF EXISTS public.google_ads_search_term_metrics_for_campaign(text, text, date, date, integer);

DROP TABLE IF EXISTS public.google_ads_search_term_daily_metrics;
DROP TABLE IF EXISTS public.google_ads_keyword_daily_metrics;
DROP TABLE IF EXISTS public.google_ads_ad_group_daily_metrics;
