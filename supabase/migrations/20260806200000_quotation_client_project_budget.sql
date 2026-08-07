-- Estimated income / expense fields for Pitching detail budget tab

ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS estimated_income numeric(14, 2),
  ADD COLUMN IF NOT EXISTS estimated_income_currency text NOT NULL DEFAULT 'HKD',
  ADD COLUMN IF NOT EXISTS estimated_expenses jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.quotation_client_project.estimated_income IS
  'Expected project income entered on Pitching budget tab';
COMMENT ON COLUMN public.quotation_client_project.estimated_expenses IS
  'Array of { id, name, amount, currency, notes? } expense line items';
