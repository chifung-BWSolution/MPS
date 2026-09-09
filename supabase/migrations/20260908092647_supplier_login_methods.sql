-- Many-to-many: suppliers ↔ vchannel_login_methods

CREATE TABLE IF NOT EXISTS public.supplier_login_methods (
  supplier_id     text NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  login_method_id uuid NOT NULL REFERENCES public.vchannel_login_methods(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, login_method_id)
);

CREATE INDEX IF NOT EXISTS supplier_login_methods_login_method_idx
  ON public.supplier_login_methods (login_method_id);

ALTER TABLE public.supplier_login_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on supplier_login_methods" ON public.supplier_login_methods;
CREATE POLICY "Allow select on supplier_login_methods"
  ON public.supplier_login_methods FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on supplier_login_methods" ON public.supplier_login_methods;
CREATE POLICY "Allow insert on supplier_login_methods"
  ON public.supplier_login_methods FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on supplier_login_methods" ON public.supplier_login_methods;
CREATE POLICY "Allow update on supplier_login_methods"
  ON public.supplier_login_methods FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on supplier_login_methods" ON public.supplier_login_methods;
CREATE POLICY "Allow delete on supplier_login_methods"
  ON public.supplier_login_methods FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_login_methods TO anon, authenticated;
GRANT ALL ON public.supplier_login_methods TO service_role;

COMMENT ON TABLE public.supplier_login_methods IS
  'Join: suppliers ↔ vchannel_login_methods';
