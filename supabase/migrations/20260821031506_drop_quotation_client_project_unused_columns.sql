-- Drop denormalized / unused columns from quotation_client_project.
-- Company names live on quotation_client_list and are resolved via client_id.
-- Estimated income is always HKD. Asana custom-field status maps to status only.

ALTER TABLE public.quotation_client_project
  DROP COLUMN IF EXISTS asana_status_label,
  DROP COLUMN IF EXISTS estimated_income_currency,
  DROP COLUMN IF EXISTS company_name_en,
  DROP COLUMN IF EXISTS company_name_zh;
