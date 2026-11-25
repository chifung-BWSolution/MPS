-- ============================================================
-- 社媒自動化營運 · RLS、授權與 Storage
-- 對應 PRD v1.1 §6.4、§6.5
--
-- 四條硬規則：
--   1. 既有 policy 零改動：本檔所有 policy 目標都是 content_* 新表或 content-assets
--   2. content_site_credentials 用「不建 policy」實現封閉（不是 using(false)）
--   3. content_claim_jobs 在 pipeline migration 已限定 service_role
--   4. 每條 storage 政策都帶 bucket_id = 'content-assets'，bucket 設 private
-- ============================================================

-- ------------------------------------------------------------
-- 1) 可讀寫表：站點設定、欄目、頁面、排程、文章、修訂、素材、設定
-- ------------------------------------------------------------
DO $$
DECLARE
  target_table text;
  writable_tables text[] := ARRAY[
    'content_sites',
    'content_site_sections',
    'content_site_pages',
    'content_slots',
    'content_articles',
    'content_article_revisions',
    'content_assets',
    'content_settings'
  ];
BEGIN
  FOREACH target_table IN ARRAY writable_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
        AND policyname = 'content authenticated full access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "content authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        target_table
      );
    END IF;

    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      target_table
    );
    EXECUTE format('GRANT ALL ON public.%I TO service_role', target_table);
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 2) 只讀表：job 佇列、發布回執、LLM 用量、日報
--    （前端只讀；寫入一律走 Edge Function 的 service_role）
-- ------------------------------------------------------------
DO $$
DECLARE
  target_table text;
  read_only_tables text[] := ARRAY[
    'content_jobs',
    'content_publish_logs',
    'content_llm_usage',
    'content_email_digests'
  ];
BEGIN
  FOREACH target_table IN ARRAY read_only_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
        AND policyname = 'content authenticated read only'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "content authenticated read only" ON public.%I FOR SELECT TO authenticated USING (true)',
        target_table
      );
    END IF;

    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', target_table);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', target_table);
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 3) 檢查紀錄：前端可讀（健康頁需要）
-- ------------------------------------------------------------
ALTER TABLE public.content_site_checks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'content_site_checks'
      AND policyname = 'content authenticated read checks'
  ) THEN
    CREATE POLICY "content authenticated read checks"
      ON public.content_site_checks FOR SELECT TO authenticated USING (true);
  END IF;
END
$$;

GRANT SELECT ON public.content_site_checks TO authenticated;
GRANT ALL ON public.content_site_checks TO service_role;

-- ------------------------------------------------------------
-- 4) 憑證：RLS 開啟 + 0 條 policy = 對 authenticated 全拒
--    明文永不落地；密文只由 Edge Function 以 service_role 讀寫。
-- ------------------------------------------------------------
ALTER TABLE public.content_site_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.content_site_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.content_site_credentials TO service_role;

-- ------------------------------------------------------------
-- 5) Storage：content-assets（private，草稿不應有公開 URL）
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-assets',
  'content-assets',
  false,
  10485760,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'application/zip', 'application/json', 'text/plain', 'text/markdown', 'text/html'
  ]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'content-assets authenticated read'
  ) THEN
    CREATE POLICY "content-assets authenticated read"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'content-assets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'content-assets authenticated insert'
  ) THEN
    CREATE POLICY "content-assets authenticated insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'content-assets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'content-assets authenticated update'
  ) THEN
    CREATE POLICY "content-assets authenticated update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'content-assets')
      WITH CHECK (bucket_id = 'content-assets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'content-assets authenticated delete'
  ) THEN
    CREATE POLICY "content-assets authenticated delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'content-assets');
  END IF;
END
$$;
