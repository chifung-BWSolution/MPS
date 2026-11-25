-- ============================================================
-- SEO 雷達：候選詞池 + 抓取紀錄（PRD §5）
--
-- 施工原則（與 content_* 系列一致）：
--   1. 純新增：只建兩張新表，不改任何既有表／欄位／policy／grant
--   2. 不寫 DML：本檔沒有任何 insert / update / delete / truncate
--   3. 寫入只經 service_role（Edge Function）；前端只有唯讀
-- ============================================================

-- ------------------------------------------------------------
-- 抓取紀錄（仿 public.gsc_sync_runs）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seo_radar_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger         text NOT NULL DEFAULT 'manual'
                  CHECK (trigger IN ('manual', 'cron')),
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'success', 'error')),
  sites_scanned   integer NOT NULL DEFAULT 0,
  ideas_upserted  integer NOT NULL DEFAULT 0,
  gsc_terms       integer NOT NULL DEFAULT 0,
  suggest_terms   integer NOT NULL DEFAULT 0,
  error_message   text,
  meta            jsonb,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS seo_radar_runs_started_idx
  ON public.seo_radar_runs (started_at DESC);

-- ------------------------------------------------------------
-- 候選詞池
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seo_keyword_ideas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_profile_id    text NOT NULL
                        REFERENCES public.webandsystem_list(id) ON DELETE CASCADE,
  keyword               text NOT NULL,
  normalized_keyword    text NOT NULL,
  source                text NOT NULL
                        CHECK (source IN ('gsc', 'suggest')),
  market_code           text NOT NULL
                        CHECK (market_code IN ('hk', 'tw', 'sg', 'my', 'us')),
  language_code         text NOT NULL,
  impressions           integer NOT NULL DEFAULT 0,
  clicks                integer NOT NULL DEFAULT 0,
  ctr                   numeric,
  avg_position          numeric,
  seed_keyword          text,
  score                 numeric NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'adopted', 'ignored')),
  -- 注意：production 的 seo_keywords.id 是 text（不是 repo 舊 migration 寫的 uuid），
  -- 這欄必須同型別，否則 FK 建不起來（42804）。
  adopted_keyword_id    text REFERENCES public.seo_keywords(id) ON DELETE SET NULL,
  run_id                uuid REFERENCES public.seo_radar_runs(id) ON DELETE SET NULL,
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (website_profile_id, market_code, normalized_keyword)
);

CREATE INDEX IF NOT EXISTS seo_ideas_site_status_idx
  ON public.seo_keyword_ideas (website_profile_id, status);
CREATE INDEX IF NOT EXISTS seo_ideas_site_score_idx
  ON public.seo_keyword_ideas (website_profile_id, score DESC);
CREATE INDEX IF NOT EXISTS seo_ideas_last_seen_idx
  ON public.seo_keyword_ideas (last_seen_at DESC);

-- ------------------------------------------------------------
-- RLS：兩張表都只開放 SELECT（anon + authenticated，與 seo_keywords 一致）
-- 不建 INSERT / UPDATE / DELETE policy → 寫入只能經 service_role
-- ------------------------------------------------------------
ALTER TABLE public.seo_radar_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_keyword_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on seo_radar_runs"
  ON public.seo_radar_runs FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow select on seo_keyword_ideas"
  ON public.seo_keyword_ideas FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.seo_radar_runs TO anon, authenticated;
GRANT SELECT ON public.seo_keyword_ideas TO anon, authenticated;
GRANT ALL ON public.seo_radar_runs TO service_role;
GRANT ALL ON public.seo_keyword_ideas TO service_role;
