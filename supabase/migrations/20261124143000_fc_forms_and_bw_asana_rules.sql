-- FC: FCP 活動策劃 and consulting forms get their own project, prefix, and assignee.
-- BW: keyword rules are editable before the mailbox is authorised. Nothing reads them yet.

ALTER TABLE public.asana_mail_rules
  ADD COLUMN IF NOT EXISTS fcp_project_gid text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fcp_title_prefix text NOT NULL DEFAULT 'FCP',
  ADD COLUMN IF NOT EXISTS consulting_project_gid text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS consulting_title_prefix text NOT NULL DEFAULT 'FC Consulting Marketing',
  ADD COLUMN IF NOT EXISTS consulting_assignee_gid text NOT NULL DEFAULT '';

UPDATE public.asana_mail_rules
SET
  fcp_project_gid = CASE WHEN fcp_project_gid = '' THEN catering_project_gid ELSE fcp_project_gid END,
  fcp_title_prefix = CASE WHEN fcp_title_prefix = '' THEN 'FCP' ELSE fcp_title_prefix END,
  consulting_project_gid = CASE WHEN consulting_project_gid = '' THEN '311801290302052' ELSE consulting_project_gid END,
  consulting_title_prefix = CASE WHEN consulting_title_prefix = '' THEN 'FC Consulting Marketing' ELSE consulting_title_prefix END,
  consulting_assignee_gid = CASE WHEN consulting_assignee_gid = '' THEN '1208059633171044' ELSE consulting_assignee_gid END
WHERE code = 'fcc';

CREATE TABLE IF NOT EXISTS public.bw_asana_mail_settings (
  code text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  gmail_address text NOT NULL DEFAULT 'brandingworks.services@gmail.com',
  workspace_gid text NOT NULL DEFAULT '6649488167653',
  match_mode text NOT NULL DEFAULT 'phrase',
  min_match_words integer NOT NULL DEFAULT 3,
  skip_subjects text[] NOT NULL DEFAULT ARRAY['bill for', 'sales report', 'daily sales report'],
  title_format text NOT NULL DEFAULT '{主旨冒號前} - {客人姓名} {電話} {地址}',
  collaborator_gids text[] NOT NULL DEFAULT ARRAY['1200860798875851', '803462487490302', '6649488551741'],
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bw_asana_mail_settings_match_mode_check CHECK (match_mode IN ('phrase', 'words'))
);

CREATE TABLE IF NOT EXISTS public.bw_asana_mail_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  assignee_name text NOT NULL DEFAULT '',
  assignee_email text NOT NULL DEFAULT '',
  project_name text NOT NULL DEFAULT '',
  project_gid text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bw_asana_mail_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bw_asana_mail_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on bw_asana_mail_settings" ON public.bw_asana_mail_settings;
DROP POLICY IF EXISTS "Allow update on bw_asana_mail_settings" ON public.bw_asana_mail_settings;
CREATE POLICY "Allow select on bw_asana_mail_settings"
  ON public.bw_asana_mail_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow update on bw_asana_mail_settings"
  ON public.bw_asana_mail_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select on bw_asana_mail_routes" ON public.bw_asana_mail_routes;
DROP POLICY IF EXISTS "Allow insert on bw_asana_mail_routes" ON public.bw_asana_mail_routes;
DROP POLICY IF EXISTS "Allow update on bw_asana_mail_routes" ON public.bw_asana_mail_routes;
DROP POLICY IF EXISTS "Allow delete on bw_asana_mail_routes" ON public.bw_asana_mail_routes;
CREATE POLICY "Allow select on bw_asana_mail_routes"
  ON public.bw_asana_mail_routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert on bw_asana_mail_routes"
  ON public.bw_asana_mail_routes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update on bw_asana_mail_routes"
  ON public.bw_asana_mail_routes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on bw_asana_mail_routes"
  ON public.bw_asana_mail_routes FOR DELETE TO authenticated USING (true);

