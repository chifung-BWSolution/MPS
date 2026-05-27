-- ============================================================
-- 網站+系統列表 (webandsystem_list)
-- Stores all website and system profiles managed in the MPS platform
-- ============================================================

CREATE TABLE IF NOT EXISTS public.webandsystem_list (
  id              text PRIMARY KEY,
  website_name    text NOT NULL,
  domain_url      text,
  profile_type    text NOT NULL DEFAULT 'website',   -- 類型: website | system
  project_category text NOT NULL DEFAULT 'internal', -- 項目類型: internal | client
  level           integer NOT NULL DEFAULT 3,         -- LEVEL: 1-5
  platform        text,                               -- 平台: framer | wordpress | shopify | etc.
  brand           text,                               -- 品牌: BW | WP | FC | CFG | etc.
  company         text,                               -- 公司: BWD | ZF | etc.
  status          text NOT NULL DEFAULT 'live',       -- 公司狀態: live | development | maintenance | archived
  articles_count  integer NOT NULL DEFAULT 0,         -- 文章
  videos_count    integer NOT NULL DEFAULT 0,         -- 影片
  total_hours     integer NOT NULL DEFAULT 0,         -- 工時
  project_id      text,
  company_id      text,
  brand_id        text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS: allow all authenticated users to read; only service role can write
ALTER TABLE public.webandsystem_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.webandsystem_list FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all for service role"
  ON public.webandsystem_list FOR ALL
  TO service_role
  USING (true);

-- ============================================================
-- Seed: 76 website profiles
-- ============================================================

INSERT INTO public.webandsystem_list
  (id, website_name, domain_url, profile_type, project_category, level, platform, brand, company, status, articles_count, videos_count, total_hours, project_id, company_id, brand_id, notes)
VALUES
  -- ===== BW Brand (b1) - BWD Company (c1) - Internal =====
  ('ws1',  'BW Interior 志豐設計工程',                  'https://www.bwteam.com/',                    'website', 'internal', 1, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '志豐設計工程主站'),
  ('ws2',  'Office Design 辦公室設計工程',               'https://hkofficedesign.com/',                 'website', 'internal', 2, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '辦公室設計工程專站'),
  ('ws3',  'BW Office Interiors Design',                'https://brandingworks.com.hk/',               'website', 'internal', 2, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', 'BW Office Interiors Design 品牌站'),
  ('ws4',  'Commercial Interiors 商業設計工程',           'https://brandingworks360.com/',               'website', 'internal', 2, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '商業設計工程專站'),
  ('ws5',  'Restaurant Design 餐廳裝修設計',             'https://brandingworks-design.com/',           'website', 'internal', 2, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '餐廳裝修設計專站'),
  ('ws6',  'F&B Kitchen Center 廚房及通風設備中心',       'https://food-kitchen.com/',                   'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '廚房及通風設備中心'),
  ('ws7',  'BW Furniture 辦公室傢俬',                   'https://brandingworks-furniture.com/',        'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '辦公室傢俬專站'),
  ('ws8',  'BW Office 辦公室傢俬設計',                  'https://brandingworks-office.com/',           'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '辦公室傢俬設計'),
  ('ws9',  'HK Design Home 香港家訂造傢俬中心',          'http://www.hkfurnitures.com/',                'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港家訂造傢俬中心'),
  ('ws10', 'Commercial Cold Room 商業冷氣工程',          'https://brandingworks-air.com/',              'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '商業冷氣工程專站'),
  ('ws11', 'Branding 品牌設計',                         'http://www.brandingworks-creative.com/',      'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '品牌設計專站'),
  ('ws12', 'Wall Design and Build 牆身設計工程',         'https://wallcreative.com/',                   'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '牆身設計工程'),
  ('ws13', 'HK Wall Design 香港牆身設計及工程中心',       'https://hkwalldesign.com/',                   'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港牆身設計及工程中心'),
  ('ws14', 'HK Air Clean 香港空氣淨化工程',              'https://www.hkairclean.com/',                 'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港空氣淨化工程'),
  ('ws15', 'BW Furniture 香港商業傢私設計工程中心',       'https://bwfurnitures.com/',                   'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港商業傢私設計工程中心'),
  ('ws16', 'BW Plan 樓層主題規劃及設計工程',             'https://bwplan.com/',                         'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '樓層主題規劃及設計工程'),
  ('ws17', 'HK Pet Design 香港寵物設計工程',             'https://hkpetdesign.com/',                    'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港寵物設計工程'),
  ('ws18', 'HK Web Design 香港品牌及網頁設計情報',        'https://hkwebdesign.com/',                    'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港品牌及網頁設計情報'),
  ('ws19', 'BW System 中小企業系統開發中心',             'https://bwsystem.ai/',                        'website', 'internal', 2, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '中小企業系統開發中心'),
  ('ws20', 'BW Solution 香港品牌設計中心',               'https://bwsolution.com/',                     'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港品牌設計中心'),
  ('ws21', 'HK Garden Design 香港園藝設計工程',          'https://hkgardendesign.com/',                 'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港園藝設計工程'),
  ('ws22', 'BW Event 360 專業活動策劃',                 'https://www.bwevent360.com/',                 'website', 'internal', 2, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '專業活動策劃'),
  ('ws23', 'BW Beauty Interiors 美妝店設計工程',         'https://brandingworks-beauty.com/',           'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '美妝店設計工程'),
  ('ws24', 'BW Clinic Interiors 診所設計工程',           'https://brandingworks-clinic.com/',           'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '診所設計工程'),
  ('ws25', 'BW Retail Interiors 零售店設計工程',         'https://brandingworks-retail.com/',           'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '零售店設計工程'),
  ('ws26', 'BW Fashion Interiors 時裝店設計工程',        'https://brandingworks-fashion.com/',          'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '時裝店設計工程'),
  ('ws27', 'Dismantle 360 清拆工程',                    'https://dismantle360.com/',                   'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '清拆工程專站'),
  ('ws28', 'BW Material 志豐工程及創新建材',             'https://bwmaterial.com/',                     'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '志豐工程及創新建材'),
  ('ws29', 'BW Networks Design 商業科技系統中心',        'https://www.brandingworks-network.com/',      'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '商業科技系統中心'),
  ('ws30', 'HK Care Home Design 安老院舍工程',           'https://www.brandingworks-carehome.com/',     'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '安老院舍工程'),
  ('ws31', 'BW Hotel 香港酒店設計工程',                  'https://brandingworks-hotel.com/',            'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港酒店設計工程'),
  ('ws32', 'School Design and Build 學校工程及設計中心', 'https://brandingworks-school.com/',           'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '學校工程及設計中心'),
  ('ws33', 'Clean Room Design and Build 無塵空間工程',  'http://www.cleanroom.com.hk/',                'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '無塵空間工程'),
  ('ws34', 'Floor Design and Build 地板設計工程',        'https://brandingworks-floor.com/',            'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '地板設計工程'),
  ('ws35', 'HK Waterpipe Centre 商業水務工程',           'https://hkwaterpipe.com/',                    'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '商業水務工程'),
  ('ws36', 'Science Park Office Design 香港創科辦公室設計', 'https://sciencepark-office.com/',          'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港創科辦公室設計'),
  ('ws37', 'BW Green Power 太陽能光伏發電系統工程',       'https://bwgreenpower.com/',                   'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '太陽能光伏發電系統工程'),
  ('ws38', 'BW Display 商業LED 顯示屏工程',              'https://bwdisplays.com/',                     'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '商業LED 顯示屏工程'),
  ('ws39', 'BW Club House 私人會所設計工程',             'https://bwclubhouse.com/',                    'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '私人會所設計工程'),
  ('ws40', 'BW Design Macau 澳門商業設計工程',           'https://bwdesign-macau.com/',                 'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '澳門商業設計工程'),
  ('ws41', 'BW Project Connect 設計裝修工程報價易',      'https://project-connect.net/',                'website', 'internal', 3, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '設計裝修工程報價易'),
  ('ws42', 'BW Design Community 香港社區設計工程',       'https://bwdesign-community.com/',             'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '香港社區設計工程'),
  ('ws43', 'BW Design Airport 機場商業設計工程',         'https://bwdesign-airport.com/',               'website', 'internal', 4, 'framer', 'BW',  'BWD', 'live', 0, 0, 0, 'p1', 'c1', 'b1', '機場商業設計工程'),

  -- ===== Wine Passions Brand (b7) - ZF Company (c2) =====
  ('ws44', 'Wine Passions',                             'https://winepassions.com/',                   'website', 'internal', 1, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', 'Wine Passions 主站'),
  ('ws45', 'Wine Tasting 品酒會',                       'https://www.winepassions-italy.com/',         'website', 'internal', 2, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '品酒會活動站'),
  ('ws46', 'HK International Wine College 香港品酒培訓學院', 'http://www.hkwinetasting.com/',           'website', 'internal', 2, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '品酒培訓學院'),
  ('ws47', 'HK Wine Festival 品酒音樂文化節',            'https://hkwinefestival.com/',                 'website', 'internal', 2, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '品酒音樂文化節'),
  ('ws48', 'Fine Wine Asia 世界名莊酒',                  'https://finewineasia.com/',                   'website', 'internal', 2, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '世界名莊酒專站'),
  ('ws49', 'Barolo 意大利酒王 巴羅洛',                   'https://winepassions-barolo.com/',            'website', 'internal', 3, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '巴羅洛酒款專站'),
  ('ws50', 'Wine Passions Shop',                        'https://winepassions-shop.com/',              'website', 'internal', 2, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '葡萄酒網上商店'),
  ('ws51', 'Sante Passioni Wines',                      'https://santepassioni.com/',                  'website', 'internal', 3, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', 'Sante Passioni 酒品品牌站'),
  ('ws52', 'Wedding Wine 婚宴葡萄酒',                   'https://www.hkweddingwine.com/',              'website', 'internal', 3, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '婚宴葡萄酒服務'),
  ('ws53', 'Wine Partner Club 葡萄酒夥伴計劃',           'https://www.winepassions-partner.com/',       'website', 'internal', 3, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '葡萄酒夥伴計劃'),
  ('ws54', 'Wine Sourcing 紅酒批發',                    'http://www.winepassions-sourcing.com/',       'website', 'internal', 3, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '紅酒批發業務'),
  ('ws55', 'World Wine Times 品酒新聞網',                'http://www.winecollege.org/',                 'website', 'internal', 3, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '品酒新聞媒體'),
  ('ws56', 'Wine Awards Asia 亞洲葡萄酒大獎賽',          'https://www.wineawards-asia.com/',            'website', 'internal', 2, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '亞洲葡萄酒大獎賽'),
  ('ws57', 'Wine Magazine 世界美酒雜誌 • 全球甄選',      'https://wine-magazine.com/',                  'website', 'internal', 2, 'framer', 'WP',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b7', '世界美酒雜誌'),

  -- ===== Food Channels Brand (b8) - ZF Company (c2) =====
  ('ws58', 'Food Channels 開餐廳',                      'https://www.food-channels.com/',              'website', 'internal', 1, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', 'Food Channels 開餐廳主站'),
  ('ws59', 'Food Channels Catering 美食外賣到會',        'https://foodchannels-catering.com/',          'website', 'internal', 2, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '美食外賣到會'),
  ('ws60', 'Food Channels Express 即日美食到會',         'https://www.foodchannels-express.com/',       'website', 'internal', 2, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '即日美食到會'),
  ('ws61', 'Food Channels Kitchen 桂花．八月',           'https://foodchannels-kitchen.com/',           'website', 'internal', 2, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '桂花．八月餐廳'),
  ('ws62', 'Food Channels Cuisine 福滿樓',               'https://www.foodchannels-cuisine.com/',       'website', 'internal', 2, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '福滿樓餐廳站'),
  ('ws63', 'Food Channels Delivery',                    'https://www.hkfoodcatering.com/',             'website', 'internal', 3, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '外送服務站'),
  ('ws64', 'Food Channels Consulting 開餐廳顧問',        'https://foodchannels-consulting.com/',        'website', 'internal', 2, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '開餐廳顧問服務'),
  ('ws65', 'Food Channels Solution 餐牌醬料研發',        'http://foodchannels-solution.com/',           'website', 'internal', 3, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '餐牌醬料研發'),
  ('ws66', 'Food Channels Drinks 開飲品店',              'http://www.foodchannels-drink.com/',          'website', 'internal', 3, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '開飲品店服務'),
  ('ws67', 'Food Channels Bloggers 美食博客',            'https://www.foodbloggers.com.hk/',            'website', 'internal', 3, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '美食博客平台'),
  ('ws68', 'Cafe B+BC 桂花小幸',                        'http://www.cafebbc.com/',                     'website', 'internal', 3, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '桂花小幸咖啡店'),
  ('ws69', 'Cafe Mikoo 四季良晨',                       'http://www.cafemikoo.com/',                   'website', 'internal', 3, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '四季良晨咖啡店'),
  ('ws70', 'Tea Mikoo 四季良晨茶飲',                    'https://teamikoo.com/',                       'website', 'internal', 3, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '四季良晨茶飲'),
  ('ws71', 'HK Lunch Box 香港商業飯盒',                 'https://hklunchbox.com/',                     'website', 'internal', 3, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '商業飯盒服務'),
  ('ws72', 'HK Party Food 香港派對到會',                'https://www.hkpartyfood.com/',                'website', 'internal', 3, 'framer', 'FC',  'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b8', '派對到會服務'),

  -- ===== ChiFung Group Brand (b9) - ZF Company (c2) =====
  ('ws73', 'ChiFung Group 志豐集團',                    'https://www.chifung-asia.com/',               'website', 'internal', 1, 'framer', 'CFG', 'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b9', '志豐集團主站'),
  ('ws74', 'Artdimensions 維度文化創意設計工程',          'https://artdimensions.asia/',                 'website', 'internal', 2, 'framer', 'CFG', 'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b9', '維度文化創意設計工程'),
  ('ws75', 'HK Immigrations Centre 海外移民',            'https://www.hkimmigrations.com/',             'website', 'internal', 2, 'framer', 'CFG', 'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b9', '海外移民服務'),
  ('ws76', 'ChiFung Health',                            'https://www.chifung-health.com/',             'website', 'internal', 3, 'framer', 'CFG', 'ZF',  'live', 0, 0, 0, 'p3', 'c2', 'b9', '志豐健康')
ON CONFLICT (id) DO NOTHING;
