-- Company payment cards for Settings → 信用卡管理.

CREATE TABLE IF NOT EXISTS public.credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_list_id uuid NOT NULL
    REFERENCES public.company_list(uuid) ON DELETE RESTRICT,
  last_four text NOT NULL
    CHECK (last_four ~ '^\d{4}$'),
  bank text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  holder text NOT NULL DEFAULT '',
  custodian_id uuid
    REFERENCES public.staffs(id) ON DELETE SET NULL,
  expiry text NOT NULL
    CHECK (expiry ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_cards_company_list_id_idx
  ON public.credit_cards (company_list_id);

CREATE INDEX IF NOT EXISTS credit_cards_custodian_id_idx
  ON public.credit_cards (custodian_id);

COMMENT ON TABLE public.credit_cards IS
  'Company payment credit cards. company_list_id → company_list.uuid; custodian_id → staffs.id.';

COMMENT ON COLUMN public.credit_cards.company_list_id IS
  'Owning company (company_list.uuid).';

COMMENT ON COLUMN public.credit_cards.custodian_id IS
  'Card custodian (staffs.id).';

COMMENT ON COLUMN public.credit_cards.last_four IS
  'Last four digits only. Do not store the full card number.';

COMMENT ON COLUMN public.credit_cards.expiry IS
  'Card expiry as YYYY-MM.';

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on credit_cards" ON public.credit_cards;
CREATE POLICY "Allow select on credit_cards"
  ON public.credit_cards FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on credit_cards" ON public.credit_cards;
CREATE POLICY "Allow insert on credit_cards"
  ON public.credit_cards FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on credit_cards" ON public.credit_cards;
CREATE POLICY "Allow update on credit_cards"
  ON public.credit_cards FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on credit_cards" ON public.credit_cards;
CREATE POLICY "Allow delete on credit_cards"
  ON public.credit_cards FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_cards TO anon, authenticated;
GRANT ALL ON public.credit_cards TO service_role;
