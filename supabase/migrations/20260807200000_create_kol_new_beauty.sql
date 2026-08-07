-- ============================================================
-- kol_new_beauty — 新美容KOL 獨立表（藝人管理 > 新美容KOL）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kol_new_beauty (
  LIKE public.kol_profile INCLUDING DEFAULTS
);

ALTER TABLE public.kol_new_beauty
  ADD PRIMARY KEY (id);

ALTER TABLE public.kol_new_beauty
  ADD COLUMN IF NOT EXISTS kol_apply_id uuid REFERENCES public.kol_apply (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS kol_new_beauty_apply_idx
  ON public.kol_new_beauty (kol_apply_id);
CREATE INDEX IF NOT EXISTS kol_new_beauty_lifecycle_idx
  ON public.kol_new_beauty (lifecycle_status);
CREATE INDEX IF NOT EXISTS kol_new_beauty_created_idx
  ON public.kol_new_beauty (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS kol_new_beauty_phone_unique_ci
  ON public.kol_new_beauty (lower(phone))
  WHERE phone IS NOT NULL AND btrim(phone) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS kol_new_beauty_email_unique_ci
  ON public.kol_new_beauty (lower(email))
  WHERE email IS NOT NULL AND btrim(email) <> '';

ALTER TABLE public.kol_new_beauty ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users on kol_new_beauty"
  ON public.kol_new_beauty FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated users on kol_new_beauty"
  ON public.kol_new_beauty FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated users on kol_new_beauty"
  ON public.kol_new_beauty FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated users on kol_new_beauty"
  ON public.kol_new_beauty FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select on kol_new_beauty"
  ON public.kol_new_beauty FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on kol_new_beauty"
  ON public.kol_new_beauty FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on kol_new_beauty"
  ON public.kol_new_beauty FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on kol_new_beauty"
  ON public.kol_new_beauty FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_new_beauty TO authenticated, anon;
GRANT ALL ON public.kol_new_beauty TO service_role;

-- kol_apply → kol_new_beauty link
ALTER TABLE public.kol_apply
  ADD COLUMN IF NOT EXISTS kol_new_beauty_id uuid REFERENCES public.kol_new_beauty (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS kol_apply_new_beauty_idx
  ON public.kol_apply (kol_new_beauty_id);

-- kol_rating / kol_cooperation support new-beauty rows
ALTER TABLE public.kol_rating
  ALTER COLUMN kol_profile_id DROP NOT NULL;

ALTER TABLE public.kol_rating
  ADD COLUMN IF NOT EXISTS kol_new_beauty_id uuid REFERENCES public.kol_new_beauty (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS kol_rating_new_beauty_idx
  ON public.kol_rating (kol_new_beauty_id, created_at DESC);

ALTER TABLE public.kol_cooperation
  ALTER COLUMN kol_profile_id DROP NOT NULL;

ALTER TABLE public.kol_cooperation
  ADD COLUMN IF NOT EXISTS kol_new_beauty_id uuid REFERENCES public.kol_new_beauty (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS kol_cooperation_new_beauty_idx
  ON public.kol_cooperation (kol_new_beauty_id, cooperated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kol_rating_owner_check'
  ) THEN
    ALTER TABLE public.kol_rating
      ADD CONSTRAINT kol_rating_owner_check CHECK (
        kol_profile_id IS NOT NULL OR kol_new_beauty_id IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kol_cooperation_owner_check'
  ) THEN
    ALTER TABLE public.kol_cooperation
      ADD CONSTRAINT kol_cooperation_owner_check CHECK (
        kol_profile_id IS NOT NULL OR kol_new_beauty_id IS NOT NULL
      );
  END IF;
END $$;

-- Migrate existing beauty18 rows from kol_profile
INSERT INTO public.kol_new_beauty (
  id, name, salutation, email, phone, age_group, birth_month,
  residence_area, work_area, blog_themes, specialty,
  instagram_account, instagram_followers, facebook_url, facebook_likes,
  xiaohongshu_url, xiaohongshu_followers, youtube_url, youtube_subscribers,
  openrice_url, openrice_level, blog_url, blog_subscribers,
  other_channels, other_followers, publish_platforms,
  tasting_frequency, tasting_experience, model_experience, on_camera_experience,
  wine_club, cooperation_intent, available_times,
  video_blog_promo, facebook_live_interest,
  photo_url, work_photo_url, entry_number, source_status,
  source_created_at, referrer_url, raw_payload,
  created_at, updated_at,
  primary_category, source_system, lifecycle_status, tags,
  fee_standard, recognized_at, recognized_by,
  shortlist_at, meeting_at, meeting_location, meeting_notes, meeting_status,
  cooperated_at, rating_avg, rating_count, last_rated_at, meeting_owner,
  kol_apply_id
)
SELECT
  p.id, p.name, p.salutation, p.email, p.phone, p.age_group, p.birth_month,
  p.residence_area, p.work_area, p.blog_themes, p.specialty,
  p.instagram_account, p.instagram_followers, p.facebook_url, p.facebook_likes,
  p.xiaohongshu_url, p.xiaohongshu_followers, p.youtube_url, p.youtube_subscribers,
  p.openrice_url, p.openrice_level, p.blog_url, p.blog_subscribers,
  p.other_channels, p.other_followers, p.publish_platforms,
  p.tasting_frequency, p.tasting_experience, p.model_experience, p.on_camera_experience,
  p.wine_club, p.cooperation_intent, p.available_times,
  p.video_blog_promo, p.facebook_live_interest,
  p.photo_url, p.work_photo_url, p.entry_number, p.source_status,
  p.source_created_at, p.referrer_url,
  COALESCE(p.raw_payload, '{}'::jsonb) || jsonb_build_object('migratedProfileId', p.id::text),
  p.created_at, p.updated_at,
  p.primary_category, p.source_system, p.lifecycle_status, p.tags,
  p.fee_standard, p.recognized_at, p.recognized_by,
  p.shortlist_at, p.meeting_at, p.meeting_location, p.meeting_notes, p.meeting_status,
  p.cooperated_at, p.rating_avg, p.rating_count, p.last_rated_at, p.meeting_owner,
  NULLIF(p.raw_payload->>'fromKolApplyId', '')::uuid
FROM public.kol_profile p
WHERE p.source_system = 'beauty18'
ON CONFLICT (id) DO NOTHING;

UPDATE public.kol_apply a
SET
  kol_new_beauty_id = nb.id,
  kol_profile_id = NULL,
  updated_at = now()
FROM public.kol_new_beauty nb
WHERE a.kol_profile_id = nb.id
   OR (
     a.id = nb.kol_apply_id
     AND nb.kol_apply_id IS NOT NULL
   );

UPDATE public.kol_rating r
SET
  kol_new_beauty_id = nb.id,
  kol_profile_id = NULL
FROM public.kol_new_beauty nb
WHERE r.kol_profile_id = nb.id;

UPDATE public.kol_cooperation c
SET
  kol_new_beauty_id = nb.id,
  kol_profile_id = NULL
FROM public.kol_new_beauty nb
WHERE c.kol_profile_id = nb.id;

DELETE FROM public.kol_profile
WHERE source_system = 'beauty18';
