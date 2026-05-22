-- Fix RLS for system_users and login_logs tables
-- Ensures authenticated Google OAuth users can read system_users during login verification
-- and can write to login_logs

-- system_users: disable RLS to allow all reads during auth verification
DROP POLICY IF EXISTS "Allow public read access" ON public.system_users;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.system_users;
DROP POLICY IF EXISTS "Allow all access" ON public.system_users;
DROP POLICY IF EXISTS "Allow anon read" ON public.system_users;

ALTER TABLE public.system_users DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.system_users TO anon;
GRANT ALL ON public.system_users TO authenticated;
GRANT ALL ON public.system_users TO service_role;

-- login_logs: disable RLS to allow inserts during auth flow
DROP POLICY IF EXISTS "Allow public insert" ON public.login_logs;
DROP POLICY IF EXISTS "Allow authenticated full access" ON public.login_logs;
DROP POLICY IF EXISTS "Allow all access" ON public.login_logs;

ALTER TABLE public.login_logs DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.login_logs TO anon;
GRANT ALL ON public.login_logs TO authenticated;
GRANT ALL ON public.login_logs TO service_role;

-- Ensure user_info is also still accessible (belt and suspenders)
ALTER TABLE public.user_info DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.user_info TO anon;
GRANT ALL ON public.user_info TO authenticated;
GRANT ALL ON public.user_info TO service_role;
