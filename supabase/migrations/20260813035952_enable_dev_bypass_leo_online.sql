-- Enable Developer Bypass Login for Leo Tse (brandingworks.online@gmail.com).
-- Ensure the staffs + users rows stay active so whitelist lookup succeeds.

UPDATE public.staffs
SET
  status = 'active',
  work_email = COALESCE(NULLIF(work_email, ''), 'brandingworks.online@gmail.com'),
  display_name = COALESCE(NULLIF(display_name, ''), 'Leo Tse'),
  updated_at = NOW()
WHERE id = '6ddee578-cfe2-4e27-b758-affb02fa02ae'
   OR lower(coalesce(work_email, '')) = 'brandingworks.online@gmail.com';

UPDATE public.users
SET
  email = 'brandingworks.online@gmail.com',
  google_email = 'brandingworks.online@gmail.com',
  display_name = COALESCE(NULLIF(display_name, ''), 'Leo Tse'),
  system_status = 'active',
  department = COALESCE(NULLIF(department, ''), 'System'),
  updated_at = NOW()
WHERE staff_id = '6ddee578-cfe2-4e27-b758-affb02fa02ae'
   OR lower(coalesce(email, '')) = 'brandingworks.online@gmail.com'
   OR lower(coalesce(google_email, '')) = 'brandingworks.online@gmail.com';
