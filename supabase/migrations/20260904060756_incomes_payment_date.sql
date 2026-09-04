-- Date the payment was actually received.

ALTER TABLE public.incomes
  ADD COLUMN IF NOT EXISTS payment_date date;

COMMENT ON COLUMN public.incomes.payment_date IS
  'Date the payment was received. Required in the UI when payment_amount is entered.';

CREATE INDEX IF NOT EXISTS incomes_payment_date_idx
  ON public.incomes (payment_date);
