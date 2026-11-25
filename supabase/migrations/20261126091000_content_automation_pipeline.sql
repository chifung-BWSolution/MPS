-- ============================================================
-- 社媒自動化營運 · 內容管線層
-- 對應 PRD v1.1 §6.2.5–6.2.7、§7.2
--
-- 只做加法：不含 drop / delete / truncate / alter column type
-- ============================================================

-- ------------------------------------------------------------
-- content_slots · 排程格（站點 × 發佈時間，唯一）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_slots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       text NOT NULL
                  REFERENCES public.content_sites(website_profile_id) ON DELETE CASCADE,
  -- 遠端 seo_keywords.id 實際型別是 text（歷史環境漂移：早期表已存在，
  -- local migration 的 CREATE TABLE IF NOT EXISTS 被跳過）。這裡沿用 text，
  -- 否則 FK 無法建立（uuid ↔ text 不相容）。前端／Edge 一律當字串處理，無影響。
  keyword_id    text REFERENCES public.seo_keywords(id) ON DELETE SET NULL,
  publish_at    timestamptz NOT NULL,
  generate_at   timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'planned'
                  CHECK (status IN (
                    'planned', 'generating', 'draft_ready', 'in_review',
                    'approved', 'scheduled', 'publishing', 'published',
                    'failed', 'held', 'skipped'
                  )),
  article_id    uuid,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, publish_at)
);

COMMENT ON TABLE public.content_slots IS
  '排程格；unique(site_id, publish_at) 是 planner 的冪等鍵。';

CREATE INDEX IF NOT EXISTS content_slots_status_generate_idx
  ON public.content_slots (status, generate_at);
CREATE INDEX IF NOT EXISTS content_slots_site_publish_idx
  ON public.content_slots (site_id, publish_at);
CREATE INDEX IF NOT EXISTS content_slots_keyword_idx
  ON public.content_slots (keyword_id);

DROP TRIGGER IF EXISTS content_slots_touch_updated_at ON public.content_slots;
CREATE TRIGGER content_slots_touch_updated_at
  BEFORE UPDATE ON public.content_slots
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- ------------------------------------------------------------
-- content_articles · 文章（狀態機見 PRD §6.3）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_articles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                text NOT NULL
                           REFERENCES public.content_sites(website_profile_id) ON DELETE CASCADE,
  section_id             uuid
                           REFERENCES public.content_site_sections(id) ON DELETE SET NULL,
  -- 與 content_slots.keyword_id 一致：配合遠端 seo_keywords.id（text）。
  keyword_id             text REFERENCES public.seo_keywords(id) ON DELETE SET NULL,
  slot_id                uuid REFERENCES public.content_slots(id) ON DELETE SET NULL,
  title                  text NOT NULL DEFAULT '',
  slug                   text NOT NULL DEFAULT '',
  excerpt                text,
  body_md                text,
  body_html              text,
  cover_asset_id         uuid REFERENCES public.content_assets(id) ON DELETE SET NULL,
  image_asset_ids        jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta_title             text,
  meta_description       text,
  canonical              text,
  og                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  json_ld                jsonb NOT NULL DEFAULT '{}'::jsonb,
  language               text NOT NULL DEFAULT 'zh-HK',
  status                 text NOT NULL DEFAULT 'draft'
                           CHECK (status IN (
                             'draft', 'pending_review', 'changes_requested', 'held',
                             'approved', 'scheduled', 'publishing', 'published',
                             'updating', 'publish_failed', 'cancelled',
                             'manual_done', 'draft_published', 'verify_failed'
                           )),
  version                integer NOT NULL DEFAULT 1,
  author_id              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewer_id            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at            timestamptz,
  scheduled_publish_at   timestamptz,
  published_at           timestamptz,
  external_id            text,
  live_url               text,
  manual_url             text,
  package_path           text,
  checks                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason                 text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug),
  UNIQUE (site_id, keyword_id)
);

COMMENT ON TABLE public.content_articles IS
  'UNIQUE(site_id, keyword_id) 保證一站一關鍵字只產生一篇主文章；version 為樂觀鎖。';

CREATE INDEX IF NOT EXISTS content_articles_status_idx
  ON public.content_articles (status, created_at DESC);
CREATE INDEX IF NOT EXISTS content_articles_site_status_idx
  ON public.content_articles (site_id, status);
CREATE INDEX IF NOT EXISTS content_articles_slot_idx
  ON public.content_articles (slot_id);
CREATE INDEX IF NOT EXISTS content_articles_scheduled_idx
  ON public.content_articles (scheduled_publish_at)
  WHERE status IN ('scheduled', 'approved');

