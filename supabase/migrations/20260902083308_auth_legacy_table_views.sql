-- Cached / old clients still query the pre-purge table names:
--   system_users (dropped)
--   user_info (renamed to users)
--   staff_directory (renamed to staffs)
-- Expose read-only compatibility views so login whitelist lookups stop 404ing.

CREATE OR REPLACE VIEW public.system_users
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.staff_id,
  u.auth_user_id,
  u.email,
  u.email AS google_email,
  s.display_name,
  u.role_tag AS role,
  s.team_name AS department,
  s.position,
  COALESCE(s.work_phone, s.private_phone) AS phone,
  true AS is_active,
  s.otc_staff_sync_id::text AS bubble_staff_id,
  u.created_at,
  u.updated_at
FROM public.users u
LEFT JOIN public.staffs s ON s.id = u.staff_id;

CREATE OR REPLACE VIEW public.user_info
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.staff_id,
  u.auth_user_id,
  u.role_tag,
  u.email,
  u.email AS google_email,
  s.display_name,
  s.base_location AS office,
  s.team_name AS department,
  u.created_at,
  u.updated_at
FROM public.users u
LEFT JOIN public.staffs s ON s.id = u.staff_id;

CREATE OR REPLACE VIEW public.staff_directory
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.otc_staff_sync_id::text AS bubble_staff_id,
  s.display_name,
  s.full_name,
  s.status,
  s.position,
  s.work_email,
  s.private_email,
  s.work_phone,
  s.private_phone,
  s.base_location,
  s.team_name,
  s.profile_pic_url,
  s.created_at,
  s.updated_at
FROM public.staffs s;

COMMENT ON VIEW public.system_users IS
  'Read-only alias of users + staffs for old login clients. Do not write.';
COMMENT ON VIEW public.user_info IS
  'Read-only alias of users + staffs for old login clients. Do not write.';
COMMENT ON VIEW public.staff_directory IS
  'Read-only alias of staffs for old login clients. Do not write.';

GRANT SELECT ON public.system_users TO anon, authenticated;
GRANT SELECT ON public.user_info TO anon, authenticated;
GRANT SELECT ON public.staff_directory TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
