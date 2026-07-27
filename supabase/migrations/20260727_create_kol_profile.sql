-- ============================================================
-- kol_profile — Food blogger / KOL database for 藝人管理 > KOL列表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kol_profile (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identity
  name                  text,
  salutation            text,
  email                 text,
  phone                 text,
  -- Filters
  age_group             text,
  birth_month           text,
  residence_area        text,
  work_area             text,
  -- Themes
  blog_themes           text[] NOT NULL DEFAULT '{}'::text[],
  specialty             text,
  -- Platforms
  instagram_account     text,
  instagram_followers   integer,
  facebook_url          text,
  facebook_likes        integer,
  xiaohongshu_url       text,
  xiaohongshu_followers integer,
  youtube_url           text,
  youtube_subscribers   integer,
  openrice_url          text,
  openrice_level        text,
  blog_url              text,
  blog_subscribers      integer,
  other_channels        text,
  other_followers       integer,
  publish_platforms     text,
  -- Tasting / cooperation
  tasting_frequency     text,
  tasting_experience    text,
  model_experience      text,
  on_camera_experience  text,
  wine_club             text,
  cooperation_intent    text,
  available_times       text,
  -- Display
  photo_url             text,
  work_photo_url        text,
  -- Source metadata
  entry_number          text,
  source_status         text,
  source_created_at     text,
  referrer_url          text,
  raw_payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- System
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kol_profile_name_idx
  ON public.kol_profile (name);
CREATE INDEX IF NOT EXISTS kol_profile_instagram_idx
  ON public.kol_profile (instagram_account);
CREATE INDEX IF NOT EXISTS kol_profile_age_group_idx
  ON public.kol_profile (age_group);
CREATE INDEX IF NOT EXISTS kol_profile_instagram_followers_idx
  ON public.kol_profile (instagram_followers);
CREATE INDEX IF NOT EXISTS kol_profile_created_idx
  ON public.kol_profile (created_at DESC);

-- Dedup: phone / email (case-insensitive, ignore null/blank)
CREATE UNIQUE INDEX IF NOT EXISTS kol_profile_phone_unique_ci
  ON public.kol_profile (lower(phone))
  WHERE phone IS NOT NULL AND btrim(phone) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS kol_profile_email_unique_ci
  ON public.kol_profile (lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

ALTER TABLE public.kol_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.kol_profile FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated users"
  ON public.kol_profile FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated users"
  ON public.kol_profile FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated users"
  ON public.kol_profile FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_profile TO authenticated;
GRANT ALL ON public.kol_profile TO service_role;

-- Anon policies (app uses anon key without Supabase Auth session)
CREATE POLICY "Allow anon select on kol_profile"
  ON public.kol_profile FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on kol_profile"
  ON public.kol_profile FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on kol_profile"
  ON public.kol_profile FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on kol_profile"
  ON public.kol_profile FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_profile TO anon;
