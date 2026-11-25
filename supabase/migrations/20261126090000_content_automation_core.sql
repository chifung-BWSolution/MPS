-- ============================================================
-- 社媒自動化營運 · 核心站點層（B100 → MPS 工具中心）
-- 對應 PRD v1.1 §6.2.1–6.2.2、§6.5
--
-- 施工安全規則（不可協商，見 PRD §6.6）：
--   1. 只做加法：本檔不含 drop table / drop column / delete / truncate
--   2. 既有表只碰 seo_keywords，且只加 nullable 欄、不給 DEFAULT
--   3. content_sites → webandsystem_list 用 ON DELETE RESTRICT
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 共用：updated_at 自動維護（新函式，不動既有 function）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.content_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.content_touch_updated_at() IS
  'content_* 表的 updated_at 觸發器；只被本專案新建的表引用。';

-- ------------------------------------------------------------
-- content_sites · 站點設定（webandsystem_list 的 1:1 擴充）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_sites (
  website_profile_id  text PRIMARY KEY
                        REFERENCES public.webandsystem_list(id) ON DELETE RESTRICT,
  tier                text NOT NULL DEFAULT 'B'
                        CHECK (tier IN ('A1', 'A2', 'B')),
  adapter             text NOT NULL DEFAULT 'manual'
                        CHECK (adapter IN ('manual', 'next_custom', 'shopify', 'wordpress', 'webflow', 'beauty100')),
  publish_mode        text NOT NULL DEFAULT 'manual'
                        CHECK (publish_mode IN ('manual', 'draft', 'direct')),
  locale              text NOT NULL DEFAULT 'zh-HK',
  timezone            text NOT NULL DEFAULT 'Asia/Hong_Kong',
  cadence             jsonb NOT NULL DEFAULT '{
                        "frequency": "weekly",
                        "weekdays": [1],
                        "publish_time": "10:00",
                        "lead_time_hours": 48,
                        "review_cutoff_hours": 4,
                        "max_articles_per_day": 1,
                        "blackout_dates": []
                      }'::jsonb,
  seo_defaults        jsonb NOT NULL DEFAULT '{
                        "locale": "zh-HK",
                        "titleTemplate": "{title}｜{brand}",
                        "metaTemplate": "{excerpt}",
                        "slugRule": "english-kebab-8",
                        "canonicalBase": "",
                        "author": "",
                        "publisher": "",
                        "ogImage": "",
                        "jsonLdType": "BlogPosting",
                        "categoryMap": {},
                        "robotsDraft": "noindex,nofollow",
                        "robotsLive": "index,follow",
                        "wordCountMin": 800,
                        "wordCountMax": 1500,
                        "internalLinksMin": 2,
                        "internalLinksMax": 3,
                        "bannedWords": []
                      }'::jsonb,
  brand_voice         jsonb NOT NULL DEFAULT '{
                        "tone": "專業、可信、具體",
                        "audience": "",
                        "cta": "",
                        "bannedWords": [],
                        "factBoundaries": "",
                        "allowAiImages": true
                      }'::jsonb,
  health              text NOT NULL DEFAULT 'untested'
                        CHECK (health IN ('untested', 'ok', 'degraded', 'down')),
  last_verified_at    timestamptz,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'paused', 'archived')),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_sites IS
  '站點設定擴充（1:1 webandsystem_list）；刪除站點時由 RESTRICT 擋下，不連帶清空插件資料。';

CREATE INDEX IF NOT EXISTS content_sites_status_idx
  ON public.content_sites (status);

DROP TRIGGER IF EXISTS content_sites_touch_updated_at ON public.content_sites;
CREATE TRIGGER content_sites_touch_updated_at
  BEFORE UPDATE ON public.content_sites
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- ------------------------------------------------------------
-- content_site_sections · 欄目
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_site_sections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         text NOT NULL
                    REFERENCES public.content_sites(website_profile_id) ON DELETE CASCADE,
  name            text NOT NULL,
  external_id     text,
  slug            text NOT NULL,
  content_type    text NOT NULL DEFAULT 'article'
                    CHECK (content_type IN ('article', 'post', 'page')),
  mapping         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE INDEX IF NOT EXISTS content_site_sections_site_idx
  ON public.content_site_sections (site_id);

DROP TRIGGER IF EXISTS content_site_sections_touch_updated_at ON public.content_site_sections;
CREATE TRIGGER content_site_sections_touch_updated_at
  BEFORE UPDATE ON public.content_site_sections
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- ------------------------------------------------------------
-- content_site_pages · 內鏈與 cannibalization 觀測
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_site_pages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         text NOT NULL
                    REFERENCES public.content_sites(website_profile_id) ON DELETE CASCADE,
  url             text NOT NULL,
  title           text,
  source          text NOT NULL DEFAULT 'sitemap'
                    CHECK (source IN ('sitemap', 'manual')),
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, url)
);

