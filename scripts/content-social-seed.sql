-- ============================================================
-- 社媒自動營運 · 示範營運資料（可重複執行，只新增不刪改）
--
-- 目的：讓「今日工作」頁一打開就有品牌組、帳號、熱點，
--       系統會在 2 分鐘內自動產出長文＋各平台導流。
--
-- 手動執行：
--   Supabase SQL Editor 貼上，或
--   node scripts/content-run-sql.mjs scripts/content-social-seed.sql
-- ============================================================

-- 品牌組
INSERT INTO public.content_social_groups (name, description)
SELECT 'Beauty100 美妝組', '美妝、護膚、成分與保養話題'
WHERE NOT EXISTS (SELECT 1 FROM public.content_social_groups WHERE name = 'Beauty100 美妝組');

INSERT INTO public.content_social_groups (name, description)
SELECT 'Beauty100 生活組', '生活風格、日常習慣與好物分享'
WHERE NOT EXISTS (SELECT 1 FROM public.content_social_groups WHERE name = 'Beauty100 生活組');

-- 社群帳號
INSERT INTO public.content_social_accounts (platform, handle, display_name, login_status)
SELECT value.platform, value.handle, value.display_name, 'active'
FROM (
  VALUES
    ('instagram', 'beauty100hk', 'Beauty100 美妝誌'),
    ('threads', 'beauty100hk', 'Beauty100 美妝誌'),
    ('facebook', 'beauty100magazine', 'Beauty100 Magazine'),
    ('xiaohongshu', 'beauty100hk', '美妝100')
) AS value(platform, handle, display_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.content_social_accounts account
  WHERE account.platform = value.platform AND account.handle = value.handle
);

-- 帳號 ↔ 組（IG 同時屬於兩組，示範「一帳號多組」）
INSERT INTO public.content_social_group_members (group_id, account_id)
SELECT groups.id, accounts.id
FROM public.content_social_groups groups
JOIN public.content_social_accounts accounts ON accounts.archived = false
WHERE
  (groups.name = 'Beauty100 美妝組' AND accounts.handle IN ('beauty100hk', 'beauty100magazine'))
  OR (groups.name = 'Beauty100 生活組' AND accounts.platform IN ('instagram', 'facebook'))
ON CONFLICT (group_id, account_id) DO NOTHING;

-- 熱點（首批）
INSERT INTO public.content_hot_events (title, summary, url, heat, source, status)
SELECT value.title, value.summary, value.url, value.heat, 'manual', 'open'
FROM (
  VALUES
    (
      '換季敏感肌點樣揀潔面？',
      '轉季時幾多人都會用錯潔面：起泡太多、洗完繃緊，其實代表屏障已經被洗走。重點是看界面活性劑與洗完之後的感覺。',
      NULL,
      86
    ),
    (
      '煙醯胺同維他命C可唔可以一齊用？',
      '同一晚疊加高濃度煙醯胺與純維他命C，刺激風險比效果更值得關注。分開早晚使用，多數人會更穩定。',
      NULL,
      78
    ),
    (
      '防曬要幾耐補一次？',
      '室內、室外、流汗與否的補塗節奏完全不同；與其記「兩小時」，不如記「有無流汗、有無抹面」。',
      NULL,
      72
    ),
    (
      '頸紋保養應該由幾歲開始？',
      '頸紋多數來自日曬與長期低頭，保養重點不是貴價精華，而是防曬、濕潤與減少摩擦。',
      NULL,
      64
    )
) AS value(title, summary, url, heat)
WHERE NOT EXISTS (
  SELECT 1 FROM public.content_hot_events event WHERE event.title = value.title
);
