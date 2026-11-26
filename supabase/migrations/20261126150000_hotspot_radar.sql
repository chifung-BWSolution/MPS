-- ============================================================
-- 熱點雷達：5 張表 + 索引 + 只讀 RLS
--
-- 純新增：不改任何既有表／policy／grant；不刪任何既有資料。
-- 只有 hotspot_settings 會插入 1 列預設值（on conflict do nothing，可重跑）。
--
-- 推送前必做（PRD §5.9）：
--   select table_name, column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name in ('brand_list','users') and column_name='id';
--   若 brand_list.id 不是 uuid → 本檔的 brand_id 要改成 text；users.id 同理。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hotspot_targets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL CHECK (kind IN ('account', 'hashtag', 'ad_keyword')),
  platform          text NOT NULL DEFAULT 'instagram'
                    CHECK (platform IN ('instagram', 'facebook')),
  value             text NOT NULL,
  -- 唯一鍵用這一欄（不用 lower(value) 表達式）：Postgres 的 UNIQUE 約束
  -- 不接受表達式，且 PostgREST upsert(onConflict:) 只認欄位名。
  value_normalized  text NOT NULL,
  label             text,
  -- brand_list.id 在 20260807 之後是 uuid；production 若仍為 text，此欄必須改 text（42804）
  brand_id          uuid REFERENCES public.brand_list(id) ON DELETE SET NULL,
  active            boolean NOT NULL DEFAULT true,
  notes             text,
  last_fetched_at   timestamptz,
  last_error        text,
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotspot_targets_unique_value UNIQUE (kind, platform, value_normalized)
);

CREATE INDEX IF NOT EXISTS hotspot_targets_active_idx
  ON public.hotspot_targets (active, kind);

CREATE TABLE IF NOT EXISTS public.hotspot_items (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform                    text NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  source_kind                 text NOT NULL
                              CHECK (source_kind IN ('account', 'hashtag', 'ad_keyword')),
  target_id                   uuid REFERENCES public.hotspot_targets(id) ON DELETE SET NULL,
  external_id                 text NOT NULL,
  url                         text NOT NULL,
  media_type                  text NOT NULL DEFAULT 'unknown'
                              CHECK (media_type IN ('reel', 'video', 'image', 'carousel', 'ad', 'unknown')),
  caption                     text,
  thumbnail_url               text,
  author_handle               text,
  author_name                 text,
  author_followers            integer CHECK (author_followers IS NULL OR author_followers >= 0),
  posted_at                   timestamptz,
  likes                       integer NOT NULL DEFAULT 0 CHECK (likes >= 0),
  comments                    integer NOT NULL DEFAULT 0 CHECK (comments >= 0),
  plays                       integer CHECK (plays IS NULL OR plays >= 0),
  engagement                  integer NOT NULL DEFAULT 0 CHECK (engagement >= 0),
  account_median_engagement   numeric(12, 2),
  relative_heat               numeric(8, 2) CHECK (relative_heat IS NULL OR relative_heat >= 0),
  sample_size                 integer NOT NULL DEFAULT 0,
  low_sample                  boolean NOT NULL DEFAULT false,
  ad_started_at               date,
  ad_active_days              integer CHECK (ad_active_days IS NULL OR ad_active_days >= 0),
  ad_status                   text,
  first_seen_at               timestamptz NOT NULL DEFAULT now(),
  last_seen_at                timestamptz NOT NULL DEFAULT now(),
  captured_at                 timestamptz NOT NULL DEFAULT now(),
  raw                         jsonb,
  CONSTRAINT hotspot_items_unique_external UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS hotspot_items_kind_engagement_idx
  ON public.hotspot_items (source_kind, engagement DESC);
CREATE INDEX IF NOT EXISTS hotspot_items_relative_heat_idx
  ON public.hotspot_items (relative_heat DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS hotspot_items_posted_idx
  ON public.hotspot_items (posted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS hotspot_items_target_idx
  ON public.hotspot_items (target_id);
CREATE INDEX IF NOT EXISTS hotspot_items_last_seen_idx
  ON public.hotspot_items (last_seen_at);

CREATE TABLE IF NOT EXISTS public.hotspot_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.hotspot_items(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'used', 'dropped')),
  note        text,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotspot_favorites_unique_item UNIQUE (item_id),
  CONSTRAINT hotspot_favorites_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS hotspot_favorites_status_idx
  ON public.hotspot_favorites (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.hotspot_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger         text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'cron')),
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'success', 'error')),
  targets_fetched integer NOT NULL DEFAULT 0,
  items_new       integer NOT NULL DEFAULT 0,
  items_upserted  integer NOT NULL DEFAULT 0,
  api_calls       integer NOT NULL DEFAULT 0,
  cost_usd        numeric(10, 4) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  error_message   text,
  meta            jsonb,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS hotspot_runs_started_idx
  ON public.hotspot_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.hotspot_settings (
  id                  text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  auto_daily          boolean NOT NULL DEFAULT true,
  monthly_budget_usd  numeric(10, 2) NOT NULL DEFAULT 40 CHECK (monthly_budget_usd >= 0),
  min_engagement      integer NOT NULL DEFAULT 300 CHECK (min_engagement >= 0),
  items_per_target    integer NOT NULL DEFAULT 20 CHECK (items_per_target BETWEEN 1 AND 50),
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.hotspot_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- RLS：5 張表只開 SELECT（只給 authenticated，不給 anon）
-- 不建任何寫入 policy → 寫入只能經 Edge Function（service_role）
-- 收藏備註與月費屬內部資料，因此不像 seo_radar 那樣開放 anon。
-- ------------------------------------------------------------
ALTER TABLE public.hotspot_targets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspot_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspot_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspot_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotspot_settings  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hotspot_targets_read"
  ON public.hotspot_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "hotspot_items_read"
  ON public.hotspot_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "hotspot_favorites_read"
  ON public.hotspot_favorites FOR SELECT TO authenticated USING (true);
CREATE POLICY "hotspot_runs_read"
  ON public.hotspot_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "hotspot_settings_read"
  ON public.hotspot_settings FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.hotspot_targets   TO authenticated;
GRANT SELECT ON public.hotspot_items     TO authenticated;
GRANT SELECT ON public.hotspot_favorites TO authenticated;
GRANT SELECT ON public.hotspot_runs      TO authenticated;
GRANT SELECT ON public.hotspot_settings  TO authenticated;

GRANT ALL ON public.hotspot_targets   TO service_role;
GRANT ALL ON public.hotspot_items     TO service_role;
GRANT ALL ON public.hotspot_favorites TO service_role;
GRANT ALL ON public.hotspot_runs      TO service_role;
GRANT ALL ON public.hotspot_settings  TO service_role;