GRANT SELECT, UPDATE ON public.bw_asana_mail_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bw_asana_mail_routes TO authenticated;
GRANT ALL ON public.bw_asana_mail_settings TO service_role;
GRANT ALL ON public.bw_asana_mail_routes TO service_role;

INSERT INTO public.bw_asana_mail_settings (code, enabled)
VALUES ('bw', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.bw_asana_mail_routes (keyword, assignee_name, assignee_email, project_name, project_gid, sort_order)
SELECT seed.keyword, seed.assignee_name, seed.assignee_email, seed.project_name, seed.project_gid, seed.sort_order
FROM (
  VALUES
    ('牆身工程', 'Franco / Angel', 'brandingworks.key@gmail.com', 'BWC Wall Business 商業牆身 Follow Up', '1200338220894162', 1),
    ('Material', 'Franco / Angel', 'franco.lee@winepassions.com', '', '', 2),
    ('Wall Creative', 'BW Marketing', 'brandingworks.marketing@gmail.com', 'BWC School Wall + NGO 學校牆身畫 Follow Up', '1209394041932145', 3),
    ('地板工程', 'Franco / Angel', 'brandingworks.build2@gmail.com', 'BWM Floor Client 地板工程跟進 Follow Up', '1161949669746412', 4),
    ('物料工程', 'Franco / Angel', 'brandingworks.build2@gmail.com', 'BWM Material 物料跟進 Order', '1203430623783811', 5),
    ('BW LED', 'Franco / Angel', 'franco.lee@winepassions.com', 'BWT Client Follow Up 科技客戶跟進', '1200995863378351', 6),
    ('清拆還原', 'Franco / Angel', 'franco.lee@winepassions.com', 'BWE Dismantle 清拆工程 Follow Up', '251949160389361', 7),
    ('辦公室設計/傢俬', 'mark', 'cfb.f01@chifung.net', 'BWF Active 1 Retail 散件 傢俬跟進 Furniture', '1113991872677640', 8),
    ('Green Power', 'Franco / Angel', 'hankstai@chifung.cn', '', '', 9),
    ('水務工程', 'Franco / Angel', 'franco.lee@winepassions.com', 'BWE Water 水務工程 跟進 Follow Up', '1200789137852626', 10),
    ('Clean Room', 'Franco / Angel', 'franco.lee@winepassions.com', 'BW Clean Room Factory 無塵空間', '1165462036639016', 11),
    ('工程設計', 'Franco / Angel', 'franco.lee@winepassions.com', 'BWA Active 1 開始緊密跟進中', '1193502500614961', 12),
    ('廚房設備', 'Franco / Angel', 'franco.lee@winepassions.com', 'BWE Cold Room Kitchen 廚房 冷庫 紅酒倉 Follow Up', '873714158015305', 13),
    ('冷氣冷庫工程', 'Franco / Angel', 'franco.lee@winepassions.com', 'BWE Cold Room Kitchen 廚房 冷庫 紅酒倉 Follow Up', '873714158015305', 14),
    ('F&B工程', 'Franco / Angel', 'franco.lee@winepassions.com', 'BW Food Design & Build 開餐廳 Restaurant Follow Up', '37851043327076', 15),
    ('空氣淨化工程', 'Franco / Angel', 'franco.lee@winepassions.com', 'BW Clean Room Factory 無塵空間', '1165462036639016', 16),
    ('Clinic', 'Franco / Angel', 'franco.lee@winepassions.com', 'BW Clinic Medical Centre 醫療中心', '1199647677787163', 17),
    ('Office Design', 'Franco / Angel', 'franco.lee@winepassions.com', 'BW Office Design & Build 辦公室設計工程 Follow Up', '812800924218284', 19),
    ('BWC design', 'BW Marketing', 'brandingworks.marketing@gmail.com', 'BWL Website Design Clients', '1209067264157442', 20),
    ('OTHER', 'Franco / Angel', 'franco.lee@winepassions.com', 'Solar B2C Client HK 香港太陽能工程 Sunlight Panel', '1206824004142179', 21)
) AS seed(keyword, assignee_name, assignee_email, project_name, project_gid, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.bw_asana_mail_routes);
