-- ============================================================
-- kol_apply — KOL 申請管理（藝人管理 > KOL申請管理）
-- Mirrors kol_profile fields + application / audit workflow.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kol_apply (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identity (same as kol_profile)
  name                  text,
  salutation            text,
  email                 text,
  phone                 text,
  age_group             text,
  birth_month           text,
  residence_area        text,
  work_area             text,
  blog_themes           text[] NOT NULL DEFAULT '{}'::text[],
  specialty             text,
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
  tasting_frequency     text,
  tasting_experience    text,
  model_experience      text,
  on_camera_experience  text,
  wine_club             text,
  cooperation_intent    text,
  available_times       text,
  photo_url             text,
  work_photo_url        text,
  raw_payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Application / audit
  applied_at            timestamptz NOT NULL DEFAULT now(),
  -- pending_review | auto_passed | approved | added_to_db | rejected
  audit_status          text NOT NULL DEFAULT 'pending_review'
    CHECK (audit_status IN ('pending_review', 'auto_passed', 'approved', 'added_to_db', 'rejected')),
  source                text,
  login_code            text,
  review_notes          text,
  reviewed_at           timestamptz,
  reviewed_by           text,
  kol_profile_id        uuid REFERENCES public.kol_profile (id) ON DELETE SET NULL,
  -- System
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kol_apply_applied_idx
  ON public.kol_apply (applied_at DESC);
CREATE INDEX IF NOT EXISTS kol_apply_audit_status_idx
  ON public.kol_apply (audit_status);
CREATE INDEX IF NOT EXISTS kol_apply_name_idx
  ON public.kol_apply (name);
CREATE INDEX IF NOT EXISTS kol_apply_instagram_idx
  ON public.kol_apply (instagram_account);
CREATE INDEX IF NOT EXISTS kol_apply_source_idx
  ON public.kol_apply (source);

ALTER TABLE public.kol_apply ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.kol_apply FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert for authenticated users"
  ON public.kol_apply FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update for authenticated users"
  ON public.kol_apply FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for authenticated users"
  ON public.kol_apply FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_apply TO authenticated;
GRANT ALL ON public.kol_apply TO service_role;

CREATE POLICY "Allow anon select on kol_apply"
  ON public.kol_apply FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on kol_apply"
  ON public.kol_apply FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on kol_apply"
  ON public.kol_apply FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on kol_apply"
  ON public.kol_apply FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_apply TO anon;
