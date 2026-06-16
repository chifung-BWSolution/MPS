CREATE TABLE IF NOT EXISTS public.staff_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bubble_staff_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  full_name TEXT,
  position TEXT,
  user_role TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  work_email TEXT,
  private_email TEXT,
  work_phone TEXT,
  private_phone TEXT,
  base_location TEXT,
  birthday TEXT,
  entry_date TEXT,
  termination_date TEXT,
  probation_status TEXT,
  al_quota INTEGER,
  team_id TEXT,
  team_role TEXT,
  business_unit TEXT,
  brands JSONB,
  profile_pic_url TEXT,
  voov_id TEXT,
  bubble_created_date TEXT,
  bubble_modified_date TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_directory_bubble_id ON public.staff_directory(bubble_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_directory_status ON public.staff_directory(status);
CREATE INDEX IF NOT EXISTS idx_staff_directory_team ON public.staff_directory(team_id);
CREATE INDEX IF NOT EXISTS idx_staff_directory_email ON public.staff_directory(work_email);

ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_directory;
