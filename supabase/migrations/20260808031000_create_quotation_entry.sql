-- Quotation entries saved from 新建報價單 wizard (Step 3 content + Cost Structure)

CREATE TABLE IF NOT EXISTS public.quotation_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_code text NOT NULL UNIQUE,
  client_name text NOT NULL,
  pitching_record_id uuid REFERENCES public.quotation_client_project(id) ON DELETE SET NULL,
  quotation_type_id text,
  quotation_mode text NOT NULL DEFAULT 'single' CHECK (quotation_mode IN ('single', 'comprehensive')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_approval', 'approved', 'rejected', 'sent', 'won', 'lost'
  )),
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  cost_total numeric(14, 2) NOT NULL DEFAULT 0,
  gross_profit numeric(14, 2) NOT NULL DEFAULT 0,
  gross_margin numeric(6, 2) NOT NULL DEFAULT 0,
  wizard_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  integrated_summary text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotation_entry_created_at_idx
  ON public.quotation_entry (created_at DESC);

CREATE INDEX IF NOT EXISTS quotation_entry_status_idx
  ON public.quotation_entry (status);

CREATE INDEX IF NOT EXISTS quotation_entry_quote_code_idx
  ON public.quotation_entry (quote_code);

COMMENT ON TABLE public.quotation_entry IS
  'Saved quotation wizard records (client requirements + cost structure)';

ALTER TABLE public.quotation_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated on quotation_entry"
  ON public.quotation_entry FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated on quotation_entry"
  ON public.quotation_entry FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated on quotation_entry"
  ON public.quotation_entry FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated on quotation_entry"
  ON public.quotation_entry FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select on quotation_entry"
  ON public.quotation_entry FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on quotation_entry"
  ON public.quotation_entry FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on quotation_entry"
  ON public.quotation_entry FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on quotation_entry"
  ON public.quotation_entry FOR DELETE TO anon USING (true);
