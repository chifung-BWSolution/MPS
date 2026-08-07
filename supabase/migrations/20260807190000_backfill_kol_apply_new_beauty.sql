-- Backfill kol_profile from existing kol_apply rows:
-- Blog 主題 or 專長含 beauty → source_system beauty18 + primary_category (新美容KOL)

-- Helper expressions (inline):
-- has_beauty: blog_themes ~* beauty OR specialty ~* beauty
-- has_food:   blog_themes ~* food|美食 OR specialty ~* food|美食

-- 1) Update profiles already linked from kol_apply
WITH apply_flags AS (
  SELECT
    a.id AS apply_id,
    a.kol_profile_id,
    (
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(a.blog_themes, '{}'::text[])) AS t
        WHERE t ~* 'beauty'
      )
      OR COALESCE(a.specialty, '') ~* 'beauty'
    ) AS has_beauty,
    (
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(a.blog_themes, '{}'::text[])) AS t
        WHERE t ~* 'food|美食'
      )
      OR COALESCE(a.specialty, '') ~* 'food|美食'
    ) AS has_food
  FROM public.kol_apply a
  WHERE a.kol_profile_id IS NOT NULL
),
computed AS (
  SELECT
    kol_profile_id,
    CASE
      WHEN has_beauty AND has_food THEN 'both'
      WHEN has_beauty THEN 'beauty'
      WHEN has_food THEN 'food'
      ELSE 'other'
    END AS primary_category,
    CASE WHEN has_beauty THEN 'beauty18' ELSE 'emailmeform' END AS source_system
  FROM apply_flags
)
UPDATE public.kol_profile p
SET
  primary_category = c.primary_category,
  source_system = c.source_system,
  updated_at = now()
FROM computed c
WHERE p.id = c.kol_profile_id;

-- 2) Update apply-sourced profiles missing kol_apply link
WITH from_apply AS (
  SELECT
    p.id,
    (
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.blog_themes, '{}'::text[])) AS t
        WHERE t ~* 'beauty'
      )
      OR COALESCE(p.specialty, '') ~* 'beauty'
    ) AS has_beauty,
    (
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.blog_themes, '{}'::text[])) AS t
        WHERE t ~* 'food|美食'
      )
      OR COALESCE(p.specialty, '') ~* 'food|美食'
    ) AS has_food
  FROM public.kol_profile p
  WHERE p.source_status = 'from_apply'
     OR (p.raw_payload->>'fromKolApplyId') IS NOT NULL
)
UPDATE public.kol_profile p
SET
  primary_category = CASE
    WHEN f.has_beauty AND f.has_food THEN 'both'
    WHEN f.has_beauty THEN 'beauty'
    WHEN f.has_food THEN 'food'
    ELSE 'other'
  END,
  source_system = CASE WHEN f.has_beauty THEN 'beauty18' ELSE 'emailmeform' END,
  updated_at = now()
FROM from_apply f
WHERE p.id = f.id;

-- 3) Insert missing kol_profile for approved apply rows (not yet linked)
WITH apply_rows AS (
  SELECT a.*
  FROM public.kol_apply a
  WHERE a.kol_profile_id IS NULL
    AND a.audit_status IN ('added_to_db', 'approved', 'auto_passed')
),
flags AS (
  SELECT
    a.*,
    (
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(a.blog_themes, '{}'::text[])) AS t
        WHERE t ~* 'beauty'
      )
      OR COALESCE(a.specialty, '') ~* 'beauty'
    ) AS has_beauty,
    (
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(a.blog_themes, '{}'::text[])) AS t
        WHERE t ~* 'food|美食'
      )
      OR COALESCE(a.specialty, '') ~* 'food|美食'
    ) AS has_food
  FROM apply_rows a
),
inserted AS (
  INSERT INTO public.kol_profile (
    name, salutation, email, phone, age_group, birth_month,
    residence_area, work_area, blog_themes, specialty,
    instagram_account, instagram_followers, facebook_url, facebook_likes,
    xiaohongshu_url, xiaohongshu_followers, youtube_url, youtube_subscribers,
    openrice_url, openrice_level, blog_url, blog_subscribers,
    other_channels, other_followers, publish_platforms,
    tasting_frequency, tasting_experience, model_experience, on_camera_experience,
    wine_club, cooperation_intent, available_times,
    video_blog_promo, facebook_live_interest,
    photo_url, work_photo_url, raw_payload,
    source_created_at, source_status,
    primary_category, source_system, lifecycle_status
  )
  SELECT
    f.name, f.salutation, f.email, f.phone, f.age_group, f.birth_month,
    f.residence_area, f.work_area, COALESCE(f.blog_themes, '{}'::text[]), f.specialty,
    f.instagram_account, f.instagram_followers, f.facebook_url, f.facebook_likes,
    f.xiaohongshu_url, f.xiaohongshu_followers, f.youtube_url, f.youtube_subscribers,
    f.openrice_url, f.openrice_level, f.blog_url, f.blog_subscribers,
    f.other_channels, f.other_followers, f.publish_platforms,
    f.tasting_frequency, f.tasting_experience, f.model_experience, f.on_camera_experience,
    f.wine_club, f.cooperation_intent, f.available_times,
    f.video_blog_promo, f.facebook_live_interest,
    f.photo_url, f.work_photo_url,
    COALESCE(f.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'fromKolApplyId', f.id::text,
      'source', f.source,
      'backfilledAt', now()::text
    ),
    f.applied_at::text, 'from_apply',
    CASE
      WHEN f.has_beauty AND f.has_food THEN 'both'
      WHEN f.has_beauty THEN 'beauty'
      WHEN f.has_food THEN 'food'
      ELSE 'other'
    END,
    CASE WHEN f.has_beauty THEN 'beauty18' ELSE 'emailmeform' END,
    'unprocessed'
  FROM flags f
  RETURNING id, (raw_payload->>'fromKolApplyId')::uuid AS apply_id
)
UPDATE public.kol_apply a
SET
  kol_profile_id = i.id,
  audit_status = 'added_to_db',
  updated_at = now()
FROM inserted i
WHERE a.id = i.apply_id;
