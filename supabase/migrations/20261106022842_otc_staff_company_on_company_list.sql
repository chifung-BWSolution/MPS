-- OTC2 staff_sync.company values that are not company_list.company_code.
-- Staff sync matches company_code, then this helper.
-- Blank OTC company and BWE stay unmapped on purpose.

ALTER TABLE public.company_list
  ADD COLUMN IF NOT EXISTS otc_staff_company text;

COMMENT ON COLUMN public.company_list.otc_staff_company IS
  'OTC2 staff_sync.company label when it differs from company_code. Staff sync maps this to company_list.uuid. Blank OTC company and BWE are not stored here.';

CREATE UNIQUE INDEX IF NOT EXISTS company_list_otc_staff_company_uidx
  ON public.company_list (lower(btrim(otc_staff_company)))
  WHERE otc_staff_company IS NOT NULL AND btrim(otc_staff_company) <> '';

UPDATE public.company_list
SET otc_staff_company = '志豐設計(深圳)'
WHERE company_code = 'BW-CFB'
  AND otc_staff_company IS DISTINCT FROM '志豐設計(深圳)';

UPDATE public.company_list
SET otc_staff_company = 'Wine'
WHERE company_code = 'WP'
  AND otc_staff_company IS DISTINCT FROM 'Wine';
