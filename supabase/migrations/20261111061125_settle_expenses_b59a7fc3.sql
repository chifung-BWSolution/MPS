-- Settle every expense on project b59a7fc3-f4d9-4df5-99fc-e6c6c0b7a011.
-- outstanding is generated as GREATEST(billed_amount - payment_amount - bad_debt, 0),
-- so it becomes 0 when payment_amount equals billed_amount and bad_debt is 0.

UPDATE public.expenses
SET
  payment_amount = billed_amount,
  payment_date = due_date,
  payment_method = 'Transfer',
  payment_status = 'Paid',
  updated_at = now()
WHERE related_id = 'b59a7fc3-f4d9-4df5-99fc-e6c6c0b7a011';
