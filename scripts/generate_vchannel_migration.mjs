import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parsePlatformStatus(raw) {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'pending', raw_text: '' };
  if (text === '-' || text === '—') return { kind: 'n/a', raw_text: text };
  if (text === 'XXX' || text === '??') return { kind: 'unknown', raw_text: text };
  const urlLike = /^https?:\/\//i.test(text) || /^www\./i.test(text) ||
    /youtube\.com|facebook\.com|instagram\.com|youtu\.be/i.test(text);
  if (urlLike) {
    const url = text.startsWith('http') ? text : `https://${text.replace(/^\/\//, '')}`;
    return { kind: 'url', url, raw_text: text };
  }
  if (/^Y$|^yes$/i.test(text)) return { kind: 'opened', raw_text: text };
  if (/^M$/i.test(text) && text.length === 1) return { kind: 'opened', raw_text: text };
  if (/已開|已有|已註冊|已绑定|已綁定|连結|連結|開賬|開帳|開通|profile\.php/i.test(text)) {
    const paren = text.match(/[（(]([^）)]+)[）)]/);
    const operator = text.match(/\b[MF]\d{2}\b/)?.[0] ?? paren?.[1];
    return { kind: 'opened', raw_text: text, ...(operator ? { operator_hint: operator } : {}) };
  }
  if (/^cfb\.creative$/i.test(text)) return { kind: 'opened', raw_text: text };
  return { kind: 'unknown', raw_text: text };
}

