-- user_info table: stores system user configurations (classification + role tags)
-- Links to staff_directory via staff_id (bubble_staff_id)

CREATE TABLE IF NOT EXISTS public.user_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id TEXT NOT NULL UNIQUE,
  role_tag TEXT,
  system_status TEXT NOT NULL DEFAULT 'active',
  classification TEXT NOT NULL DEFAULT 'other_staff',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_info_staff_id ON public.user_info(staff_id);
CREATE INDEX IF NOT EXISTS idx_user_info_classification ON public.user_info(classification);
CREATE INDEX IF NOT EXISTS idx_user_info_system_status ON public.user_info(system_status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_info;
