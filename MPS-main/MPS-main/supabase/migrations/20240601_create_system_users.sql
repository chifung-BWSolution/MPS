-- System Users table: maps Bubble.io Staff to Supabase Auth users
-- Allows staff from the employee directory to be granted system login access

CREATE TABLE IF NOT EXISTS public.system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  bubble_staff_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'designer',
  department TEXT,
  position TEXT,
  profile_pic_url TEXT,
  is_active BOOLEAN DEFAULT true,
  google_email TEXT,
  last_login_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Login logs table
CREATE TABLE IF NOT EXISTS public.login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.system_users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  login_method TEXT NOT NULL DEFAULT 'google',
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_users_email ON public.system_users(email);
CREATE INDEX IF NOT EXISTS idx_system_users_bubble_staff_id ON public.system_users(bubble_staff_id);
CREATE INDEX IF NOT EXISTS idx_system_users_auth_user_id ON public.system_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON public.login_logs(created_at DESC);

-- Enable realtime for system_users
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_users;
