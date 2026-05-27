-- Add Super Admin: Lowell Lo (brandingworks.ebiz@gmail.com)
-- This migration creates the necessary records across all auth-related tables
-- to allow login as Administrator via Dev Bypass or Google OAuth.

-- 1. Insert into staff_directory (has unique on bubble_staff_id)
INSERT INTO public.staff_directory (
  id,
  bubble_staff_id,
  display_name,
  full_name,
  position,
  user_role,
  status,
  work_email,
  base_location,
  business_unit,
  synced_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'manual_super_admin_lowell',
  'Lowell Lo',
  'Lowell Lo',
  'Director',
  'Management',
  'active',
  'brandingworks.ebiz@gmail.com',
  'HK',
  'Management',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (bubble_staff_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  work_email = EXCLUDED.work_email,
  status = EXCLUDED.status,
  updated_at = NOW();

-- 2. Insert into system_users (the actual whitelist table checked during login)
-- First delete any existing record with this email to avoid duplicates
DELETE FROM public.system_users 
WHERE email = 'brandingworks.ebiz@gmail.com' 
   OR google_email = 'brandingworks.ebiz@gmail.com'
   OR bubble_staff_id = 'manual_super_admin_lowell';

INSERT INTO public.system_users (
  id,
  bubble_staff_id,
  display_name,
  email,
  google_email,
  role,
  department,
  position,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'manual_super_admin_lowell',
  'Lowell Lo',
  'brandingworks.ebiz@gmail.com',
  'brandingworks.ebiz@gmail.com',
  'management',
  'Management',
  'Director',
  true,
  NOW(),
  NOW()
);

-- 3. Insert into user_info with Administrator role_tag (has unique on staff_id)
INSERT INTO public.user_info (
  id,
  staff_id,
  role_tag,
  system_status,
  classification,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'manual_super_admin_lowell',
  'Administrator',
  'active',
  'management',
  NOW(),
  NOW()
)
ON CONFLICT (staff_id) DO UPDATE SET
  role_tag = 'Administrator',
  system_status = 'active',
  classification = 'management',
  updated_at = NOW();
