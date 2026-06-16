-- ============================================================
-- Brand list (brand_list)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brand_list (
  id              text PRIMARY KEY,
  company_id      text NOT NULL,
  brand_code      text NOT NULL,
  brand_name_zh   text NOT NULL,
  brand_name_en   text NOT NULL,
  industry        text,
  logo_url        text,
  primary_color   text NOT NULL DEFAULT '#0D9488',
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.brand_list FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users"
  ON public.brand_list FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
  ON public.brand_list FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated users"
  ON public.brand_list FOR DELETE TO authenticated USING (true);

-- Seed: 9 brands
INSERT INTO public.brand_list
  (id, company_id, brand_code, brand_name_zh, brand_name_en, industry, primary_color, description, is_active)
VALUES
  ('b1', 'c1', 'BW',  '志豐企業',          'BWDesign Centre',             'IT & Design',        '#0D9488', '品牌設計與活動策劃公司', true),
  ('b2', 'c1', 'ACI', '亞洲信譽國際',       'Asia Credibility International', 'Business Consulting', '#3B82F6', '國際商務顧問及認證服務', true),
  ('b3', 'c1', 'BSC', '商業服務中心',       'Business Service Centre',     'Business Services',  '#F59E0B', '企業服務與顧問支援',     true),
  ('b4', 'c2', 'FCC', 'Food Channels 開餐廳', 'Food Channels',             'F&B Services',       '#E85D04', '餐飲服務及到會品牌',     true),
  ('b5', 'c2', 'ZFT', '志豐貿易',          'ZhiFeng Trading',             'Trading',            '#1E3A5F', '國際貿易業務',           true),
  ('b6', 'c3', 'GLE', '綠色生活體驗',       'Green Living Experience',     'Eco Products',       '#10B981', '環保生活產品推廣',       false),
  ('b7', 'c2', 'WP',  'Wine Passions',      'Wine Passions',               'Wine & Beverage',    '#8B0000', '葡萄酒相關品牌',         true),
  ('b8', 'c2', 'FC',  'Food Channels 開餐廳', 'Food Channels',             'F&B Services',       '#E85D04', '餐飲服務及到會品牌',     true),
  ('b9', 'c2', 'CFG', '志豐集團',          'ChiFung Group',               'Conglomerate',       '#1E3A5F', '志豐集團及旗下多元業務', true)
ON CONFLICT (id) DO NOTHING;
