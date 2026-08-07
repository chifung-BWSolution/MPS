-- Backfill kol_new_beauty from existing kol_apply rows:
-- Blog 主題 or 專長含 beauty|美麗|美容 → kol_new_beauty（新美容KOL）
-- Targets approved apply rows not yet linked via kol_new_beauty_id.

-- 1) Move beauty-linked kol_profile rows (from old approve path) into kol_new_beauty
WITH beauty_apply AS (
  SELECT
    a.id AS apply_id,
    a.kol_profile_id,
    (
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(a.blog_themes, '{}'::text[])) AS t
        WHERE t ~* 'beauty|美麗|美容'
      )
      OR COALESCE(a.specialty, '') ~* 'beauty|美麗|美容'
    ) AS has_beauty,
    (
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(a.blog_themes, '{}'::text[])) AS t
        WHERE t ~* 'food|美食'
      )
      OR COALESCE(a.specialty, '') ~* 'food|美食'
    ) AS has_food
  FROM public.kol_apply a
  WHERE a.kol_new_beauty_id IS NULL
    AND a.kol_profile_id IS NOT NULL
    AND a.audit_status IN ('added_to_db', 'approved', 'auto_passed')
),
to_migrate AS (
  SELECT ba.*
  FROM beauty_apply ba
  WHERE ba.has_beauty
    AND NOT EXISTS (
      SELECT 1 FROM public.kol_new_beauty nb WHERE nb.id = ba.kol_profile_id
    )
),
inserted_from_profile AS (
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
    COALESCE(p.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'fromKolApplyId', tm.apply_id::text,
      'backfilledToNewBeautyAt', now()::text
    ),
    p.created_at, p.updated_at,
    CASE
      WHEN tm.has_beauty AND tm.has_food THEN 'both'
      WHEN tm.has_beauty THEN 'beauty'
      WHEN tm.has_food THEN 'food'
      ELSE p.primary_category
    END,
    'beauty18',
    COALESCE(p.lifecycle_status, 'unprocessed'),
    p.tags, p.fee_standard, p.recognized_at, p.recognized_by,
    p.shortlist_at, p.meeting_at, p.meeting_location, p.meeting_notes, p.meeting_status,
    p.cooperated_at, p.rating_avg, p.rating_count, p.last_rated_at, p.meeting_owner,
    tm.apply_id
  FROM to_migrate tm
  JOIN public.kol_profile p ON p.id = tm.kol_profile_id
  ON CONFLICT (id) DO NOTHING
  RETURNING id, kol_apply_id
)
UPDATE public.kol_apply a
SET
  kol_new_beauty_id = i.id,
  kol_profile_id = NULL,
  audit_status = 'added_to_db',
  updated_at = now()
FROM inserted_from_profile i
WHERE a.id = i.kol_apply_id;

-- Link applies whose profile was already migrated to kol_new_beauty (same id)
UPDATE public.kol_apply a
SET
  kol_new_beauty_id = nb.id,
  kol_profile_id = NULL,
  updated_at = now()
FROM public.kol_new_beauty nb
WHERE a.kol_new_beauty_id IS NULL
  AND a.kol_profile_id = nb.id
  AND a.audit_status IN ('added_to_db', 'approved', 'auto_passed');

-- 2) Insert directly from kol_apply when no profile link yet
WITH apply_rows AS (
  SELECT a.*
  FROM public.kol_apply a
  WHERE a.kol_new_beauty_id IS NULL
    AND a.kol_profile_id IS NULL
    AND a.audit_status IN ('added_to_db', 'approved', 'auto_passed')
    AND (
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(a.blog_themes, '{}'::text[])) AS t
        WHERE t ~* 'beauty|美麗|美容'
      )
      OR COALESCE(a.specialty, '') ~* 'beauty|美麗|美容'
    )
),
flags AS (
  SELECT
    a.*,
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
  INSERT INTO public.kol_new_beauty (
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
    primary_category, source_system, lifecycle_status,
    kol_apply_id
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
      'backfilledToNewBeautyAt', now()::text
    ),
    f.applied_at::text, 'from_apply',
    CASE WHEN f.has_food THEN 'both' ELSE 'beauty' END,
    'beauty18',
    'unprocessed',
    f.id
  FROM flags f
  RETURNING id, kol_apply_id
)
UPDATE public.kol_apply a
SET
  kol_new_beauty_id = i.id,
  audit_status = 'added_to_db',
  updated_at = now()
FROM inserted i
WHERE a.id = i.kol_apply_id;

-- 3) Re-link by kol_apply_id on kol_new_beauty when apply row missed update
UPDATE public.kol_apply a
SET
  kol_new_beauty_id = nb.id,
  kol_profile_id = NULL,
  updated_at = now()
FROM public.kol_new_beauty nb
WHERE a.kol_new_beauty_id IS NULL
  AND nb.kol_apply_id = a.id
  AND a.audit_status IN ('added_to_db', 'approved', 'auto_passed');

-- 4) Clean up: remove beauty apply copies still sitting in kol_profile
UPDATE public.kol_rating r
SET kol_new_beauty_id = nb.id, kol_profile_id = NULL
FROM public.kol_new_beauty nb
WHERE r.kol_profile_id = nb.id AND r.kol_new_beauty_id IS NULL;

UPDATE public.kol_cooperation c
SET kol_new_beauty_id = nb.id, kol_profile_id = NULL
FROM public.kol_new_beauty nb
WHERE c.kol_profile_id = nb.id AND c.kol_new_beauty_id IS NULL;

DELETE FROM public.kol_profile p
WHERE EXISTS (
  SELECT 1 FROM public.kol_new_beauty nb WHERE nb.id = p.id
);
