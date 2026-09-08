-- Allow Credit Card payments and store the selected company card.

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_payment_method_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('Transfer', 'Cash', 'Cheque', 'Credit Card'));

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS credit_card_id uuid;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_credit_card_id_fkey;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_credit_card_id_fkey
  FOREIGN KEY (credit_card_id) REFERENCES public.credit_cards(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS expenses_credit_card_id_idx
  ON public.expenses (credit_card_id);

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_credit_card_required_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_credit_card_required_check
  CHECK (
    (payment_method = 'Credit Card' AND credit_card_id IS NOT NULL)
    OR (payment_method IS DISTINCT FROM 'Credit Card' AND credit_card_id IS NULL)
  );

COMMENT ON COLUMN public.expenses.credit_card_id IS
  'Required when payment_method = Credit Card. References public.credit_cards.';
