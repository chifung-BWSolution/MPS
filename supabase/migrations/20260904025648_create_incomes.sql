-- Actual income / collection rows for Pitching / Project (quotation_client_project).
-- Distinct from quotation_client_project.estimated_income (forecast on the budget tab).

CREATE TABLE IF NOT EXISTS public.incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_client_project_id text NOT NULL
    REFERENCES public.quotation_client_project(id) ON DELETE RESTRICT,
  type text NOT NULL,
  installment_number integer
    CHECK (installment_number IS NULL OR installment_number >= 1),
  billed_amount numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (billed_amount >= 0),
  due_date date,
  payment_amount numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (payment_amount >= 0),
  payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('Transfer', 'Cash', 'Cheque')),
  payment_status text NOT NULL DEFAULT 'Not Received'
    CHECK (payment_status IN ('Pending Check', 'Received', 'Not Received')),
  bad_debt numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (bad_debt >= 0),
  outstanding numeric(14, 2) GENERATED ALWAYS AS (
    GREATEST(billed_amount - payment_amount - bad_debt, 0)
  ) STORED,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incomes_project_id_idx
  ON public.incomes (quotation_client_project_id, installment_number NULLS LAST, created_at);

CREATE INDEX IF NOT EXISTS incomes_due_date_idx
  ON public.incomes (due_date);

CREATE INDEX IF NOT EXISTS incomes_payment_status_idx
  ON public.incomes (payment_status);

COMMENT ON TABLE public.incomes IS
  'Actual billed / collected income lines for a Pitching / Project row.';

COMMENT ON COLUMN public.incomes.quotation_client_project_id IS
  'Related Pitching / Project row (quotation_client_project.id).';

COMMENT ON COLUMN public.incomes.type IS
  'Income type label (e.g. 訂金 / 分期 / 尾款 / 全額).';

COMMENT ON COLUMN public.incomes.installment_number IS
  'Optional installment sequence (1, 2, 3…).';

COMMENT ON COLUMN public.incomes.billed_amount IS
  'Amount billed / invoiced.';

COMMENT ON COLUMN public.incomes.payment_amount IS
  'Amount actually received.';

COMMENT ON COLUMN public.incomes.payment_method IS
  'Transfer / Cash / Cheque.';

COMMENT ON COLUMN public.incomes.payment_status IS
  'Pending Check / Received / Not Received.';

COMMENT ON COLUMN public.incomes.outstanding IS
  'GREATEST(billed_amount - payment_amount - bad_debt, 0).';

COMMENT ON COLUMN public.incomes.bad_debt IS
  'Amount written off as uncollectible.';

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on incomes" ON public.incomes;
CREATE POLICY "Allow select on incomes"
  ON public.incomes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on incomes" ON public.incomes;
CREATE POLICY "Allow insert on incomes"
  ON public.incomes FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on incomes" ON public.incomes;
CREATE POLICY "Allow update on incomes"
  ON public.incomes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on incomes" ON public.incomes;
CREATE POLICY "Allow delete on incomes"
  ON public.incomes FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incomes TO anon, authenticated;
GRANT ALL ON public.incomes TO service_role;
