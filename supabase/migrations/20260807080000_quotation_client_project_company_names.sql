-- Company name fields on Pitching / Project records (at least one required in app validation)

ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS company_name_en text,
  ADD COLUMN IF NOT EXISTS company_name_zh text;

COMMENT ON COLUMN public.quotation_client_project.company_name_en IS
  'Company name in English; at least one of en/zh required for manual Pitching entries';
COMMENT ON COLUMN public.quotation_client_project.company_name_zh IS
  'Company name in Chinese; at least one of en/zh required for manual Pitching entries';
