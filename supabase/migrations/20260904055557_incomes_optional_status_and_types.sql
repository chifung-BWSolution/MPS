-- Payment status is optional (default null).
-- Income type is one of: 主要收入 / 後加項目 / 代付項目.

ALTER TABLE public.incomes
  ALTER COLUMN payment_status DROP NOT NULL,
  ALTER COLUMN payment_status DROP DEFAULT;

ALTER TABLE public.incomes
  DROP CONSTRAINT IF EXISTS incomes_payment_status_check;

ALTER TABLE public.incomes
  ADD CONSTRAINT incomes_payment_status_check
  CHECK (payment_status IS NULL OR payment_status IN ('Pending Check', 'Received', 'Not Received'));

UPDATE public.incomes
SET type = '主要收入'
WHERE type IS NULL
   OR btrim(type) = ''
   OR type NOT IN ('主要收入', '後加項目', '代付項目');

ALTER TABLE public.incomes
  DROP CONSTRAINT IF EXISTS incomes_type_check;

ALTER TABLE public.incomes
  ADD CONSTRAINT incomes_type_check
  CHECK (type IN ('主要收入', '後加項目', '代付項目'));

COMMENT ON COLUMN public.incomes.payment_status IS
  'Optional. Pending Check / Received / Not Received.';

COMMENT ON COLUMN public.incomes.type IS
  '主要收入 / 後加項目 / 代付項目.';
