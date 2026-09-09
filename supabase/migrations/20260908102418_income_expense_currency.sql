-- Original entry currency for income / expense dialogs.
-- billed_amount, payment_amount, and bad_debt stay in HKD.

ALTER TABLE public.incomes
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'HKD';

ALTER TABLE public.incomes
  DROP CONSTRAINT IF EXISTS incomes_currency_check;

ALTER TABLE public.incomes
  ADD CONSTRAINT incomes_currency_check
  CHECK (currency IN ('HKD', 'RMB', 'USD'));

COMMENT ON COLUMN public.incomes.currency IS
  'Original entry currency. Monetary columns are always stored in HKD.';

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'HKD';

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_currency_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_currency_check
  CHECK (currency IN ('HKD', 'RMB', 'USD'));

COMMENT ON COLUMN public.expenses.currency IS
  'Original entry currency. Monetary columns are always stored in HKD.';
