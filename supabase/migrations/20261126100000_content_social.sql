-- ============================================================
-- 社媒自動化營運 · P4 社媒線表群（可延後至 P4 前再上）
-- 對應 PRD v1.1 §10、附錄 B
--
-- 本檔只建新表與新 policy，不動任何既有表／既有 policy。
-- P4 UI 尚未實作，資料層先就位以縮短後續工期。
-- ============================================================

-- ------------------------------------------------------------
-- 品牌帳號（一帳號可屬多組）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_social_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 遠端 brand_list.id 實際為 uuid（歷史環境漂移：本地 migration 早期版本寫 text）。
  brand_id         uuid REFERENCES public.brand_list(id) ON DELETE SET NULL,
  platform         text NOT NULL
                     CHECK (platform IN ('instagram', 'threads', 'facebook', 'xiaohongshu', 'youtube', 'other')),
  handle           text NOT NULL,
  display_name     text,
  login_status     text NOT NULL DEFAULT 'unknown'
                     CHECK (login_status IN ('active', 'expired', 'unknown')),
  last_checked_at  timestamptz,
  archived         boolean NOT NULL DEFAULT false,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, handle)
);

CREATE INDEX IF NOT EXISTS content_social_accounts_brand_idx
  ON public.content_social_accounts (brand_id);

DROP TRIGGER IF EXISTS content_social_accounts_touch_updated_at ON public.content_social_accounts;
CREATE TRIGGER content_social_accounts_touch_updated_at
  BEFORE UPDATE ON public.content_social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.content_social_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS content_social_groups_touch_updated_at ON public.content_social_groups;
CREATE TRIGGER content_social_groups_touch_updated_at
  BEFORE UPDATE ON public.content_social_groups
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.content_social_group_members (
  group_id    uuid NOT NULL REFERENCES public.content_social_groups(id) ON DELETE CASCADE,
  account_id  uuid NOT NULL REFERENCES public.content_social_accounts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, account_id)
);

CREATE INDEX IF NOT EXISTS content_social_group_members_account_idx
  ON public.content_social_group_members (account_id);

-- ------------------------------------------------------------
-- 熱點（v1 手動貼／CSV 匯入；自動抓取延後）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_hot_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  url         text NOT NULL UNIQUE,
  summary     text,
  source      text NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual', 'csv', 'rss', 'hotlist')),
  heat        integer NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_hot_items_captured_idx
  ON public.content_hot_items (captured_at DESC);

CREATE TABLE IF NOT EXISTS public.content_hot_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  summary     text,
  score       numeric(10, 2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'used', 'ignored')),
  item_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS content_hot_events_touch_updated_at ON public.content_hot_events;
CREATE TRIGGER content_hot_events_touch_updated_at
  BEFORE UPDATE ON public.content_hot_events
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- ------------------------------------------------------------
-- 社媒稿（1 篇站內長文 + 每帳號一條導流；同平台文案共用一份）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_social_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid REFERENCES public.content_hot_events(id) ON DELETE SET NULL,
  article_id       uuid REFERENCES public.content_articles(id) ON DELETE SET NULL,
  title            text NOT NULL DEFAULT '',
  body_md          text,
  body_html        text,
  cover_asset_id   uuid REFERENCES public.content_assets(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN (
                       'draft', 'pending_review', 'changes_requested', 'approved',
                       'scheduled', 'publishing', 'published', 'failed', 'cancelled'
                     )),
  scheduled_at     timestamptz,
  approved_at      timestamptz,
  reviewer_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_social_posts_status_idx
  ON public.content_social_posts (status, created_at DESC);

DROP TRIGGER IF EXISTS content_social_posts_touch_updated_at ON public.content_social_posts;
CREATE TRIGGER content_social_posts_touch_updated_at
  BEFORE UPDATE ON public.content_social_posts
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.content_social_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES public.content_social_posts(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES public.content_social_accounts(id) ON DELETE CASCADE,
  copy_text     text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'copied', 'published', 'failed', 'skipped')),
  published_url text,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, account_id)
);

CREATE INDEX IF NOT EXISTS content_social_targets_post_idx
  ON public.content_social_targets (post_id);

DROP TRIGGER IF EXISTS content_social_targets_touch_updated_at ON public.content_social_targets;
CREATE TRIGGER content_social_targets_touch_updated_at
  BEFORE UPDATE ON public.content_social_targets
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- ------------------------------------------------------------
-- RLS：P4 表同樣走「authenticated 全開、service_role 全開」
-- ------------------------------------------------------------
DO $$
DECLARE
  target_table text;
  p4_tables text[] := ARRAY[
    'content_social_accounts',
    'content_social_groups',
    'content_social_group_members',
    'content_hot_items',
    'content_hot_events',
    'content_social_posts',
    'content_social_targets'
  ];
BEGIN
  FOREACH target_table IN ARRAY p4_tables LOOP
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