DROP TRIGGER IF EXISTS content_articles_touch_updated_at ON public.content_articles;
CREATE TRIGGER content_articles_touch_updated_at
  BEFORE UPDATE ON public.content_articles
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- 硬性不變量的 DB 層守門（見 PRD §6.3）。只約束新表，不影響既有資料。
DO $$
BEGIN
  -- 規則 3：published 必須有 external_id 與 live_url。
  -- （verify_failed 不在此約束內：v1 manual 模式沒有 external_id，由 UI/日報標示）
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_articles_published_receipt_check'
  ) THEN
    ALTER TABLE public.content_articles
      ADD CONSTRAINT content_articles_published_receipt_check
      CHECK (
        status NOT IN ('published', 'updating')
        OR (external_id IS NOT NULL AND live_url IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_articles_approved_actor_check'
  ) THEN
    ALTER TABLE public.content_articles
      ADD CONSTRAINT content_articles_approved_actor_check
      CHECK (status <> 'approved' OR (reviewer_id IS NOT NULL AND approved_at IS NOT NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_articles_held_reason_check'
  ) THEN
    ALTER TABLE public.content_articles
      ADD CONSTRAINT content_articles_held_reason_check
      CHECK (status <> 'held' OR (reason IS NOT NULL AND length(btrim(reason)) > 0));
  END IF;
END
$$;

-- ------------------------------------------------------------
-- content_article_revisions · 版本快照
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_article_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid NOT NULL
                REFERENCES public.content_articles(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  snapshot    jsonb NOT NULL,
  actor_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, version)
);

CREATE INDEX IF NOT EXISTS content_article_revisions_article_idx
  ON public.content_article_revisions (article_id, version DESC);

-- ------------------------------------------------------------
-- content_jobs · 佇列（claim 走 RPC，禁止前端直接改）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL
                  CHECK (type IN (
                    'plan_slots', 'generate_article', 'publish_article', 'verify_publish',
                    'refresh_site_pages', 'site_health', 'send_digest', 'generate_social'
                  )),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at        timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'done', 'failed', 'dead')),
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 3,
  locked_by     text,
  locked_until  timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

CREATE INDEX IF NOT EXISTS content_jobs_dispatch_idx
  ON public.content_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS content_jobs_type_status_idx
  ON public.content_jobs (type, status);
CREATE UNIQUE INDEX IF NOT EXISTS content_jobs_dedupe_idx
  ON public.content_jobs (type, (payload->>'dedupe_key'))
  WHERE status IN ('queued', 'running') AND payload ? 'dedupe_key';

DROP TRIGGER IF EXISTS content_jobs_touch_updated_at ON public.content_jobs;
CREATE TRIGGER content_jobs_touch_updated_at
  BEFORE UPDATE ON public.content_jobs
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- ------------------------------------------------------------
-- content_claim_jobs · 認領 RPC
--   security definer + 固定 search_path，只授權 service_role。
--   否則任何登入使用者都能直接呼叫，把別人的 job 改成 running 卡死。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.content_claim_jobs(
  p_worker text,
  p_limit integer DEFAULT 3
)
RETURNS SETOF public.content_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH claimed AS (
    SELECT id
    FROM public.content_jobs
    WHERE status = 'queued'
      AND run_at <= now()
    ORDER BY run_at ASC, created_at ASC
    LIMIT greatest(coalesce(p_limit, 3), 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.content_jobs AS job
  SET status       = 'running',
      locked_by    = coalesce(nullif(btrim(p_worker), ''), 'worker'),
      locked_until = now() + interval '5 minutes',
      attempts     = job.attempts + 1,
      updated_at   = now()
  FROM claimed
  WHERE job.id = claimed.id
  RETURNING job.*;
$$;

COMMENT ON FUNCTION public.content_claim_jobs(text, integer) IS
  '認領待執行 job（FOR UPDATE SKIP LOCKED）；僅 service_role 可執行。';

REVOKE ALL ON FUNCTION public.content_claim_jobs(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.content_claim_jobs(text, integer) TO service_role;

-- ------------------------------------------------------------
-- content_llm_usage · LLM 用量
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_llm_usage (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     text,
  article_id  uuid,
  job_id      uuid,
  model       text NOT NULL,
  use_case    text NOT NULL DEFAULT 'generate_article',
  tokens_in   integer NOT NULL DEFAULT 0,
  tokens_out  integer NOT NULL DEFAULT 0,
  cost_usd    numeric(12, 6) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_llm_usage_created_idx
  ON public.content_llm_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS content_llm_usage_site_idx
  ON public.content_llm_usage (site_id, created_at DESC);
