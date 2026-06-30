-- Vchannel 頻道管理 Phase 1
-- Generated from Excel summary + Login (passwords excluded; enter via UI)

CREATE TABLE IF NOT EXISTS public.vchannels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_code    varchar(10) NOT NULL UNIQUE,
  internal_name   text NOT NULL,
  public_name     text NOT NULL,
  importance      text NOT NULL DEFAULT 'A3'
                  CHECK (importance IN ('A1','A2','A3','A4','A5')),
  device_type     text NOT NULL DEFAULT 'DM'
                  CHECK (device_type IN ('M','D','DM','D_M')),
  brand_code      text NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','paused','archived')),
  platform_status jsonb NOT NULL DEFAULT '{}',
  video_count     integer NOT NULL DEFAULT 0,
  case_count      integer NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vchannel_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vchannel_codes   text[] NOT NULL,
  account_label    text NOT NULL DEFAULT '',
  channel_intro    text,
  platform         text NOT NULL,
  account_id       text,
  account_password text,
  login_method     text,
  operator_code    text,
  feedhive_managed boolean NOT NULL DEFAULT false,
  notes            text,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vchannels_brand ON public.vchannels (brand_code);
CREATE INDEX IF NOT EXISTS idx_vchannels_importance ON public.vchannels (importance);
CREATE INDEX IF NOT EXISTS idx_vchannels_platform ON public.vchannels USING gin (platform_status);
CREATE INDEX IF NOT EXISTS idx_vchannel_accounts_codes ON public.vchannel_accounts USING gin (vchannel_codes);

ALTER TABLE public.vchannels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vchannel_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read vchannels for authenticated"
  ON public.vchannels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert vchannels for authenticated"
  ON public.vchannels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update vchannels for authenticated"
  ON public.vchannels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete vchannels for authenticated"
  ON public.vchannels FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow read vchannel_accounts for authenticated"
  ON public.vchannel_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert vchannel_accounts for authenticated"
  ON public.vchannel_accounts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update vchannel_accounts for authenticated"
  ON public.vchannel_accounts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete vchannel_accounts for authenticated"
  ON public.vchannel_accounts FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select on vchannels"
  ON public.vchannels FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on vchannels"
  ON public.vchannels FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on vchannels"
  ON public.vchannels FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on vchannels"
  ON public.vchannels FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anon select on vchannel_accounts"
  ON public.vchannel_accounts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on vchannel_accounts"
  ON public.vchannel_accounts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on vchannel_accounts"
  ON public.vchannel_accounts FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on vchannel_accounts"
  ON public.vchannel_accounts FOR DELETE TO anon USING (true);

INSERT INTO public.vchannels
  (channel_code, internal_name, public_name, importance, device_type, brand_code, status, platform_status)
