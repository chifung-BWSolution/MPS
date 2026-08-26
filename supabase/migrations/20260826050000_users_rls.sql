-- Enable RLS on public.users (login allowlist) without blocking existing app paths.
--
-- Reads (anon + authenticated):
--   OAuth / dev-bypass whitelist lookup (email, auth_user_id, staff_id)
--   Settings → 用戶管理 / 員工列表
--   login_logs.user_id embed + email name fallback
--   login_logs_match_user_id() on insert (also SECURITY DEFINER below)
--   resolve_users_for_auth() is already SECURITY DEFINER
--
-- Writes (authenticated only):
--   Settings add / edit / remove whitelist rows
--   First-time auth_user_id link is written by resolve_users_for_auth(), not the client
--
-- Anon cannot insert/update/delete/truncate the allowlist.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access" ON public.users;
DROP POLICY IF EXISTS "Allow public read access" ON public.users;
DROP POLICY IF EXISTS "Allow public write access" ON public.users;
DROP POLICY IF EXISTS "Allow all access" ON public.users;
DROP POLICY IF EXISTS "users_select_clients" ON public.users;
DROP POLICY IF EXISTS "users_insert_authenticated" ON public.users;
DROP POLICY IF EXISTS "users_update_authenticated" ON public.users;
DROP POLICY IF EXISTS "users_delete_authenticated" ON public.users;

CREATE POLICY "users_select_clients"
  ON public.users
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "users_insert_authenticated"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "users_update_authenticated"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "users_delete_authenticated"
  ON public.users
  FOR DELETE
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.users FROM PUBLIC;
REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.users FROM authenticated;

GRANT SELECT ON TABLE public.users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;

-- Trigger on login_logs INSERT (anon or authenticated) must still resolve user_id.
CREATE OR REPLACE FUNCTION public.login_logs_match_user_id(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE p_email IS NOT NULL
    AND btrim(p_email) <> ''
    AND lower(trim(coalesce(u.email, ''))) = lower(trim(p_email))
  ORDER BY u.created_at NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.login_logs_match_user_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_logs_match_user_id(text) TO anon;
GRANT EXECUTE ON FUNCTION public.login_logs_match_user_id(text) TO authenticated;

COMMENT ON TABLE public.users IS
  'App login allowlist. RLS: clients may read; only authenticated sessions may write. Display fields come from staffs via staff_id.';
