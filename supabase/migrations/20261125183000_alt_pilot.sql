-- ============================================================
-- ALT Pilot · 網站圖片 ALT 生成與自動填入（工具中心子模組）
-- 對應計劃書 v1.1 §9
--
-- 施工安全規則（不可協商）：
--   1. 只做加法：create table / create index / insert ... on conflict do nothing
--   2. 不改任何既有表、欄位、policy、bucket、cron
--   3. 不 drop table / drop column / alter column type / delete / truncate
--   4. 對既有表 FK 一律 on delete set null，不 cascade
--
-- 本檔只供本機 MVP；未經批准不得 push 到線上。
-- ============================================================

-- ------------------------------------------------------------
-- 共用：updated_at 自動維護（專用名稱，不覆蓋既有 function）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.alt_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.alt_touch_updated_at() IS
  'ALT Pilot 新表的 updated_at 觸發器；只被 alt_* 表引用。';

-- ------------------------------------------------------------
-- alt_runs · 每次頁面分析
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alt_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          text REFERENCES public.webandsystem_list(id) ON DELETE SET NULL,
  page_url         text NOT NULL,
  page_host        text NOT NULL,
  page_title       text NOT NULL DEFAULT '',
  page_lang        text NOT NULL DEFAULT '',
  page_hash        text NOT NULL DEFAULT '',
  context_summary  text NOT NULL DEFAULT '',
  keyword          text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'analyzed'
                     CHECK (status IN ('analyzed', 'generating', 'ready', 'exported', 'failed', 'archived')),
  image_count      integer NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  generated_count  integer NOT NULL DEFAULT 0 CHECK (generated_count >= 0),
  approved_count   integer NOT NULL DEFAULT 0 CHECK (approved_count >= 0),
  model            text NOT NULL DEFAULT '',
  error            text,
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.alt_runs IS
  'ALT Pilot 每次頁面分析的批次；只新增，不影響既有表。';

CREATE INDEX IF NOT EXISTS alt_runs_created_idx
  ON public.alt_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS alt_runs_site_created_idx
  ON public.alt_runs (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alt_runs_status_idx
  ON public.alt_runs (status);

-- ------------------------------------------------------------
-- alt_suggestions · 每張圖的 ALT 建議
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alt_suggestions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid NOT NULL REFERENCES public.alt_runs(id) ON DELETE CASCADE,
  image_url        text NOT NULL,
  image_host       text NOT NULL DEFAULT '',
  image_hash       text,
  filename         text NOT NULL DEFAULT '',
  location         text NOT NULL DEFAULT 'unknown'
                     CHECK (location IN ('header', 'main', 'footer', 'unknown')),
  current_alt      text NOT NULL DEFAULT '',
  context_excerpt  text NOT NULL DEFAULT '',
  suggested_alt    text NOT NULL DEFAULT '',
  short_alt        text NOT NULL DEFAULT '',
  alternatives     jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale        text NOT NULL DEFAULT '',
  keyword          text NOT NULL DEFAULT '',
  confidence       numeric(4,3) NOT NULL DEFAULT 0.5
                     CHECK (confidence >= 0 AND confidence <= 1),
  risk             text NOT NULL DEFAULT 'medium'
                     CHECK (risk IN ('low', 'medium', 'high')),
  issues           jsonb NOT NULL DEFAULT '[]'::jsonb,
  decorative       boolean NOT NULL DEFAULT false,
  provider         text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'exported', 'failed')),
  final_alt        text,
  reviewed_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, image_url)
);

COMMENT ON TABLE public.alt_suggestions IS
  'ALT Pilot 每張圖的建議與審批狀態；UNIQUE(run_id,image_url) 支援重生成 upsert。';