VALUES
  ('V01', 'Franco IP 老闆個人', 'Franco 梵高管理新思維', 'A1', 'M', 'Franco', 'active', '{"youtube":{"kind":"unknown","raw_text":"XXX"},"instagram":{"kind":"opened","raw_text":"已有個人帳號"},"facebook":{"kind":"opened","raw_text":"已有個人帳號"},"xiaohongshu":{"kind":"opened","raw_text":"連結已有帳號"},"wechat_channels":{"kind":"opened","raw_text":"已有個人帳號"},"douyin":{"kind":"opened","raw_text":"已有個人帳號"},"threads":{"kind":"unknown","raw_text":"??"},"linkedin":{"kind":"unknown","raw_text":"??"}}'::jsonb),
  ('V02', 'Career Platform 事業平台', '志豐事業平台', 'A3', 'D', 'CFA+CFB', 'active', '{"youtube":{"kind":"url","url":"https://www.youtube.com/@chifungcareer","raw_text":"https://www.youtube.com/@chifungcareer"},"instagram":{"kind":"opened","raw_text":"已開賬號（v02@chifung.net）","operator_hint":"v02@chifung.net"},"facebook":{"kind":"opened","raw_text":"已開賬號（Under cfa.marketing@gmail.com）","operator_hint":"Under cfa.marketing@gmail.com"},"xiaohongshu":{"kind":"opened","raw_text":"20/11 已開賬號（M02工作手機號）","operator_hint":"M02"},"wechat_channels":{"kind":"opened","raw_text":"20/11 已開賬號（M02工作手機號）","operator_hint":"M02"},"douyin":{"kind":"unknown","raw_text":"XXX"},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V03', 'CFA HK Event 香港公司 (不公開)', 'BW Team Event 志豐香港活動', 'A4', 'D_M', 'CFA+CFB', 'active', '{"youtube":{"kind":"opened","raw_text":"cfb.creative"},"instagram":{"kind":"pending","raw_text":""},"facebook":{"kind":"pending","raw_text":""},"xiaohongshu":{"kind":"n/a","raw_text":"-"},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V04', 'CFB SZ Event 深圳公司 (不公開)', 'BW Team Event 志豐深圳活動', 'A4', 'D', 'CFA+CFB', 'active', '{"youtube":{"kind":"opened","raw_text":"cfb.creative"},"instagram":{"kind":"pending","raw_text":""},"facebook":{"kind":"pending","raw_text":""},"xiaohongshu":{"kind":"n/a","raw_text":"-"},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V11', 'BW Office + Furniture 辦公設計 家具', 'BW Office & Furniture 辦公室設計靈感', 'A1', 'DM', 'BWF', 'active', '{"youtube":{"kind":"url","url":"https://www.youtube.com/@bwoffice-furniture","raw_text":"https://www.youtube.com/@bwoffice-furniture"},"instagram":{"kind":"n/a","raw_text":"-"},"facebook":{"kind":"url","url":"https://www.facebook.com/profile.php?id=100063648894972","raw_text":"https://www.facebook.com/profile.php?id=100063648894972"},"xiaohongshu":{"kind":"opened","raw_text":"20/11 已開賬號（F04工作手機號）","operator_hint":"F04"},"wechat_channels":{"kind":"opened","raw_text":"20/11 已開賬號（F04工作手機號）","operator_hint":"F04"},"douyin":{"kind":"opened","raw_text":"20/11 已開賬號（F04工作手機號）","operator_hint":"F04"},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V12', 'BW Design + Build 商業設計工程', 'BW Design 香港好設計', 'A1', 'DM', 'BWA', 'active', '{"youtube":{"kind":"unknown","raw_text":"香港好設計BW Design Centre - YouTube"},"instagram":{"kind":"url","url":"https://www.instagram.com/bw_designcentre/","raw_text":"https://www.instagram.com/bw_designcentre/"},"facebook":{"kind":"url","url":"https://www.facebook.com/brandingworks.interiors/","raw_text":"https://www.facebook.com/brandingworks.interiors/"},"xiaohongshu":{"kind":"opened","raw_text":"已有帳號（69965077) 志丰设计工程中心","operator_hint":"69965077"},"wechat_channels":{"kind":"opened","raw_text":"已開帳號（D01工作微信） 香港好設計","operator_hint":"D01工作微信"},"douyin":{"kind":"opened","raw_text":"已開帳號（13544242039) 香港好設計BWDesignCentre","operator_hint":"13544242039"},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V13', 'BW Project Connect 招標平台', '香港商業工程招標易 Project Connect', 'A2', 'D', 'BWA', 'active', '{"youtube":{"kind":"url","url":"https://www.youtube.com/channel/UCQuwrWdqqqXINrdWMBU2V3A","raw_text":"https://www.youtube.com/channel/UCQuwrWdqqqXINrdWMBU2V3A"},"instagram":{"kind":"url","url":"https://www.instagram.com/hk.projectconnect/","raw_text":"https://www.instagram.com/hk.projectconnect/"},"facebook":{"kind":"url","url":"https://www.facebook.com/profile.php?id=61585753581604","raw_text":"https://www.facebook.com/profile.php?id=61585753581604"},"xiaohongshu":{"kind":"pending","raw_text":""},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V14', 'BW Branding Portal 品牌雜誌', '香港商業週刊 HK Business Weekly', 'A2', 'DM', 'BWL', 'active', '{"youtube":{"kind":"url","url":"https://cfb.creative Y https://www.youtube.com/channel/UCWN4oYtKh5g1C0mEIsLVTgQ","raw_text":"cfb.creative Y https://www.youtube.com/channel/UCWN4oYtKh5g1C0mEIsLVTgQ"},"instagram":{"kind":"opened","raw_text":"Y"},"facebook":{"kind":"opened","raw_text":"Y"},"xiaohongshu":{"kind":"opened","raw_text":"Y"},"wechat_channels":{"kind":"opened","raw_text":"Y"},"douyin":{"kind":"opened","raw_text":"Y"},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V15', 'Branding Design 品牌設計', '品牌升級轉型 Brand Upgrade', 'A2', 'DM', 'BWL', 'active', '{"youtube":{"kind":"url","url":"https://www.youtube.com/@hkbrandingdesign","raw_text":"https://www.youtube.com/@hkbrandingdesign"},"instagram":{"kind":"pending","raw_text":""},"facebook":{"kind":"pending","raw_text":""},"xiaohongshu":{"kind":"pending","raw_text":""},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V16', 'BW Green Power 太陽能', 'BW Green Power 香港新能源', 'A3', 'DM', 'BWE', 'active', '{"youtube":{"kind":"url","url":"https://www.youtube.com/@bwgreenpower","raw_text":"https://www.youtube.com/@bwgreenpower"},"instagram":{"kind":"n/a","raw_text":"-"},"facebook":{"kind":"n/a","raw_text":"-"},"xiaohongshu":{"kind":"n/a","raw_text":"-"},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V17', 'BW Material 新材料', 'BW Material 香港新材料', 'A4', 'DM', 'BWA', 'active', '{"youtube":{"kind":"url","url":"https://www.youtube.com/@BWMaterial","raw_text":"https://www.youtube.com/@BWMaterial"},"instagram":{"kind":"pending","raw_text":""},"facebook":{"kind":"pending","raw_text":""},"xiaohongshu":{"kind":"n/a","raw_text":"-"},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V18', 'Success Story 成功故事', '成功有故事', 'A1', 'M', 'CFA+CFB', 'active', '{"youtube":{"kind":"opened","raw_text":"M"},"instagram":{"kind":"opened","raw_text":"M"},"facebook":{"kind":"opened","raw_text":"M"},"xiaohongshu":{"kind":"opened","raw_text":"M"},"wechat_channels":{"kind":"opened","raw_text":"M"},"douyin":{"kind":"opened","raw_text":"M"},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V19', 'BW Gifts 企業禮品', 'BW GIfts 企業好禮品', 'A2', 'DM', 'BWL', 'active', '{"youtube":{"kind":"pending","raw_text":""},"instagram":{"kind":"pending","raw_text":""},"facebook":{"kind":"pending","raw_text":""},"xiaohongshu":{"kind":"pending","raw_text":""},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V21', 'FC Shop 桂花小幸', 'Cafe BBC 桂花小幸 - 將軍澳 元朗', 'A2', 'M', 'FC Shop', 'active', '{"youtube":{"kind":"url","url":"https://www.youtube.com/@bbccafe7180","raw_text":"https://www.youtube.com/@bbccafe7180"},"instagram":{"kind":"url","url":"https://元朗: https://www.instagram.com/cafebbc.ylp/ 將軍澳: https://www.instagram.com/cafebbc_tko/","raw_text":"元朗: https://www.instagram.com/cafebbc.ylp/ 將軍澳: https://www.instagram.com/cafebbc_tko/"},"facebook":{"kind":"url","url":"https://元朗: https://www.facebook.com/cafebbc/ 將軍澳: https://www.facebook.com/lifestyle.bbc/","raw_text":"元朗: https://www.facebook.com/cafebbc/ 將軍澳: https://www.facebook.com/lifestyle.bbc/"},"xiaohongshu":{"kind":"pending","raw_text":""},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V22', 'FCC Catering 到會', 'FC Catering 香港美食到會', 'A2', 'M', 'FC Catering', 'active', '{"youtube":{"kind":"url","url":"https://www.youtube.com/@foodchannelscatering9114","raw_text":"https://www.youtube.com/@foodchannelscatering9114"},"instagram":{"kind":"unknown","raw_text":"中西式外賣套餐｜ (@foodchannels.catering) • Instagram photos and videos"},"facebook":{"kind":"unknown","raw_text":"Food Channels Catering - 香港人氣派對到會中心"},"xiaohongshu":{"kind":"n/a","raw_text":"-"},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V31', 'Wine Shop B2C 賣酒', 'Wine Passions 買頂級葡萄酒', 'A2', 'DM', 'Wine', 'active', '{"youtube":{"kind":"unknown","raw_text":"Wine Passions 亞洲葡萄酒庫- 頂級酒莊聯盟- YouTube"},"instagram":{"kind":"unknown","raw_text":"亞洲葡萄酒庫Wine Passions (@winepassions)"},"facebook":{"kind":"url","url":"https://www.facebook.com/winepassions.shop","raw_text":"https://www.facebook.com/winepassions.shop"},"xiaohongshu":{"kind":"n/a","raw_text":"-"},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V32', 'Wine Tasting B2B 商業酒會', 'Business Wine Tasting 香港商業酒會活動', 'A3', 'DM', 'Wine', 'active', '{"youtube":{"kind":"url","url":"https://www.youtube.com/@BusinessWineTasting","raw_text":"www.youtube.com/@BusinessWineTasting"},"instagram":{"kind":"url","url":"https://www.instagram.com/hkwinetasting/","raw_text":"https://www.instagram.com/hkwinetasting/"},"facebook":{"kind":"url","url":"https://www.facebook.com/winecollege/","raw_text":"https://www.facebook.com/winecollege/"},"xiaohongshu":{"kind":"n/a","raw_text":"-"},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V33', 'Wine Magazine Portal 酒雜誌', 'Wine Passions Magazine 世界美酒雜誌 • 全球甄選', 'A1', 'DM', 'Wine', 'active', '{"youtube":{"kind":"url","url":"https://Y www.youtube.com/@WinePassionsMagazine","raw_text":"Y www.youtube.com/@WinePassionsMagazine"},"instagram":{"kind":"opened","raw_text":"yes"},"facebook":{"kind":"opened","raw_text":"yes"},"xiaohongshu":{"kind":"opened","raw_text":"Y"},"wechat_channels":{"kind":"opened","raw_text":"Y"},"douyin":{"kind":"opened","raw_text":"Y"},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V34', 'Wine Partner KOL 夥伴拍片', 'Wine Passions 新酒介紹', 'A3', 'M', 'Wine', 'active', '{"youtube":{"kind":"pending","raw_text":""},"instagram":{"kind":"pending","raw_text":""},"facebook":{"kind":"pending","raw_text":""},"xiaohongshu":{"kind":"n/a","raw_text":"-"},"wechat_channels":{"kind":"pending","raw_text":""},"douyin":{"kind":"pending","raw_text":""},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V41', 'Health + Beauty Portal 健康 美容雜誌', 'Beauty100 Magazine 亞洲美容健康雜誌', 'A1', 'DM', 'BWL', 'active', '{"youtube":{"kind":"pending","raw_text":""},"instagram":{"kind":"opened","raw_text":"Y"},"facebook":{"kind":"opened","raw_text":"Y"},"xiaohongshu":{"kind":"n/a","raw_text":"-"},"wechat_channels":{"kind":"n/a","raw_text":"-"},"douyin":{"kind":"n/a","raw_text":"-"},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb),
  ('V42', 'Beauty Services 醫美服務', 'Victoria Beauty 維多利亞好時光', 'A1', 'DM', 'BSC Beauty', 'active', '{"youtube":{"kind":"url","url":"https://Y https://www.youtube.com/channel/UCcTqrCTyAAO0EaQWJOTeLvw","raw_text":"Y https://www.youtube.com/channel/UCcTqrCTyAAO0EaQWJOTeLvw"},"instagram":{"kind":"opened","raw_text":"Y"},"facebook":{"kind":"opened","raw_text":"Y"},"xiaohongshu":{"kind":"opened","raw_text":"Y"},"wechat_channels":{"kind":"opened","raw_text":"Y"},"douyin":{"kind":"opened","raw_text":"Y"},"threads":{"kind":"pending","raw_text":""},"linkedin":{"kind":"pending","raw_text":""}}'::jsonb)
ON CONFLICT (channel_code) DO NOTHING;

INSERT INTO public.vchannel_accounts
  (vchannel_codes, account_label, platform, account_id, account_password, login_method, operator_code, feedhive_managed, notes, sort_order)
VALUES
  (ARRAY['V01'], 'Franco梵高管理新思維', 'Instagram', 'login: franco.think', NULL, NULL, NULL, false, '已註冊新賬號，feedhive統一管理（需升級套餐添加賬號）', 1),
  (ARRAY['V01'], 'Franco梵高管理新思維', 'Facebook', NULL, NULL, NULL, NULL, false, '已註冊新賬號，待開專頁；feedhive統一管理（需升級套餐添加賬號）', 2),
  (ARRAY['V01'], 'Franco梵高管理新思維', 'YouTube', '/', NULL, NULL, NULL, false, '【設計新思維】有賬號，已綁定運營者管理', 3),
  (ARRAY['V01'], 'Franco梵高管理新思維', '小紅書', NULL, NULL, NULL, NULL, false, '已註冊新賬號，已綁定運營者管理', 4),
  (ARRAY['V01'], 'Franco梵高管理新思維', 'WeChat視頻號', NULL, NULL, NULL, NULL, false, '有賬號，需掃碼登入（運營者工作手機/電腦端登入）', 5),
  (ARRAY['V01'], 'Franco梵高管理新思維', '抖音號', NULL, NULL, NULL, NULL, false, '已註冊賬號，限定手機登入（已認證登入）', 6),
  (ARRAY['V02'], 'BWCareer志豐事業平台', 'Instagram', NULL, NULL, NULL, NULL, true, '已註冊新賬號，feedhive統一管理（需升級套餐添加賬號）', 10),
  (ARRAY['V02'], 'BWCareer志豐事業平台', 'Facebook', NULL, NULL, NULL, NULL, true, '已註冊新賬號，待開專頁；feedhive統一管理（需升級套餐添加賬號）', 11),
  (ARRAY['V02'], 'BWCareer志豐事業平台', 'YouTube', NULL, NULL, NULL, NULL, false, '【設計新思維】有賬號，已綁定運營者管理', 12),
  (ARRAY['V11'], '香港好設計', 'IG', 'bw_designcentre', NULL, 'feedhive統一管理', NULL, true, '有賬號，已由feedhive統一管理', 20),
  (ARRAY['V11'], '香港好設計', 'Facebook', '/', NULL, 'feedhive統一管理', NULL, true, '有賬號，已由feedhive統一管理', 21),
  (ARRAY['V11'], '香港好設計', '微信視頻號', 'Fover2024-more', NULL, '運營者微信掃碼', NULL, false, '由"志豐設計工程"視頻號統一發佈，已綁定運營者管理', 22),
  (ARRAY['V11'], '香港好傢私', 'IG', 'cfb_m03', NULL, 'cfb.m03@chifung.net', NULL, true, '已註冊新賬號，feedhive統一管理（需升級套餐添加賬號）', 23),
  (ARRAY['V11'], '香港好傢私', 'Facebook', 'cfb_m03', NULL, 'cfb.m03@chifung.net', NULL, true, '已註冊新賬號，待開專頁；feedhive統一管理（需升級套餐添加賬號）', 24),
  (ARRAY['V12', 'V14'], 'BW Branding Design', 'IG', 'cfb_m04', NULL, 'cfb.m04@chifung.net', NULL, true, '已註冊新賬號，feedhive統一管理（需升級套餐添加賬號）', 30),
  (ARRAY['V12', 'V14'], 'BW Branding Design', 'Facebook', 'cfb_m04', NULL, 'cfb.m04@chifung.net', NULL, true, '已註冊新賬號，待開專頁；feedhive統一管理（需升級套餐添加賬號）', 31),
  (ARRAY['V12', 'V14'], 'BW Branding Design', '微信視頻號', 'sphH5cnAJsyHbyr', NULL, '微信ID：CFB-M04掃碼', 'M04', false, '已註冊新賬號，已綁定運營者管理', 32),
  (ARRAY['V13'], 'Project Connect 設計工程報價易', 'IG', 'cfb_m10', NULL, 'cfb.m10@chifung.net', 'M10', true, '已註冊新賬號，feedhive統一管理（需升級套餐添加賬號）', 40),
  (ARRAY['V13'], 'Project Connect 設計工程報價易', 'Facebook', 'cfb_m10', NULL, 'cfb.m10@chifung.net', 'M10', true, '已註冊新賬號，待開專頁；feedhive統一管理（需升級套餐添加賬號）', 41),
  (ARRAY['V13'], 'Project Connect 設計工程報價易', '微信視頻號', 'shpKh1YcDxkyi6W', NULL, '微信ID：CFB-M10掃碼', 'M10', false, '已註冊新賬號，已綁定運營者管理', 42);
