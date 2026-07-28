-- Add EmailMeForm fields missing as dedicated columns:
--   影片Blog內容推廣 → video_blog_promo
--   有興趣成為Facebook Live 主播 → facebook_live_interest

ALTER TABLE public.kol_profile
  ADD COLUMN IF NOT EXISTS video_blog_promo text,
  ADD COLUMN IF NOT EXISTS facebook_live_interest text;

ALTER TABLE public.kol_apply
  ADD COLUMN IF NOT EXISTS video_blog_promo text,
  ADD COLUMN IF NOT EXISTS facebook_live_interest text;

-- Backfill from raw_payload when present (seed / import path)
UPDATE public.kol_profile
SET
  video_blog_promo = COALESCE(video_blog_promo, NULLIF(raw_payload->>'videoBlogPromo', '')),
  facebook_live_interest = COALESCE(facebook_live_interest, NULLIF(raw_payload->>'facebookLiveInterest', ''))
WHERE
  (video_blog_promo IS NULL AND raw_payload ? 'videoBlogPromo')
  OR (facebook_live_interest IS NULL AND raw_payload ? 'facebookLiveInterest');

UPDATE public.kol_apply
SET
  video_blog_promo = COALESCE(video_blog_promo, NULLIF(raw_payload->>'videoBlogPromo', '')),
  facebook_live_interest = COALESCE(facebook_live_interest, NULLIF(raw_payload->>'facebookLiveInterest', ''))
WHERE
  (video_blog_promo IS NULL AND raw_payload ? 'videoBlogPromo')
  OR (facebook_live_interest IS NULL AND raw_payload ? 'facebookLiveInterest');
