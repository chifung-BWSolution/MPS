-- ============================================================
-- kol_rating + kol_cooperation — P3/P5 KOL workflow extensions
-- ============================================================

ALTER TABLE public.kol_profile
  ADD COLUMN IF NOT EXISTS rating_avg numeric(4,2),
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_rated_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_owner text;

CREATE INDEX IF NOT EXISTS kol_profile_tags_gin_idx
  ON public.kol_profile USING GIN (tags);

CREATE TABLE IF NOT EXISTS public.kol_rating (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_profile_id        uuid NOT NULL REFERENCES public.kol_profile(id) ON DELETE CASCADE,
  rated_by              text,
  score_professionalism smallint NOT NULL CHECK (score_professionalism BETWEEN 1 AND 5),
  score_cooperation     smallint NOT NULL CHECK (score_cooperation BETWEEN 1 AND 5),
  score_content         smallint NOT NULL CHECK (score_content BETWEEN 1 AND 5),
  score_engagement      smallint NOT NULL CHECK (score_engagement BETWEEN 1 AND 5),
  overall_score         numeric(4,2) NOT NULL,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kol_rating_profile_idx
  ON public.kol_rating (kol_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.kol_cooperation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_profile_id  uuid NOT NULL REFERENCES public.kol_profile(id) ON DELETE CASCADE,
  project_name    text,
  project_type    text,
  fee             text,
  evaluation      text,
  cooperated_at   timestamptz NOT NULL DEFAULT now(),
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kol_cooperation_profile_idx
  ON public.kol_cooperation (kol_profile_id, cooperated_at DESC);

ALTER TABLE public.kol_rating ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kol_cooperation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read kol_rating for authenticated"
  ON public.kol_rating FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write kol_rating for authenticated"
  ON public.kol_rating FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update kol_rating for authenticated"
  ON public.kol_rating FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete kol_rating for authenticated"
  ON public.kol_rating FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow read kol_cooperation for authenticated"
  ON public.kol_cooperation FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write kol_cooperation for authenticated"
  ON public.kol_cooperation FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update kol_cooperation for authenticated"
  ON public.kol_cooperation FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete kol_cooperation for authenticated"
  ON public.kol_cooperation FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select on kol_rating"
  ON public.kol_rating FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on kol_rating"
  ON public.kol_rating FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on kol_rating"
  ON public.kol_rating FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on kol_rating"
  ON public.kol_rating FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anon select on kol_cooperation"
  ON public.kol_cooperation FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on kol_cooperation"
  ON public.kol_cooperation FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on kol_cooperation"
  ON public.kol_cooperation FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on kol_cooperation"
  ON public.kol_cooperation FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_rating TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_cooperation TO authenticated, anon;
GRANT ALL ON public.kol_rating TO service_role;
GRANT ALL ON public.kol_cooperation TO service_role;
