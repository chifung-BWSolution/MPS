-- One row per EmailMeForm subject that the existing keywords do not already catch.
-- Assignee and project stay empty until someone chooses them. Those rows do not open tasks.

UPDATE public.bw_asana_mail_routes
SET keyword = 'BWC Design'
WHERE keyword = 'BWC design';

INSERT INTO public.bw_asana_mail_routes (keyword, assignee_name, assignee_email, project_name, project_gid, enabled, sort_order)
SELECT seed.keyword, '', '', '', '', true, seed.sort_order
FROM (
  VALUES
    ('學校工程 School工程查詢', 22),
    ('安老院舍工程設計', 23),
    ('酒店工程設計', 24),
    ('網絡工程設計', 25),
    ('工程查詢', 26),
    ('美容院 Beauty工程查詢', 27),
    ('住宅 Home工程查詢', 28),
    ('宗教團體 Religious工程查詢', 29),
    ('大樓工程 Building工程查詢', 30),
    ('共享空間 Coworking工程查詢', 31),
    ('實驗室 Lab工程查詢', 32),
    ('廁所 / 洗手間 Toilet工程查詢', 33),
    ('Garden Design', 34),
    ('零售品牌 Retail工程查詢', 35),
    ('商業展覽工程 Expo工程查詢', 36),
    ('社區美化 Makeup工程查詢', 37),
    ('社區藥房 Pharmacy工程查詢', 38),
    ('商業及私人派對服務', 39),
    ('BWL活動策劃', 40),
    ('BWL System', 41),
    ('Event Talents', 42),
    ('BW Gifts禮品查詢', 43),
    ('Art Dimensions', 44),
    ('CCA', 45),
    ('BWC品牌推廣', 46),
    ('寫字樓', 47),
    ('Other', 50)
) AS seed(keyword, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.bw_asana_mail_routes existing
  WHERE existing.keyword = seed.keyword
);
