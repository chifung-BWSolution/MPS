-- ============================================================
-- Projects list (projects_list)
-- Stores all internal and client projects
-- ============================================================

CREATE TABLE IF NOT EXISTS public.projects_list (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  client_name         text,
  company_id          text,
  brand_id            text,
  project_type        text NOT NULL DEFAULT 'other',
  project_category    text NOT NULL DEFAULT 'internal',   -- internal | client
  status              text NOT NULL DEFAULT 'planning',   -- planning | active | on_hold | completed | cancelled
  progress            integer NOT NULL DEFAULT 0,
  assigned_pm         text,
  assigned_pm_id      text,
  brand               text,
  company             text,
  budget_total        numeric NOT NULL DEFAULT 0,
  budget_used         numeric NOT NULL DEFAULT 0,
  start_date          date,
  end_date            date,
  description         text,
  priority            text NOT NULL DEFAULT 'medium',     -- low | medium | high | urgent
  billing_model       text,                               -- one_time | recurring
  billing_frequency   text,                               -- monthly | quarterly | semi_annual | annual
  contract_start_date date,
  contract_duration   integer,
  service_items       jsonb,                              -- array of ServiceItem
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.projects_list FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users"
  ON public.projects_list FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
  ON public.projects_list FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated users"
  ON public.projects_list FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Seed: 9 projects (7 internal + 2 client)
-- ============================================================

INSERT INTO public.projects_list
  (id, name, client_name, company_id, brand_id, project_type, project_category, status, progress, assigned_pm, brand, company, budget_total, budget_used, start_date, end_date, priority, billing_model, billing_frequency, contract_start_date, contract_duration, service_items)
VALUES
  ('p1', 'BW 官網重建',         NULL,          'c1', 'b1', 'web_design',   'internal', 'active',    72,  '陳小華', 'BW',  'BWD', 45000,  32400,  '2024-10-01', '2025-01-15', 'high',   NULL,          NULL,      NULL,         NULL, NULL),
  ('p2', 'ACI 品牌推廣活動',    '環球貿易公司', 'c1', 'b2', 'event',        'client',   'active',    45,  '戴維斯', 'ACI', 'BWD', 120000, 96000,  '2024-11-01', '2025-02-28', 'urgent', 'one_time',    NULL,      NULL,         NULL,
    '[{"id":"si1","serviceType":"event","quantity":2,"unit":"項","deliveryDate":"2025-01-15","notes":"品牌發佈會"},{"id":"si2","serviceType":"graphic_design","quantity":5,"unit":"套","deliveryDate":"2024-12-20","notes":"宣傳物料設計"},{"id":"si3","serviceType":"video","quantity":3,"unit":"條","deliveryDate":"2025-02-10","notes":"活動宣傳短片"}]'),
  ('p3', 'FCC 紅酒品鑑會',      NULL,          'c2', 'b4', 'event',        'internal', 'planning',  15,  '朴賢俊', 'FCC', 'ZF',  85000,  12750,  '2025-01-15', '2025-03-31', 'medium', NULL,          NULL,      NULL,         NULL, NULL),
  ('p4', 'BW SEO 全面升級',     NULL,          'c1', 'b1', 'seo_upgrade',  'internal', 'active',    60,  '陳小華', 'BW',  'BWD', 35000,  21000,  '2024-12-01', '2025-04-30', 'high',   NULL,          NULL,      NULL,         NULL, NULL),
  ('p5', 'BSC 企業形象影片',    '創新科技有限公司', 'c1', 'b3', 'video',   'client',   'on_hold',   30,  '戴維斯', 'BSC', 'BWD', 55000,  16500,  '2024-11-15', '2025-03-15', 'medium', 'recurring',   'monthly', '2024-11-01', 6,
    '[{"id":"si4","serviceType":"video","quantity":4,"unit":"條","deliveryDate":"2025-01-30","notes":"企業形象片"},{"id":"si5","serviceType":"graphic_design","quantity":2,"unit":"套","deliveryDate":"2024-12-15","notes":"片頭片尾設計"}]'),
  ('p6', 'ACI 微信公眾號營運',  NULL,          'c1', 'b2', 'social_media', 'internal', 'active',    88,  '朴賢俊', 'ACI', 'BWD', 18000,  15840,  '2024-09-01', '2025-02-28', 'low',    NULL,          NULL,      NULL,         NULL, NULL),
  ('p7', 'FCC 電商網站',        NULL,          'c2', 'b4', 'web_design',   'internal', 'completed', 100, '陳小華', 'FCC', 'ZF',  68000,  65000,  '2024-07-01', '2024-12-31', 'high',   NULL,          NULL,      NULL,         NULL, NULL),
  ('p8', 'BW Google Ads 投放',  NULL,          'c1', 'b1', 'paid_ads',     'internal', 'active',    50,  '朴賢俊', 'BW',  'BWD', 25000,  12500,  '2025-01-01', '2025-06-30', 'medium', NULL,          NULL,      NULL,         NULL, NULL),
  ('p9', 'ZFT 品牌官網開發',    NULL,          'c2', 'b5', 'web_design',   'internal', 'active',    25,  '陳小華', 'ZFT', 'ZF',  38000,  9500,   '2025-01-10', '2025-05-30', 'medium', NULL,          NULL,      NULL,         NULL, NULL)
ON CONFLICT (id) DO NOTHING;
