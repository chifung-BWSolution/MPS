-- Platform account status + many-to-many link to vchannel_login_methods

ALTER TABLE public.vchannel_accounts
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS vchannel_accounts_is_active_idx
  ON public.vchannel_accounts (is_active);

COMMENT ON COLUMN public.vchannel_accounts.is_active IS
  'Whether this platform account is active';

CREATE TABLE IF NOT EXISTS public.vchannel_account_login_methods (
  vchannel_account_id uuid NOT NULL REFERENCES public.vchannel_accounts(id) ON DELETE CASCADE,
  login_method_id     uuid NOT NULL REFERENCES public.vchannel_login_methods(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vchannel_account_id, login_method_id)
);

CREATE INDEX IF NOT EXISTS vchannel_account_login_methods_login_method_idx
  ON public.vchannel_account_login_methods (login_method_id);

CREATE INDEX IF NOT EXISTS vchannel_account_login_methods_account_idx
  ON public.vchannel_account_login_methods (vchannel_account_id);

ALTER TABLE public.vchannel_account_login_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on vchannel_account_login_methods" ON public.vchannel_account_login_methods;
CREATE POLICY "Allow select on vchannel_account_login_methods"
  ON public.vchannel_account_login_methods FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on vchannel_account_login_methods" ON public.vchannel_account_login_methods;
CREATE POLICY "Allow insert on vchannel_account_login_methods"
  ON public.vchannel_account_login_methods FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on vchannel_account_login_methods" ON public.vchannel_account_login_methods;
CREATE POLICY "Allow update on vchannel_account_login_methods"
  ON public.vchannel_account_login_methods FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on vchannel_account_login_methods" ON public.vchannel_account_login_methods;
CREATE POLICY "Allow delete on vchannel_account_login_methods"
  ON public.vchannel_account_login_methods FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vchannel_account_login_methods TO anon, authenticated;
GRANT ALL ON public.vchannel_account_login_methods TO service_role;

COMMENT ON TABLE public.vchannel_account_login_methods IS
  'Join: vchannel_accounts ↔ vchannel_login_methods';
