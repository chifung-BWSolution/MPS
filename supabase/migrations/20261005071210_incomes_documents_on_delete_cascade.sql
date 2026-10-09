-- Invoices and receipts belong to one income installment.
-- Deleting that income must remove the documents instead of failing on RESTRICT.

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_income_id_fkey;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_income_id_fkey
  FOREIGN KEY (income_id)
  REFERENCES public.incomes(id)
  ON DELETE CASCADE;

ALTER TABLE public.receipts
  DROP CONSTRAINT IF EXISTS receipts_income_id_fkey;

ALTER TABLE public.receipts
  ADD CONSTRAINT receipts_income_id_fkey
  FOREIGN KEY (income_id)
  REFERENCES public.incomes(id)
  ON DELETE CASCADE;
