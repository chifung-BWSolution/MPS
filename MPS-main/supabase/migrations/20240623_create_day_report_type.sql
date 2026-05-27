-- ============================================================
-- Day report work types (day_report_type)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day_report_type (
  id                  text PRIMARY KEY,
  label               text NOT NULL,
  icon                text NOT NULL DEFAULT '📋',
  color               text NOT NULL DEFAULT 'text-blue-700',
  bg                  text NOT NULL DEFAULT 'bg-blue-100',
  relation_type       text NOT NULL DEFAULT 'project_website',
  description         text NOT NULL DEFAULT '',
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  associated_modules  text[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.day_report_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.day_report_type FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users"
  ON public.day_report_type FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
  ON public.day_report_type FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated users"
  ON public.day_report_type FOR DELETE TO authenticated USING (true);

-- Seed: 13 default work types
INSERT INTO public.day_report_type
  (id, label, icon, color, bg, relation_type, description, is_active, sort_order, associated_modules)
VALUES
  ('website_design',   '網站設計',   '🎨', 'text-blue-700',    'bg-blue-100',    'project_website',   '網站界面設計、UI/UX 更新',       true,  0,  ARRAY['website_system']),
  ('website_dev',      '網站開發',   '💻', 'text-indigo-700',   'bg-indigo-100',  'project_website',   '網站功能開發、程式修改',           true,  1,  ARRAY['website_system']),
  ('article_writing',  '文章撰寫',   '✍️', 'text-emerald-700',  'bg-emerald-100', 'project_website',   '文章撰寫、部落格內容',             true,  2,  ARRAY['marketing','website_system']),
  ('video_shooting',   '影片拍攝',   '🎥', 'text-purple-700',   'bg-purple-100',  'project_website',   '影片拍攝、取景',                   true,  3,  ARRAY['video_production']),
  ('video_editing',    '影片剪輯',   '🎬', 'text-violet-700',   'bg-violet-100',  'project_website',   '影片剪輯、後製',                   true,  4,  ARRAY['video_production']),
  ('social_media',     '社交媒體',   '📱', 'text-pink-700',     'bg-pink-100',    'project_website',   '社交媒體內容製作、發佈',           true,  5,  ARRAY['marketing']),
  ('edm',              'EDM 行銷',   '📧', 'text-rose-700',     'bg-rose-100',    'project_website',   '電子郵件行銷內容',                 true,  6,  ARRAY['marketing']),
  ('paid_ads',         '付費廣告',   '📊', 'text-orange-700',   'bg-orange-100',  'project_website',   '付費廣告投放管理',                 true,  7,  ARRAY['marketing']),
  ('seo',              'SEO 優化',   '🔍', 'text-lime-700',     'bg-lime-100',    'project_website',   'SEO 關鍵字優化、排名提升',         true,  8,  ARRAY['website_system','marketing']),
  ('graphic_design',   '平面設計',   '🖼️', 'text-cyan-700',     'bg-cyan-100',    'project_website',   '平面設計、海報、Banner',           true,  9,  ARRAY['marketing','website_system']),
  ('client_meeting',   '客戶會議',   '🤝', 'text-amber-700',    'bg-amber-100',   'project_website',   '客戶會議、提案、溝通',             true,  10, ARRAY['website_system','marketing','video_production']),
  ('internal_meeting', '內部會議',   '💼', 'text-teal-700',     'bg-teal-100',    'internal_project',  '內部會議、團隊討論、規劃',         true,  11, ARRAY[]::text[]),
  ('training',         '學習培訓',   '📚', 'text-yellow-700',   'bg-yellow-100',  'none',              '學習培訓、課程研習',               true,  12, ARRAY[]::text[])
ON CONFLICT (id) DO NOTHING;
