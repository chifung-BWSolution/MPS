-- Phase 1: Fix cfb.app01@chifung.net identity collision (Dylan Peng vs Ashley Chen)
-- Does NOT modify Bubble or staff_directory sync data.
-- Rollback: see comments at bottom.

-- Backup affected rows (idempotent re-run skips if backup exists)
CREATE TABLE IF NOT EXISTS public._backup_phase1_user_info_20260630 AS
SELECT *, NOW() AS backed_up_at FROM public.user_info WHERE false;

INSERT INTO public._backup_phase1_user_info_20260630
SELECT ui.*, NOW()
FROM public.user_info ui
WHERE ui.staff_id IN (
  '1778312274854x514680847594946600',
  '1782298111832x580207666544246800'
)
AND NOT EXISTS (
  SELECT 1 FROM public._backup_phase1_user_info_20260630 b
  WHERE b.id = ui.id
);

CREATE TABLE IF NOT EXISTS public._backup_phase1_day_reports_20260630 AS
SELECT *, NOW() AS backed_up_at FROM public.day_reports WHERE false;

INSERT INTO public._backup_phase1_day_reports_20260630
SELECT dr.*, NOW()
FROM public.day_reports dr
WHERE dr.staff_id = '1778312274854x514680847594946600'
  AND dr.report_date IN ('2026-06-25', '2026-06-26', '2026-06-29')
AND NOT EXISTS (
  SELECT 1 FROM public._backup_phase1_day_reports_20260630 b WHERE b.id = dr.id
);

CREATE TABLE IF NOT EXISTS public._backup_phase1_day_report_entries_20260630 AS
SELECT *, NOW() AS backed_up_at FROM public.day_report_entries WHERE false;

INSERT INTO public._backup_phase1_day_report_entries_20260630
SELECT e.*, NOW()
FROM public.day_report_entries e
WHERE e.staff_id = '1778312274854x514680847594946600'
  AND e.day_report_id IN (
    SELECT id FROM public.day_reports
    WHERE staff_id = '1778312274854x514680847594946600'
      AND report_date IN ('2026-06-25', '2026-06-26', '2026-06-29')
  )
AND NOT EXISTS (
  SELECT 1 FROM public._backup_phase1_day_report_entries_20260630 b WHERE b.id = e.id
);

-- 1.1 Remove Ashley from login whitelist
DELETE FROM public.user_info
WHERE staff_id = '1778312274854x514680847594946600';

-- 1.2 Normalize Dylan user_info
UPDATE public.user_info
SET
  display_name = 'Dylan Peng',
  email = 'cfb.app01@chifung.net',
  google_email = 'cfb.app01@chifung.net',
  role_tag = 'super_admin',
  classification = 'system_user',
  system_status = 'active',
  department = 'System',
  office = '深圳',
  updated_at = NOW()
WHERE staff_id = '1782298111832x580207666544246800';

-- 1.3 Seed Dylan into system_users (table was empty)
INSERT INTO public.system_users (
  bubble_staff_id,
  display_name,
  email,
  google_email,
  role,
  department,
  position,
  profile_pic_url,
  is_active,
  created_at,
  updated_at
)
SELECT
  '1782298111832x580207666544246800',
  'Dylan Peng',
  'cfb.app01@chifung.net',
  'cfb.app01@chifung.net',
  'super_admin',
  'System',
  sd.position,
  sd.profile_pic_url,
  true,
  NOW(),
  NOW()
FROM public.staff_directory sd
WHERE sd.bubble_staff_id = '1782298111832x580207666544246800'
  AND NOT EXISTS (
    SELECT 1 FROM public.system_users su
    WHERE su.bubble_staff_id = '1782298111832x580207666544246800'
  );

-- 1.4 Re-attribute mis-submitted day reports (Dylan's submissions under Ashley staff_id)
UPDATE public.day_report_entries
SET staff_id = '1782298111832x580207666544246800'
WHERE staff_id = '1778312274854x514680847594946600'
  AND day_report_id IN (
    SELECT id FROM public.day_reports
    WHERE staff_id = '1778312274854x514680847594946600'
      AND report_date IN ('2026-06-25', '2026-06-26', '2026-06-29')
  );

UPDATE public.day_reports
SET
  staff_id = '1782298111832x580207666544246800',
  updated_at = NOW()
WHERE staff_id = '1778312274854x514680847594946600'
  AND report_date IN ('2026-06-25', '2026-06-26', '2026-06-29');

-- Rollback (manual, if needed):
-- INSERT INTO user_info SELECT id, staff_id, role_tag, system_status, classification, updated_at, created_at, display_name, email, google_email, office, department FROM _backup_phase1_user_info_20260630 WHERE staff_id = '1778312274854x514680847594946600';
-- UPDATE day_reports dr SET staff_id = b.staff_id, updated_at = b.updated_at FROM _backup_phase1_day_reports_20260630 b WHERE dr.id = b.id;
-- UPDATE day_report_entries e SET staff_id = b.staff_id FROM _backup_phase1_day_report_entries_20260630 b WHERE e.id = b.id;
-- DELETE FROM system_users WHERE bubble_staff_id = '1782298111832x580207666544246800';
