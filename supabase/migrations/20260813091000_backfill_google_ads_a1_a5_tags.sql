-- Backfill Google Ads campaign tags A1–A5 from account descriptive_name.
-- Only assign when the name starts with A1/A2/A3/A4/A5 as a whole token
-- (e.g. "A1 BW hkofficedesign.com"). Skip accounts with no such prefix.

INSERT INTO public.ads_campaign_tags (tag_id, platform, campaign_row_id)
SELECT
  t.id,
  'google',
  c.id
FROM public.google_ads_accounts a
JOIN public.google_ads_campaigns c
  ON c.customer_id = a.customer_id
JOIN public.ads_tags t
  ON lower(t.name) = lower(substring(trim(a.descriptive_name) FROM '^A[1-5]'))
WHERE a.descriptive_name ~* '^A[1-5](\s|$)'
ON CONFLICT (tag_id, platform, campaign_row_id) DO NOTHING;