CREATE INDEX IF NOT EXISTS content_site_pages_site_idx
  ON public.content_site_pages (site_id);

-- ------------------------------------------------------------
-- content_site_credentials · 憑證（RLS 封閉，只給 service_role）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_site_credentials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           text NOT NULL
                      REFERENCES public.content_sites(website_profile_id) ON DELETE CASCADE,
  kind              text NOT NULL
                      CHECK (kind IN ('http_bearer', 'http_hmac', 'wp_app_password', 'shopify_admin', 'webflow_token')),
  ciphertext        text NOT NULL,
  fingerprint       text,
  expires_at        timestamptz,
  last_verified_at  timestamptz,
  status            text NOT NULL DEFAULT 'untested'
                      CHECK (status IN ('active', 'invalid', 'untested')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, kind)
);

COMMENT ON TABLE public.content_site_credentials IS
  '站點憑證密文（AES-256-GCM）。authenticated 無任何 policy，只能由 Edge Function 以 service_role 讀寫。';

DROP TRIGGER IF EXISTS content_site_credentials_touch_updated_at ON public.content_site_credentials;
CREATE TRIGGER content_site_credentials_touch_updated_at
  BEFORE UPDATE ON public.content_site_credentials
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- ------------------------------------------------------------
-- content_site_checks · 連線／健康檢查紀錄
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_site_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     text NOT NULL
                REFERENCES public.content_sites(website_profile_id) ON DELETE CASCADE,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL
                CHECK (kind IN ('settings', 'domain', 'sitemap', 'credential')),
  ok          boolean NOT NULL DEFAULT false,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS content_site_checks_site_idx
  ON public.content_site_checks (site_id, checked_at DESC);

-- ------------------------------------------------------------
-- content_assets · 素材（封面／插畫／圖卡／內容包）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       text
                  REFERENCES public.content_sites(website_profile_id) ON DELETE SET NULL,
  bucket        text NOT NULL DEFAULT 'content-assets',
  storage_path  text NOT NULL,
  filename      text,
  mime_type     text,
  bytes         bigint,
  source        text NOT NULL DEFAULT 'upload'
                  CHECK (source IN ('upload', 'ai_generated', 'vector')),
  tags          text[] NOT NULL DEFAULT '{}'::text[],
  alt           text,
  license_info  text,
  width         integer,
  height        integer,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_assets_site_idx
  ON public.content_assets (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_assets_tags_idx
  ON public.content_assets USING gin (tags);

COMMENT ON TABLE public.content_assets IS
  '素材索引；bucket=content-assets 為 private，預覽一律 createSignedUrl。';

-- ------------------------------------------------------------
-- seo_keywords · 只加 5 個 nullable 欄，全部不給 DEFAULT（PRD §6.2.2）
--
-- 為什麼不能給 DEFAULT：ADD COLUMN ... DEFAULT 會讓既有列一併生效，
-- 若 pipeline_status default 'backlog'，全站歷史關鍵字會瞬間變成
-- 「可被 planner 挑選」，接入站點後可能被自動拿去生成文章。
-- ------------------------------------------------------------
ALTER TABLE public.seo_keywords
  ADD COLUMN IF NOT EXISTS intent          text,
  ADD COLUMN IF NOT EXISTS priority        integer,
  ADD COLUMN IF NOT EXISTS cluster         text,
  ADD COLUMN IF NOT EXISTS pipeline_status text,
  ADD COLUMN IF NOT EXISTS last_used_at    timestamptz;

COMMENT ON COLUMN public.seo_keywords.intent IS
  '搜尋意圖：informational / commercial / transactional / navigational；NULL = 未分級';
COMMENT ON COLUMN public.seo_keywords.priority IS
  '越大越先（人工 pin = 1000）；NULL = 未分級，planner 以 priority desc nulls last 排序';
COMMENT ON COLUMN public.seo_keywords.pipeline_status IS
  '自動生成管線狀態：backlog / planned / generating / in_review / published / rejected / parked；NULL = 未啟用自動生成';
COMMENT ON COLUMN public.seo_keywords.last_used_at IS
  '最近一次被生成管線取用時間';

-- planner 只挑 pipeline_status = 'backlog'，此索引服務該查詢（部分索引，NULL 不入列）
CREATE INDEX IF NOT EXISTS seo_keywords_pipeline_backlog_idx
  ON public.seo_keywords (website_profile_id, priority DESC NULLS LAST)
  WHERE pipeline_status = 'backlog';

CREATE INDEX IF NOT EXISTS seo_keywords_pipeline_status_idx
  ON public.seo_keywords (pipeline_status);
