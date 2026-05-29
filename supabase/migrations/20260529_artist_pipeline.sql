-- ============================================================
-- Artist Pipeline:
--   talent_form.status   — pending | confirmed | rejected
--   confirmed_artist     — accepted artists shown on 藝人列表
--   rejected_artist      — rejected submissions for audit / re-review
-- ============================================================

-- ------------------------------------------------------------
-- 1) talent_form columns — drive the 面試安排 page
--    status            : pending | confirmed | rejected
--    interviewed       : whether the artist has been interviewed/rated
--    interview_rating  : per-dimension scores (jsonb)
--    interview_overall : average score (numeric 1-10)
--    interview_notes   : free-text notes from the rating modal
--    interview_scheduled_at : optional planned date
-- ------------------------------------------------------------
ALTER TABLE public.talent_form
  ADD COLUMN IF NOT EXISTS status                 text          NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS interviewed            boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS interview_rating       jsonb,
  ADD COLUMN IF NOT EXISTS interview_overall      numeric(3,1),
  ADD COLUMN IF NOT EXISTS interview_notes        text,
  ADD COLUMN IF NOT EXISTS interview_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS audition_media_urls    text[]        NOT NULL DEFAULT '{}'::text[];

-- Backfill any existing rows that pre-date the columns (defensive — defaults
-- already cover fresh inserts).
UPDATE public.talent_form SET status = 'pending'    WHERE status IS NULL;
UPDATE public.talent_form SET interviewed = false   WHERE interviewed IS NULL;

CREATE INDEX IF NOT EXISTS talent_form_status_idx
  ON public.talent_form (status);
CREATE INDEX IF NOT EXISTS talent_form_interviewed_idx
  ON public.talent_form (interviewed);

-- ------------------------------------------------------------
-- 2) confirmed_artist — every entry on 藝人列表 (accepted talents)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.confirmed_artist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Source linkage (nullable so manually-added artists are also supported)
  source_form_id  uuid REFERENCES public.talent_form (id) ON DELETE SET NULL,
  invite_token    text,
  -- Display fields
  name_zh         text,
  name_en         text,
  gender          text,
  age             text,
  phone           text,
  wechat          text,
  height          text,
  weight          text,
  region          text,
  photo_url       text,
  -- Multi-select categories
  -- (subset of 'photo_model' | 'event_model' | 'host' | 'vo' | 'self_media')
  categories      text[] NOT NULL DEFAULT '{}'::text[],
  -- Interview / rating snapshot at the moment of confirmation
  rating          jsonb,
  overall_rating  numeric(3,1),
  interview_notes text,
  -- Original full self-fill payload + signature, kept for the artist record
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_image text,
  -- Source path: 'direct' (直接取錄 from 未見面) | 'after_interview' (從已面試取錄)
  source          text NOT NULL DEFAULT 'direct',
  confirmed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS confirmed_artist_confirmed_idx
  ON public.confirmed_artist (confirmed_at DESC);

CREATE INDEX IF NOT EXISTS confirmed_artist_source_form_idx
  ON public.confirmed_artist (source_form_id);

ALTER TABLE public.confirmed_artist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.confirmed_artist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated users"
  ON public.confirmed_artist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated users"
  ON public.confirmed_artist FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated users"
  ON public.confirmed_artist FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.confirmed_artist TO authenticated;
GRANT ALL ON public.confirmed_artist TO service_role;

-- ------------------------------------------------------------
-- 3) rejected_artist — submissions marked 不會取錄
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rejected_artist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_form_id  uuid REFERENCES public.talent_form (id) ON DELETE SET NULL,
  invite_token    text,
  name_zh         text,
  name_en         text,
  phone           text,
  -- Snapshot of the submission at rejection time so audit survives
  -- even if the underlying talent_form row is later purged.
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_image text,
  reason          text,
  source          text NOT NULL DEFAULT 'direct', -- 'direct' | 'after_interview'
  rejected_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rejected_artist_rejected_idx
  ON public.rejected_artist (rejected_at DESC);

CREATE INDEX IF NOT EXISTS rejected_artist_source_form_idx
  ON public.rejected_artist (source_form_id);

ALTER TABLE public.rejected_artist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.rejected_artist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated users"
  ON public.rejected_artist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated users"
  ON public.rejected_artist FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated users"
  ON public.rejected_artist FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rejected_artist TO authenticated;
GRANT ALL ON public.rejected_artist TO service_role;
