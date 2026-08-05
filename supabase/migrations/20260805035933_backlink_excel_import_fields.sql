-- Backlink purchases: Google Ads account linkage + Excel import metadata
ALTER TABLE public.backlink_purchases
  ADD COLUMN IF NOT EXISTS google_ads_customer_id text,
  ADD COLUMN IF NOT EXISTS source_domain text,
  ADD COLUMN IF NOT EXISTS excel_sheet text,
  ADD COLUMN IF NOT EXISTS google_ads_account_name text;

CREATE INDEX IF NOT EXISTS backlink_purchases_gads_customer_idx
  ON public.backlink_purchases (google_ads_customer_id);

CREATE INDEX IF NOT EXISTS backlink_purchases_source_domain_idx
  ON public.backlink_purchases (source_domain);

-- Default supplier for Excel imports without explicit vendor URL
INSERT INTO public.web_page_suppliers (id, name, platform, url, cost, currency, rating)
VALUES (
  'wps_excel_import',
  'Excel 匯入（未指定供應商）',
  'import',
  '',
  0,
  'HKD',
  3
)
ON CONFLICT (id) DO NOTHING;
