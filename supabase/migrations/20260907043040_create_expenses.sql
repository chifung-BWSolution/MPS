-- Actual expense / payment rows linked to public.projects.
-- related_type is 'project' for now; expand the check later to attach expenses
-- to other masters without changing related_id storage.

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  related_type text NOT NULL DEFAULT 'project'
    CHECK (related_type IN ('project')),
  related_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE RESTRICT,
  supplier_types_id uuid NOT NULL
    REFERENCES public.supplier_types(id) ON DELETE RESTRICT,
  supplier_id text NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  installment_number integer
    CHECK (installment_number IS NULL OR installment_number >= 1),
  billed_amount numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (billed_amount >= 0),
  due_date date,
  payment_amount numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (payment_amount >= 0),
  payment_date date,
  payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('Transfer', 'Cash', 'Cheque')),
  payment_status text
    CHECK (payment_status IS NULL OR payment_status IN ('Pending Check', 'Paid', 'Not Paid')),
  bad_debt numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (bad_debt >= 0),
  outstanding numeric(14, 2) GENERATED ALWAYS AS (
    GREATEST(billed_amount - payment_amount - bad_debt, 0)
  ) STORED,
  remarks text,
  payment_record_file_name text,
  payment_record_file_url text,
  payment_record_storage_path text,
  payment_record_file_size bigint,
  payment_record_mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_related_idx
  ON public.expenses (related_type, related_id, installment_number NULLS LAST, created_at);

CREATE INDEX IF NOT EXISTS expenses_due_date_idx
  ON public.expenses (due_date);

CREATE INDEX IF NOT EXISTS expenses_payment_status_idx
  ON public.expenses (payment_status);

CREATE INDEX IF NOT EXISTS expenses_payment_date_idx
  ON public.expenses (payment_date);

CREATE INDEX IF NOT EXISTS expenses_supplier_id_idx
  ON public.expenses (supplier_id);

CREATE INDEX IF NOT EXISTS expenses_supplier_types_id_idx
  ON public.expenses (supplier_types_id);

COMMENT ON TABLE public.expenses IS
  'Actual billed / paid expense lines. related_type+related_id currently target public.projects.';

COMMENT ON COLUMN public.expenses.related_type IS
  'Relation kind. Currently only project; expand later for other masters.';

COMMENT ON COLUMN public.expenses.related_id IS
  'When related_type = project, this is public.projects.id.';

COMMENT ON COLUMN public.expenses.supplier_types_id IS
  'Expense type (supplier_types). Must match the selected supplier.';

COMMENT ON COLUMN public.expenses.supplier_id IS
  'Related supplier row.';

COMMENT ON COLUMN public.expenses.payment_amount IS
  'Amount actually paid.';

COMMENT ON COLUMN public.expenses.payment_status IS
  'Optional. Pending Check / Paid / Not Paid.';

COMMENT ON COLUMN public.expenses.outstanding IS
  'GREATEST(billed_amount - payment_amount - bad_debt, 0).';

CREATE OR REPLACE FUNCTION public.trg_expenses_supplier_type_match()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type uuid;
BEGIN
  SELECT supplier_types_id INTO v_type
  FROM public.suppliers
  WHERE id = NEW.supplier_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'expenses.supplier_id must reference an existing supplier';
  END IF;

  IF v_type IS DISTINCT FROM NEW.supplier_types_id THEN
    RAISE EXCEPTION 'expenses.supplier_types_id must match suppliers.supplier_types_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_supplier_type_match ON public.expenses;
CREATE TRIGGER trg_expenses_supplier_type_match
BEFORE INSERT OR UPDATE OF supplier_id, supplier_types_id ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.trg_expenses_supplier_type_match();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on expenses" ON public.expenses;
CREATE POLICY "Allow select on expenses"
  ON public.expenses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on expenses" ON public.expenses;
CREATE POLICY "Allow insert on expenses"
  ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on expenses" ON public.expenses;
CREATE POLICY "Allow update on expenses"
  ON public.expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on expenses" ON public.expenses;
CREATE POLICY "Allow delete on expenses"
  ON public.expenses FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('expense-payment-records', 'expense-payment-records', true, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Allow select on expense-payment-records" ON storage.objects;
CREATE POLICY "Allow select on expense-payment-records"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-payment-records');

DROP POLICY IF EXISTS "Allow insert on expense-payment-records" ON storage.objects;
CREATE POLICY "Allow insert on expense-payment-records"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-payment-records');

DROP POLICY IF EXISTS "Allow update on expense-payment-records" ON storage.objects;
CREATE POLICY "Allow update on expense-payment-records"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-payment-records')
  WITH CHECK (bucket_id = 'expense-payment-records');

DROP POLICY IF EXISTS "Allow delete on expense-payment-records" ON storage.objects;
CREATE POLICY "Allow delete on expense-payment-records"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-payment-records');
