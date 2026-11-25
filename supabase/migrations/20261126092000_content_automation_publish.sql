-- ============================================================
-- 社媒自動化營運 · 發布回執 / 日報 / 全域設定
-- 對應 PRD v1.1 §6.2.7、§7.3、§9.2.4
--
-- 只做加法：不含 drop / delete / truncate / alter column type
-- ============================================================

-- ------------------------------------------------------------
-- content_publish_logs · append-only 回執（誰在何時對哪篇做了什麼）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_publish_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          text,
  article_id       uuid,
  action           text NOT NULL
                     CHECK (action IN (
                       'package', 'manual_done', 'publish', 'retry', 'verify',
                       'approve', 'reject', 'confirm', 'schedule', 'restore'
                     )),
  request          jsonb NOT NULL DEFAULT '{}'::jsonb,
  response         jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_id      text,
  url              text,
  http_status      integer,
  duration_ms      integer,
  idempotency_key  text,
  actor_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_publish_logs_article_idx
  ON public.content_publish_logs (article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_publish_logs_site_idx
  ON public.content_publish_logs (site_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS content_publish_logs_idempotency_idx
  ON public.content_publish_logs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE public.content_publish_logs IS
  'append-only 回執；UI 只讀，寫入只由 Edge Function 以 service_role 進行。';

-- ------------------------------------------------------------
-- content_email_digests · 每日日報紀錄
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_email_digests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date date NOT NULL UNIQUE,
  recipients  jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject     text NOT NULL DEFAULT '',
  html        text NOT NULL DEFAULT '',
  summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'sending', 'sent', 'failed', 'skipped')),
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_email_digests_date_idx
  ON public.content_email_digests (digest_date DESC);

DROP TRIGGER IF EXISTS content_email_digests_touch_updated_at ON public.content_email_digests;
CREATE TRIGGER content_email_digests_touch_updated_at
  BEFORE UPDATE ON public.content_email_digests
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- ------------------------------------------------------------
-- content_settings · 單列全域設定
--   出廠 daily_article_limit = 0：裝好不等於開跑（PRD §6.6 規則 7）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_settings (
  id                    text PRIMARY KEY DEFAULT 'default',
  model                 text NOT NULL DEFAULT 'gemini-2.5-flash',
  daily_article_limit   integer NOT NULL DEFAULT 0,
  daily_llm_call_limit  integer NOT NULL DEFAULT 30,
  digest_time           text NOT NULL DEFAULT '09:00',
  digest_enabled        boolean NOT NULL DEFAULT false,
  digest_recipients     jsonb NOT NULL DEFAULT '[]'::jsonb,
  breaker_mode          text NOT NULL DEFAULT 'full'
                          CHECK (breaker_mode IN ('full', 'single_score', 'vector_only', 'fetch_only')),
  feature_flags         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_settings IS
  '單列設定（id = ''default''）；daily_article_limit 出廠 0，需人工明確啟用才會生成。';

DROP TRIGGER IF EXISTS content_settings_touch_updated_at ON public.content_settings;
CREATE TRIGGER content_settings_touch_updated_at
  BEFORE UPDATE ON public.content_settings
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- 預設列必須 on conflict do nothing，否則 migration 重跑會撞主鍵
INSERT INTO public.content_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;
