-- ============================================================
-- 跨平台一稿多發（工具中心 / #tools-center/crosspost）
--
-- 只新增兩張表，不改任何既有表、不做資料搬遷、不建 cron / trigger。
-- 回滾：scripts/rollback-crosspost-copy.sql（手動執行；不要放進 migrations）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crosspost_sets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  core_info       text NOT NULL,
  audience        text NOT NULL,
  cta             text NOT NULL,
  brand_id        uuid REFERENCES public.brand_list(id) ON DELETE SET NULL,
  brand_name      text,
  tone            text,
  language        text NOT NULL DEFAULT 'zh-HK',
  extra_notes     text,
  platforms       text[] NOT NULL DEFAULT ARRAY['ig', 'fb', 'threads', 'redbook', 'edm']::text[],
  llm_provider    text,
  llm_model       text,
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crosspost_sets_language_check
    CHECK (language IN ('zh-HK', 'zh-TW', 'zh-CN')),
  CONSTRAINT crosspost_sets_platforms_check
    CHECK (platforms <@ ARRAY['ig', 'fb', 'threads', 'redbook', 'edm']::text[]),
  CONSTRAINT crosspost_sets_provider_check
    CHECK (llm_provider IS NULL OR llm_provider IN ('grok', 'gemini'))
);

COMMENT ON TABLE public.crosspost_sets IS
  '跨平台一稿多發：每次生成的一組 brief（活動資訊／受眾／CTA）與供應商紀錄。';

COMMENT ON COLUMN public.crosspost_sets.brand_id IS
  'brand_list.id；品牌被刪除時只設 NULL，歷史仍保留 brand_name 快照。';

COMMENT ON COLUMN public.crosspost_sets.created_by IS
  'users.id；只作記錄，刪除員工不影響歷史。';

CREATE TABLE IF NOT EXISTS public.crosspost_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id       uuid NOT NULL REFERENCES public.crosspost_sets(id) ON DELETE CASCADE,
  platform     text NOT NULL,
  title        text,
  preview_text text,
  body         text NOT NULL,
  hashtags     text[] NOT NULL DEFAULT ARRAY[]::text[],
  char_count   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crosspost_variants_platform_check
    CHECK (platform IN ('ig', 'fb', 'threads', 'redbook', 'edm')),
  CONSTRAINT crosspost_variants_set_platform_key UNIQUE (set_id, platform)
);

COMMENT ON TABLE public.crosspost_variants IS
  '跨平台一稿多發：一組 brief 下的各平台版本（每平台一版）。';

COMMENT ON COLUMN public.crosspost_variants.char_count IS
  '正文的 Unicode code point 數（不含 Hashtag）。';

CREATE INDEX IF NOT EXISTS crosspost_sets_created_at_idx
  ON public.crosspost_sets (created_at DESC);

CREATE INDEX IF NOT EXISTS crosspost_sets_created_by_created_at_idx
  ON public.crosspost_sets (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS crosspost_variants_set_id_idx
  ON public.crosspost_variants (set_id);

-- ------------------------------------------------------------
-- RLS：所有登入者可讀寫（公司內部共用工具）；anon 一律拒絕
-- ------------------------------------------------------------

ALTER TABLE public.crosspost_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crosspost_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crosspost_sets_select_authenticated" ON public.crosspost_sets;
CREATE POLICY "crosspost_sets_select_authenticated"
  ON public.crosspost_sets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "crosspost_sets_insert_authenticated" ON public.crosspost_sets;
CREATE POLICY "crosspost_sets_insert_authenticated"
  ON public.crosspost_sets FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "crosspost_sets_update_authenticated" ON public.crosspost_sets;
CREATE POLICY "crosspost_sets_update_authenticated"
  ON public.crosspost_sets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crosspost_sets_delete_authenticated" ON public.crosspost_sets;
CREATE POLICY "crosspost_sets_delete_authenticated"
  ON public.crosspost_sets FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "crosspost_variants_select_authenticated" ON public.crosspost_variants;
CREATE POLICY "crosspost_variants_select_authenticated"
  ON public.crosspost_variants FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "crosspost_variants_insert_authenticated" ON public.crosspost_variants;
CREATE POLICY "crosspost_variants_insert_authenticated"
  ON public.crosspost_variants FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "crosspost_variants_update_authenticated" ON public.crosspost_variants;
CREATE POLICY "crosspost_variants_update_authenticated"
  ON public.crosspost_variants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crosspost_variants_delete_authenticated" ON public.crosspost_variants;
CREATE POLICY "crosspost_variants_delete_authenticated"
  ON public.crosspost_variants FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crosspost_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crosspost_variants TO authenticated;
GRANT ALL ON public.crosspost_sets TO service_role;
GRANT ALL ON public.crosspost_variants TO service_role;
REVOKE ALL ON public.crosspost_sets FROM anon;
REVOKE ALL ON public.crosspost_variants FROM anon;
