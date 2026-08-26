-- Enable RLS on login_logs without blocking login recording.
-- AuthContext writes as:
--   authenticated — Google OAuth success/failure (session present)
--   anon          — dev-bypass login (no Supabase session)
-- Settings → 登入紀錄 reads as whichever of those roles the client currently is.
-- Clients cannot update or delete rows (audit log).

ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert" ON public.login_logs;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.login_logs;
DROP POLICY IF EXISTS "Allow all access" ON public.login_logs;
DROP POLICY IF EXISTS "login_logs_insert_clients" ON public.login_logs;
DROP POLICY IF EXISTS "login_logs_select_clients" ON public.login_logs;

CREATE POLICY "login_logs_insert_clients"
  ON public.login_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "login_logs_select_clients"
  ON public.login_logs
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.login_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.login_logs FROM anon;
REVOKE ALL ON TABLE public.login_logs FROM authenticated;

GRANT SELECT, INSERT ON TABLE public.login_logs TO anon;
GRANT SELECT, INSERT ON TABLE public.login_logs TO authenticated;
GRANT ALL ON TABLE public.login_logs TO service_role;
