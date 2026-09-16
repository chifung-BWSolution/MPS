-- Contract period on Pitching + Project rows (quotation_client_project).
ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date;

COMMENT ON COLUMN public.quotation_client_project.contract_start_date IS
  'Contract start date (合約開始日期). Optional; entered on Pitching / Project dialog or when uploading a signed quotation/contract.';

COMMENT ON COLUMN public.quotation_client_project.contract_end_date IS
  'Contract end date (合約結束日期). Optional; entered on Pitching / Project dialog or when uploading a signed quotation/contract.';
