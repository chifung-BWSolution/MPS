-- Invoice / receipt documents attached to one incomes row (1:1).
-- Branding comes from company_list (logo / chop / bank notes).

ALTER TABLE public.company_list
  ADD COLUMN IF NOT EXISTS chop_url text,
  ADD COLUMN IF NOT EXISTS bank_notes text;

COMMENT ON COLUMN public.company_list.chop_url IS
  'Company chop / stamp image URL used on invoice and receipt PDFs.';

COMMENT ON COLUMN public.company_list.bank_notes IS
  'Payment instructions printed on invoices. Receipts do not print this.';

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_id uuid NOT NULL UNIQUE
    REFERENCES public.incomes(id) ON DELETE RESTRICT,
  invoice_no text,
  invoice_date date,
  due_date date,
  bill_to_name text,
  project_name text,
  main_item_name text,
  main_item_qty numeric(10, 2),
  main_item_price numeric(12, 2),
  main_item_amount numeric(12, 2),
  enable_discount boolean NOT NULL DEFAULT false,
  discount_description text,
  discount_amount numeric(12, 2),
  total_amount numeric(12, 2),
  note text,
  system_label text,
  company_id uuid REFERENCES public.company_list(uuid) ON DELETE SET NULL,
  pdf_branding jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_company_id_idx
  ON public.invoices (company_id);

COMMENT ON TABLE public.invoices IS
  'Formal invoice document for one income installment. Does not update incomes.';

COMMENT ON COLUMN public.invoices.invoice_no IS
  'Document number (e.g. 250900142). Independent of incomes.installment_number.';

COMMENT ON COLUMN public.invoices.company_id IS
  'Branding source. FK to company_list.uuid.';

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL
    REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_name text,
  quantity numeric(10, 2),
  price numeric(12, 2),
  amount numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_id_idx
  ON public.invoice_line_items (invoice_id);

CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_id uuid NOT NULL UNIQUE
    REFERENCES public.incomes(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  receipt_no text,
  receipt_date date,
  payment_date date,
  received_from_name text,
  project_name text,
  amount_received numeric(12, 2),
  payment_method text,
  notes text,
  enable_price_difference boolean NOT NULL DEFAULT false,
  price_difference numeric(12, 2),
  price_difference_description text,
  system_label text,
  company_id uuid REFERENCES public.company_list(uuid) ON DELETE SET NULL,
  pdf_branding jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipts_company_id_idx
  ON public.receipts (company_id);

CREATE INDEX IF NOT EXISTS receipts_invoice_id_idx
  ON public.receipts (invoice_id);

COMMENT ON TABLE public.receipts IS
  'Formal receipt document for one income installment. Does not update incomes.';

COMMENT ON COLUMN public.receipts.receipt_no IS
  'Document number (e.g. REC-250900142). Independent of incomes.installment_number.';

CREATE TABLE IF NOT EXISTS public.receipt_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL
    REFERENCES public.receipts(id) ON DELETE CASCADE,
  item_name text,
  quantity numeric(10, 2),
  price numeric(12, 2),
  amount numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipt_line_items_receipt_id_idx
  ON public.receipt_line_items (receipt_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on invoices" ON public.invoices;
CREATE POLICY "Allow select on invoices"
  ON public.invoices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on invoices" ON public.invoices;
CREATE POLICY "Allow insert on invoices"
  ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on invoices" ON public.invoices;
CREATE POLICY "Allow update on invoices"
  ON public.invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on invoices" ON public.invoices;
CREATE POLICY "Allow delete on invoices"
  ON public.invoices FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow select on invoice_line_items" ON public.invoice_line_items;
CREATE POLICY "Allow select on invoice_line_items"
  ON public.invoice_line_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on invoice_line_items" ON public.invoice_line_items;
CREATE POLICY "Allow insert on invoice_line_items"
  ON public.invoice_line_items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on invoice_line_items" ON public.invoice_line_items;
CREATE POLICY "Allow update on invoice_line_items"
  ON public.invoice_line_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on invoice_line_items" ON public.invoice_line_items;
CREATE POLICY "Allow delete on invoice_line_items"
  ON public.invoice_line_items FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow select on receipts" ON public.receipts;
CREATE POLICY "Allow select on receipts"
  ON public.receipts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on receipts" ON public.receipts;
CREATE POLICY "Allow insert on receipts"
  ON public.receipts FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on receipts" ON public.receipts;
CREATE POLICY "Allow update on receipts"
  ON public.receipts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on receipts" ON public.receipts;
CREATE POLICY "Allow delete on receipts"
  ON public.receipts FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow select on receipt_line_items" ON public.receipt_line_items;
CREATE POLICY "Allow select on receipt_line_items"
  ON public.receipt_line_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on receipt_line_items" ON public.receipt_line_items;
CREATE POLICY "Allow insert on receipt_line_items"
  ON public.receipt_line_items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on receipt_line_items" ON public.receipt_line_items;
CREATE POLICY "Allow update on receipt_line_items"
  ON public.receipt_line_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on receipt_line_items" ON public.receipt_line_items;
CREATE POLICY "Allow delete on receipt_line_items"
  ON public.receipt_line_items FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_line_items TO authenticated;

GRANT ALL ON public.invoices TO service_role;
GRANT ALL ON public.invoice_line_items TO service_role;
GRANT ALL ON public.receipts TO service_role;
GRANT ALL ON public.receipt_line_items TO service_role;
