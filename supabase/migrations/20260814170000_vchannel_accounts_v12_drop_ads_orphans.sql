-- 香港好設計 login rows belong to V12 (BW Design), not V11 (Office + Furniture).
UPDATE public.vchannel_accounts
SET
  vchannel_codes = ARRAY['V12']::text[],
  updated_at = now()
WHERE account_label = '香港好設計'
  AND vchannel_codes = ARRAY['V11']::text[];

-- Drop leftover Facebook Ads auto-creates that were never linked to a channel.
DELETE FROM public.vchannel_accounts
WHERE cardinality(COALESCE(vchannel_codes, ARRAY[]::text[])) = 0
  AND platform = 'facebook'
  AND notes = 'Auto-created from Facebook Ads sync';
