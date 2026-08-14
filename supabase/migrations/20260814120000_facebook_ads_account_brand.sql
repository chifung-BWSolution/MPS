-- Facebook ad accounts inherit a default brand; campaigns without a manual
-- brand_list_id copy it so 廣告成本趨勢 and /#marketing/facebook-ads agree.

ALTER TABLE public.facebook_ads_accounts
  ADD COLUMN IF NOT EXISTS brand_list_id uuid REFERENCES public.brand_list(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS facebook_ads_accounts_brand_list_idx
  ON public.facebook_ads_accounts (brand_list_id);

UPDATE public.facebook_ads_accounts a
SET brand_list_id = b.id
FROM public.brand_list b
WHERE a.brand_list_id IS NULL
  AND b.brand_code = 'BSC'
  AND (
    a.business_key = 'attitude-beauty'
    OR a.account_name ILIKE '%attitude%'
    OR a.business_name ILIKE '%attitude%'
  );

UPDATE public.facebook_ads_accounts a
SET brand_list_id = b.id
FROM public.brand_list b
WHERE a.brand_list_id IS NULL
  AND b.brand_code = 'Wine'
  AND (
    a.business_key = 'winepassions'
    OR a.account_name ILIKE '%wine passion%'
    OR a.account_name ILIKE '%winepassion%'
    OR a.business_name ILIKE '%winepassion%'
  );

UPDATE public.facebook_ads_accounts a
SET brand_list_id = b.id
FROM public.brand_list b
WHERE a.brand_list_id IS NULL
  AND b.brand_code = 'FCC'
  AND (
    a.business_key = 'food-channels-catering'
    OR a.account_name ILIKE '%food channel%'
    OR a.account_name ILIKE '%lunchbox%'
    OR a.business_name ILIKE '%food channel%'
  );

UPDATE public.facebook_ads_accounts a
SET brand_list_id = b.id
FROM public.brand_list b
WHERE a.brand_list_id IS NULL
  AND b.brand_code = 'BWA'
  AND (
    a.business_key = 'branding-works'
    OR a.account_name ILIKE '%branding works%'
    OR a.account_name ILIKE '%bw office%'
    OR a.account_name ILIKE '%eb space%'
    OR a.business_name ILIKE '%branding works%'
  );

UPDATE public.facebook_ads_campaigns c
SET
  brand_list_id = a.brand_list_id,
  updated_at = now()
FROM public.facebook_ads_accounts a
WHERE c.ad_account_id = a.ad_account_id
  AND c.brand_list_id IS NULL
  AND a.brand_list_id IS NOT NULL;
