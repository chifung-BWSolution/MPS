-- Signed / handover dates on Pitching + Project rows (quotation_client_project).
ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS signed_date date,
  ADD COLUMN IF NOT EXISTS handover_date date;

COMMENT ON COLUMN public.quotation_client_project.signed_date IS
  'Contract signed date (簽約日期). Optional; entered on Pitching / Project dialog.';

COMMENT ON COLUMN public.quotation_client_project.handover_date IS
  'Project handover / delivery date (交付日期). Optional; entered on Pitching / Project dialog.';