function buildPlatformStatus(row) {
  const keys = {
    youtube: row.youtube,
    instagram: row.ig,
    facebook: row.fb,
    xiaohongshu: row.xhs,
    wechat_channels: row.wechat,
    douyin: row.douyin,
    threads: row.threads,
    linkedin: row.linkedin,
  };
  const out = {};
  for (const [k, v] of Object.entries(keys)) out[k] = parsePlatformStatus(v);
  return out;
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function sqlJson(obj) {
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

const channels = [
  { code: 'V01', internal: 'Franco IP 老闆個人', public: 'Franco 梵高管理新思維', imp: 'A1', dm: 'M', brand: 'Franco', youtube: 'XXX', ig: '已有個人帳號', fb: '已有個人帳號', xhs: '連結已有帳號', wechat: '已有個人帳號', douyin: '已有個人帳號', threads: '??', linkedin: '??' },
  { code: 'V02', internal: 'Career Platform 事業平台', public: '志豐事業平台', imp: 'A3', dm: 'D', brand: 'CFA+CFB', youtube: 'https://www.youtube.com/@chifungcareer', ig: '已開賬號（v02@chifung.net）', fb: '已開賬號（Under cfa.marketing@gmail.com）', xhs: '20/11 已開賬號（M02工作手機號）', wechat: '20/11 已開賬號（M02工作手機號）', douyin: 'XXX', threads: '', linkedin: '' },
  { code: 'V03', internal: 'CFA HK Event 香港公司 (不公開)', public: 'BW Team Event 志豐香港活動', imp: 'A4', dm: 'D_M', brand: 'CFA+CFB', youtube: 'cfb.creative', ig: '', fb: '', xhs: '-', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V04', internal: 'CFB SZ Event 深圳公司 (不公開)', public: 'BW Team Event 志豐深圳活動', imp: 'A4', dm: 'D', brand: 'CFA+CFB', youtube: 'cfb.creative', ig: '', fb: '', xhs: '-', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V11', internal: 'BW Office + Furniture 辦公設計 家具', public: 'BW Office & Furniture 辦公室設計靈感', imp: 'A1', dm: 'DM', brand: 'BWF', youtube: 'https://www.youtube.com/@bwoffice-furniture', ig: '-', fb: 'https://www.facebook.com/profile.php?id=100063648894972', xhs: '20/11 已開賬號（F04工作手機號）', wechat: '20/11 已開賬號（F04工作手機號）', douyin: '20/11 已開賬號（F04工作手機號）', threads: '', linkedin: '' },
  { code: 'V12', internal: 'BW Design + Build 商業設計工程', public: 'BW Design 香港好設計', imp: 'A1', dm: 'DM', brand: 'BWA', youtube: '香港好設計BW Design Centre - YouTube', ig: 'https://www.instagram.com/bw_designcentre/', fb: 'https://www.facebook.com/brandingworks.interiors/', xhs: '已有帳號（69965077) 志丰设计工程中心', wechat: '已開帳號（D01工作微信） 香港好設計', douyin: '已開帳號（13544242039) 香港好設計BWDesignCentre', threads: '', linkedin: '' },
  { code: 'V13', internal: 'BW Project Connect 招標平台', public: '香港商業工程招標易 Project Connect', imp: 'A2', dm: 'D', brand: 'BWA', youtube: 'https://www.youtube.com/channel/UCQuwrWdqqqXINrdWMBU2V3A', ig: 'https://www.instagram.com/hk.projectconnect/', fb: 'https://www.facebook.com/profile.php?id=61585753581604', xhs: '', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V14', internal: 'BW Branding Portal 品牌雜誌', public: '香港商業週刊 HK Business Weekly', imp: 'A2', dm: 'DM', brand: 'BWL', youtube: 'cfb.creative Y https://www.youtube.com/channel/UCWN4oYtKh5g1C0mEIsLVTgQ', ig: 'Y', fb: 'Y', xhs: 'Y', wechat: 'Y', douyin: 'Y', threads: '', linkedin: '' },
  { code: 'V15', internal: 'Branding Design 品牌設計', public: '品牌升級轉型 Brand Upgrade', imp: 'A2', dm: 'DM', brand: 'BWL', youtube: 'https://www.youtube.com/@hkbrandingdesign', ig: '', fb: '', xhs: '', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V16', internal: 'BW Green Power 太陽能', public: 'BW Green Power 香港新能源', imp: 'A3', dm: 'DM', brand: 'BWE', youtube: 'https://www.youtube.com/@bwgreenpower', ig: '-', fb: '-', xhs: '-', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V17', internal: 'BW Material 新材料', public: 'BW Material 香港新材料', imp: 'A4', dm: 'DM', brand: 'BWA', youtube: 'https://www.youtube.com/@BWMaterial', ig: '', fb: '', xhs: '-', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V18', internal: 'Success Story 成功故事', public: '成功有故事', imp: 'A1', dm: 'M', brand: 'CFA+CFB', youtube: 'M', ig: 'M', fb: 'M', xhs: 'M', wechat: 'M', douyin: 'M', threads: '', linkedin: '' },
  { code: 'V19', internal: 'BW Gifts 企業禮品', public: 'BW GIfts 企業好禮品', imp: 'A2', dm: 'DM', brand: 'BWL', youtube: '', ig: '', fb: '', xhs: '', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V21', internal: 'FC Shop 桂花小幸', public: 'Cafe BBC 桂花小幸 - 將軍澳 元朗', imp: 'A2', dm: 'M', brand: 'FC Shop', youtube: 'https://www.youtube.com/@bbccafe7180', ig: '元朗: https://www.instagram.com/cafebbc.ylp/ 將軍澳: https://www.instagram.com/cafebbc_tko/', fb: '元朗: https://www.facebook.com/cafebbc/ 將軍澳: https://www.facebook.com/lifestyle.bbc/', xhs: '', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V22', internal: 'FCC Catering 到會', public: 'FC Catering 香港美食到會', imp: 'A2', dm: 'M', brand: 'FC Catering', youtube: 'https://www.youtube.com/@foodchannelscatering9114', ig: '中西式外賣套餐｜ (@foodchannels.catering) • Instagram photos and videos', fb: 'Food Channels Catering - 香港人氣派對到會中心', xhs: '-', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V31', internal: 'Wine Shop B2C 賣酒', public: 'Wine Passions 買頂級葡萄酒', imp: 'A2', dm: 'DM', brand: 'Wine', youtube: 'Wine Passions 亞洲葡萄酒庫- 頂級酒莊聯盟- YouTube', ig: '亞洲葡萄酒庫Wine Passions (@winepassions)', fb: 'https://www.facebook.com/winepassions.shop', xhs: '-', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V32', internal: 'Wine Tasting B2B 商業酒會', public: 'Business Wine Tasting 香港商業酒會活動', imp: 'A3', dm: 'DM', brand: 'Wine', youtube: 'www.youtube.com/@BusinessWineTasting', ig: 'https://www.instagram.com/hkwinetasting/', fb: 'https://www.facebook.com/winecollege/', xhs: '-', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V33', internal: 'Wine Magazine Portal 酒雜誌', public: 'Wine Passions Magazine 世界美酒雜誌 • 全球甄選', imp: 'A1', dm: 'DM', brand: 'Wine', youtube: 'Y www.youtube.com/@WinePassionsMagazine', ig: 'yes', fb: 'yes', xhs: 'Y', wechat: 'Y', douyin: 'Y', threads: '', linkedin: '' },
  { code: 'V34', internal: 'Wine Partner KOL 夥伴拍片', public: 'Wine Passions 新酒介紹', imp: 'A3', dm: 'M', brand: 'Wine', youtube: '', ig: '', fb: '', xhs: '-', wechat: '', douyin: '', threads: '', linkedin: '' },
  { code: 'V41', internal: 'Health + Beauty Portal 健康 美容雜誌', public: 'Beauty100 Magazine 亞洲美容健康雜誌', imp: 'A1', dm: 'DM', brand: 'BWL', youtube: '', ig: 'Y', fb: 'Y', xhs: '-', wechat: '-', douyin: '-', threads: '', linkedin: '' },
  { code: 'V42', internal: 'Beauty Services 醫美服務', public: 'Victoria Beauty 維多利亞好時光', imp: 'A1', dm: 'DM', brand: 'BSC Beauty', youtube: 'Y https://www.youtube.com/channel/UCcTqrCTyAAO0EaQWJOTeLvw', ig: 'Y', fb: 'Y', xhs: 'Y', wechat: 'Y', douyin: 'Y', threads: '', linkedin: '' },
];

const accounts = [
  { codes: ['V01'], label: 'Franco梵高管理新思維', platform: 'Instagram', accountId: 'login: franco.think', loginMethod: '', notes: '已註冊新賬號，feedhive統一管理（需升級套餐添加賬號）', sort: 1 },
  { codes: ['V01'], label: 'Franco梵高管理新思維', platform: 'Facebook', loginMethod: '', notes: '已註冊新賬號，待開專頁；feedhive統一管理（需升級套餐添加賬號）', sort: 2 },
  { codes: ['V01'], label: 'Franco梵高管理新思維', platform: 'YouTube', accountId: '/', loginMethod: '', notes: '【設計新思維】有賬號，已綁定運營者管理', sort: 3 },
  { codes: ['V01'], label: 'Franco梵高管理新思維', platform: '小紅書', loginMethod: '', notes: '已註冊新賬號，已綁定運營者管理', sort: 4 },
  { codes: ['V01'], label: 'Franco梵高管理新思維', platform: 'WeChat視頻號', loginMethod: '', notes: '有賬號，需掃碼登入（運營者工作手機/電腦端登入）', sort: 5 },
  { codes: ['V01'], label: 'Franco梵高管理新思維', platform: '抖音號', loginMethod: '', notes: '已註冊賬號，限定手機登入（已認證登入）', sort: 6 },
  { codes: ['V02'], label: 'BWCareer志豐事業平台', platform: 'Instagram', loginMethod: '', notes: '已註冊新賬號，feedhive統一管理（需升級套餐添加賬號）', feedhive: true, sort: 10 },
  { codes: ['V02'], label: 'BWCareer志豐事業平台', platform: 'Facebook', loginMethod: '', notes: '已註冊新賬號，待開專頁；feedhive統一管理（需升級套餐添加賬號）', feedhive: true, sort: 11 },
  { codes: ['V02'], label: 'BWCareer志豐事業平台', platform: 'YouTube', loginMethod: '', notes: '【設計新思維】有賬號，已綁定運營者管理', sort: 12 },
  { codes: ['V11'], label: '香港好設計', platform: 'IG', accountId: 'bw_designcentre', loginMethod: 'feedhive統一管理', notes: '有賬號，已由feedhive統一管理', feedhive: true, sort: 20 },
  { codes: ['V11'], label: '香港好設計', platform: 'Facebook', accountId: '/', loginMethod: 'feedhive統一管理', notes: '有賬號，已由feedhive統一管理', feedhive: true, sort: 21 },
  { codes: ['V11'], label: '香港好設計', platform: '微信視頻號', accountId: 'Fover2024-more', loginMethod: '運營者微信掃碼', notes: '由"志豐設計工程"視頻號統一發佈，已綁定運營者管理', sort: 22 },
  { codes: ['V11'], label: '香港好傢私', platform: 'IG', accountId: 'cfb_m03', loginMethod: 'cfb.m03@chifung.net', notes: '已註冊新賬號，feedhive統一管理（需升級套餐添加賬號）', feedhive: true, sort: 23 },
  { codes: ['V11'], label: '香港好傢私', platform: 'Facebook', accountId: 'cfb_m03', loginMethod: 'cfb.m03@chifung.net', notes: '已註冊新賬號，待開專頁；feedhive統一管理（需升級套餐添加賬號）', feedhive: true, sort: 24 },
  { codes: ['V12', 'V14'], label: 'BW Branding Design', platform: 'IG', accountId: 'cfb_m04', loginMethod: 'cfb.m04@chifung.net', notes: '已註冊新賬號，feedhive統一管理（需升級套餐添加賬號）', feedhive: true, sort: 30 },
  { codes: ['V12', 'V14'], label: 'BW Branding Design', platform: 'Facebook', accountId: 'cfb_m04', loginMethod: 'cfb.m04@chifung.net', notes: '已註冊新賬號，待開專頁；feedhive統一管理（需升級套餐添加賬號）', feedhive: true, sort: 31 },
  { codes: ['V12', 'V14'], label: 'BW Branding Design', platform: '微信視頻號', accountId: 'sphH5cnAJsyHbyr', loginMethod: '微信ID：CFB-M04掃碼', notes: '已註冊新賬號，已綁定運營者管理', operator: 'M04', sort: 32 },
  { codes: ['V13'], label: 'Project Connect 設計工程報價易', platform: 'IG', accountId: 'cfb_m10', loginMethod: 'cfb.m10@chifung.net', notes: '已註冊新賬號，feedhive統一管理（需升級套餐添加賬號）', feedhive: true, operator: 'M10', sort: 40 },
  { codes: ['V13'], label: 'Project Connect 設計工程報價易', platform: 'Facebook', accountId: 'cfb_m10', loginMethod: 'cfb.m10@chifung.net', notes: '已註冊新賬號，待開專頁；feedhive統一管理（需升級套餐添加賬號）', feedhive: true, operator: 'M10', sort: 41 },
  { codes: ['V13'], label: 'Project Connect 設計工程報價易', platform: '微信視頻號', accountId: 'shpKh1YcDxkyi6W', loginMethod: '微信ID：CFB-M10掃碼', notes: '已註冊新賬號，已綁定運營者管理', operator: 'M10', sort: 42 },
];

const channelInserts = channels.map(ch => {
  const ps = buildPlatformStatus(ch);
  return `  (${sqlStr(ch.code)}, ${sqlStr(ch.internal)}, ${sqlStr(ch.public)}, ${sqlStr(ch.imp)}, ${sqlStr(ch.dm)}, ${sqlStr(ch.brand)}, 'active', ${sqlJson(ps)})`;
}).join(',\n');

const accountInserts = accounts.map(a => {
  const codes = `ARRAY[${a.codes.map(c => sqlStr(c)).join(', ')}]`;
  return `  (${codes}, ${sqlStr(a.label)}, ${sqlStr(a.platform)}, ${a.accountId ? sqlStr(a.accountId) : 'NULL'}, NULL, ${a.loginMethod ? sqlStr(a.loginMethod) : 'NULL'}, ${a.operator ? sqlStr(a.operator) : 'NULL'}, ${a.feedhive ? 'true' : 'false'}, ${sqlStr(a.notes)}, ${a.sort})`;
}).join(',\n');

const migration = `-- Vchannel 頻道管理 Phase 1
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
${channelInserts}
ON CONFLICT (channel_code) DO NOTHING;

INSERT INTO public.vchannel_accounts
  (vchannel_codes, account_label, platform, account_id, account_password, login_method, operator_code, feedhive_managed, notes, sort_order)
VALUES
${accountInserts};
`;

const outPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260630_create_vchannels.sql');
fs.writeFileSync(outPath, migration, 'utf8');
console.log('Wrote', outPath);
console.log('Channels:', channels.length, 'Accounts:', accounts.length);
