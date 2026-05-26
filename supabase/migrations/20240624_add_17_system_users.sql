-- Add 17 system users from the employee list to system_users and user_info tables
-- This ensures all listed users can log in via Google OAuth

-- ============================================================
-- SYSTEM_USERS: upsert all 17 users
-- ============================================================

INSERT INTO public.system_users (
  id, bubble_staff_id, display_name, email, google_email, role, department, position, is_active, created_at, updated_at
) VALUES
  (gen_random_uuid(), 'cfb_m02', 'Jane Long',     'cfb.m02@chifung.net', 'cfb.m02@chifung.net', 'staff',           'Marketing & Video', '媒體編輯/文案策劃',         true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_c02', 'Mirana Chan',   'cfb.c02@chifung.net', 'cfb.c02@chifung.net', 'designer',        'System',            'UI/網站設計師',              true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_m03', 'Kisa Cen',      'cfb.m03@chifung.net', 'cfb.m03@chifung.net', 'staff',           'FC',                '媒體編輯/文案策劃',         true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_m10', 'Frederick Lin', 'cfb.m10@chifung.net', 'cfb.m10@chifung.net', 'project_manager', 'Marketing & Video', '品牌策劃督監',               true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_m01', 'Silvia Liang',  'cfb.m01@chifung.net', 'cfb.m01@chifung.net', 'staff',           'Marketing & Video', '媒體編輯/文案策劃',         true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_m04', 'Ada Ou',        'cfb.m04@chifung.net', 'cfb.m04@chifung.net', 'management',      'Marketing & Video', '品牌策劃副理',               true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_m05', 'Michelle Chen', 'cfb.m05@chifung.net', 'cfb.m05@chifung.net', 'staff',           'Marketing & Video', '媒體編輯/文案測試',         true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_dynamic', 'Rebecca Cheng', 'chifung.dynamic@gmail.com', 'chifung.dynamic@gmail.com', 'management', 'FC', 'Operation and Admin Officer', true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_c01', 'KK Zhou',       'cfb.c01@chifung.net', 'cfb.c01@chifung.net', 'designer',        'Marketing & Video', '品牌視覺設計師',             true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_v01', 'Jasky Li',      'cfb.v01@chifung.net', 'cfb.v01@chifung.net', 'video_editor',    'Marketing & Video', '短視頻拍攝製作',             true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_ivan', 'Ivan Leung',   'winepassions.marketing@gmail.com', 'winepassions.marketing@gmail.com', 'management', 'Wine', 'Marketing Executive', true, NOW(), NOW()),
  (gen_random_uuid(), 'manual_super_admin_lowell', 'Lowell Lo', 'brandingworks.ebiz@gmail.com', 'brandingworks.ebiz@gmail.com', 'management', 'System', 'Online Marketing Officer', true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_bis',   'Bis Sit',     'brandingworks.live@gmail.com',  'brandingworks.live@gmail.com',  'management', 'System', 'Project Executive',                  true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_yoko',  'Yoko Cheung', 'yoko.kaffa@gmail.com',          'yoko.kaffa@gmail.com',          'management', 'FC',     'Marketing & Admin Manager',          true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_mandy', 'Mandy Mau',   'foodchannels.plan@gmail.com',   'foodchannels.plan@gmail.com',   'management', 'FC',     'Senior Marketing Project Executive', true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_franco','Franco Lee',  'franco.kaffa@gmail.com',        'franco.kaffa@gmail.com',        'management', 'Marketing & Video', 'Director',            true, NOW(), NOW()),
  (gen_random_uuid(), 'cfb_leo',   'Leo Tse',     'brandingworks.online@gmail.com','brandingworks.online@gmail.com','management', 'System', 'Project Executive',                  true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Remove duplicates that may have been inserted without ON CONFLICT (keep newest per google_email)
DELETE FROM public.system_users a
USING public.system_users b
WHERE a.created_at < b.created_at
  AND a.google_email = b.google_email;


-- ============================================================
-- USER_INFO: upsert all 17 users
-- ============================================================

INSERT INTO public.user_info (
  id, staff_id, display_name, email, google_email, role_tag, classification, system_status, created_at, updated_at
) VALUES
  (gen_random_uuid(), 'cfb_m02',      'Jane Long',     'cfb.m02@chifung.net',            'cfb.m02@chifung.net',            '文案同事',        'staff',           'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_c02',      'Mirana Chan',   'cfb.c02@chifung.net',            'cfb.c02@chifung.net',            '項目經理',        'designer',        'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_m03',      'Kisa Cen',      'cfb.m03@chifung.net',            'cfb.m03@chifung.net',            '文案同事',        'staff',           'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_m10',      'Frederick Lin', 'cfb.m10@chifung.net',            'cfb.m10@chifung.net',            '系統開發',        'project_manager', 'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_m01',      'Silvia Liang',  'cfb.m01@chifung.net',            'cfb.m01@chifung.net',            '文案同事',        'staff',           'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_m04',      'Ada Ou',        'cfb.m04@chifung.net',            'cfb.m04@chifung.net',            '管理層',          'management',      'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_m05',      'Michelle Chen', 'cfb.m05@chifung.net',            'cfb.m05@chifung.net',            '市場推廣',        'staff',           'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_dynamic',  'Rebecca Cheng', 'chifung.dynamic@gmail.com',      'chifung.dynamic@gmail.com',      '管理層',          'management',      'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_c01',      'KK Zhou',       'cfb.c01@chifung.net',            'cfb.c01@chifung.net',            '設計師',          'designer',        'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_v01',      'Jasky Li',      'cfb.v01@chifung.net',            'cfb.v01@chifung.net',            '影片製作',        'staff',           'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_ivan',     'Ivan Leung',    'winepassions.marketing@gmail.com','winepassions.marketing@gmail.com','管理層',         'management',      'active', NOW(), NOW()),
  (gen_random_uuid(), 'manual_super_admin_lowell', 'Lowell Lo', 'brandingworks.ebiz@gmail.com', 'brandingworks.ebiz@gmail.com', 'Administrator', 'management', 'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_bis',      'Bis Sit',       'brandingworks.live@gmail.com',   'brandingworks.live@gmail.com',   'Administrator',   'management',      'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_yoko',     'Yoko Cheung',   'yoko.kaffa@gmail.com',           'yoko.kaffa@gmail.com',           'Administrator',   'management',      'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_mandy',    'Mandy Mau',     'foodchannels.plan@gmail.com',    'foodchannels.plan@gmail.com',    '管理層',          'management',      'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_franco',   'Franco Lee',    'franco.kaffa@gmail.com',         'franco.kaffa@gmail.com',         'Administrator',   'management',      'active', NOW(), NOW()),
  (gen_random_uuid(), 'cfb_leo',      'Leo Tse',       'brandingworks.online@gmail.com', 'brandingworks.online@gmail.com', 'Administrator',   'management',      'active', NOW(), NOW())
ON CONFLICT (staff_id) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  email         = EXCLUDED.email,
  google_email  = EXCLUDED.google_email,
  role_tag      = EXCLUDED.role_tag,
  classification= EXCLUDED.classification,
  system_status = EXCLUDED.system_status,
  updated_at    = NOW();