CREATE INDEX IF NOT EXISTS alt_suggestions_run_idx
  ON public.alt_suggestions (run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS alt_suggestions_status_idx
  ON public.alt_suggestions (status);

-- ------------------------------------------------------------
-- alt_llm_usage · LLM 用量（append-only）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alt_llm_usage (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid REFERENCES public.alt_runs(id) ON DELETE SET NULL,
  suggestion_id  uuid REFERENCES public.alt_suggestions(id) ON DELETE SET NULL,
  model          text NOT NULL DEFAULT '',
  provider       text NOT NULL DEFAULT '',
  use_case       text NOT NULL DEFAULT 'alt_generate',
  tokens_in      integer NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out     integer NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  cost_usd       numeric(12,6) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.alt_llm_usage IS
  'ALT Pilot 每次 LLM 呼叫的用量；只新增，供每日配額與成本核對。';

CREATE INDEX IF NOT EXISTS alt_llm_usage_created_idx
  ON public.alt_llm_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS alt_llm_usage_run_idx
  ON public.alt_llm_usage (run_id);

-- ------------------------------------------------------------
-- alt_settings · 單列設定
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alt_settings (
  id                   text PRIMARY KEY DEFAULT 'default',
  enabled              boolean NOT NULL DEFAULT false,
  model                text NOT NULL DEFAULT 'grok-4.5',
  fallback_model       text NOT NULL DEFAULT 'gemini-2.5-flash',
  daily_call_limit     integer NOT NULL DEFAULT 0 CHECK (daily_call_limit >= 0),
  max_images_per_run   integer NOT NULL DEFAULT 40 CHECK (max_images_per_run BETWEEN 1 AND 200),
  max_images_per_call  integer NOT NULL DEFAULT 6 CHECK (max_images_per_call BETWEEN 1 AND 12),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.alt_settings IS
  'ALT Pilot 單列設定；預設列由 migration 插入，重跑不會覆蓋。';

INSERT INTO public.alt_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- updated_at triggers（只在新表；不 drop、不改既有 trigger）
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'alt_runs_touch_updated_at'
      AND tgrelid = 'public.alt_runs'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER alt_runs_touch_updated_at
      BEFORE UPDATE ON public.alt_runs
      FOR EACH ROW EXECUTE FUNCTION public.alt_touch_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'alt_suggestions_touch_updated_at'
      AND tgrelid = 'public.alt_suggestions'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER alt_suggestions_touch_updated_at
      BEFORE UPDATE ON public.alt_suggestions
      FOR EACH ROW EXECUTE FUNCTION public.alt_touch_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'alt_settings_touch_updated_at'
      AND tgrelid = 'public.alt_settings'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER alt_settings_touch_updated_at
      BEFORE UPDATE ON public.alt_settings
      FOR EACH ROW EXECUTE FUNCTION public.alt_touch_updated_at()';
  END IF;
END $$;

-- ------------------------------------------------------------
-- RLS：只在新表上加 policy；不改任何既有 policy
--   authenticated：alt_runs / alt_suggestions 可 SELECT / INSERT / UPDATE
--   DELETE 只給 service_role（不建 authenticated delete policy）
--   alt_settings / alt_llm_usage：只讀
-- ------------------------------------------------------------
ALTER TABLE public.alt_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alt_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alt_llm_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alt_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alt_runs'
      AND policyname = 'alt_runs_select_authenticated'
  ) THEN
    CREATE POLICY alt_runs_select_authenticated
      ON public.alt_runs FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alt_runs'
      AND policyname = 'alt_runs_insert_authenticated'
  ) THEN
    CREATE POLICY alt_runs_insert_authenticated
      ON public.alt_runs FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alt_runs'
      AND policyname = 'alt_runs_update_authenticated'
  ) THEN
    CREATE POLICY alt_runs_update_authenticated
      ON public.alt_runs FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alt_suggestions'
      AND policyname = 'alt_suggestions_select_authenticated'
  ) THEN
    CREATE POLICY alt_suggestions_select_authenticated
      ON public.alt_suggestions FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alt_suggestions'
      AND policyname = 'alt_suggestions_insert_authenticated'
  ) THEN
    CREATE POLICY alt_suggestions_insert_authenticated
      ON public.alt_suggestions FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alt_suggestions'
      AND policyname = 'alt_suggestions_update_authenticated'
  ) THEN
    CREATE POLICY alt_suggestions_update_authenticated
      ON public.alt_suggestions FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alt_settings'
      AND policyname = 'alt_settings_select_authenticated'
  ) THEN
    CREATE POLICY alt_settings_select_authenticated
      ON public.alt_settings FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alt_llm_usage'
      AND policyname = 'alt_llm_usage_select_authenticated'
  ) THEN
    CREATE POLICY alt_llm_usage_select_authenticated
      ON public.alt_llm_usage FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 顯式授權：先收回 Supabase default privileges，再只給必要權限。
-- 這樣 authenticated 不會有 DELETE／TRUNCATE／REFERENCES 等預設權限。
REVOKE ALL ON public.alt_runs, public.alt_suggestions, public.alt_llm_usage, public.alt_settings
  FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.alt_runs, public.alt_suggestions TO authenticated;
GRANT SELECT ON public.alt_settings, public.alt_llm_usage TO authenticated;

GRANT ALL ON public.alt_runs TO service_role;
GRANT ALL ON public.alt_suggestions TO service_role;
GRANT ALL ON public.alt_settings TO service_role;
GRANT ALL ON public.alt_llm_usage TO service_role;

REVOKE ALL ON public.alt_runs FROM anon;
REVOKE ALL ON public.alt_suggestions FROM anon;
REVOKE ALL ON public.alt_settings FROM anon;
REVOKE ALL ON public.alt_llm_usage FROM anon;
