-- Add display_name to 客戶列表 and backfill from company_name_zh.

ALTER TABLE public.quotation_client_list
  ADD COLUMN IF NOT EXISTS display_name text;

UPDATE public.quotation_client_list
SET display_name = company_name_zh
WHERE display_name IS NULL OR btrim(display_name) = '';

ALTER TABLE public.quotation_client_list
  ALTER COLUMN display_name SET DEFAULT '',
  ALTER COLUMN display_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS quotation_client_list_display_name_idx
  ON public.quotation_client_list (display_name);

COMMENT ON COLUMN public.quotation_client_list.display_name IS
  'Display name for 客戶列表; backfilled from company_name_zh.';
