-- Backfill: videos with media platforms already published but stuck in earlier workflow stages
UPDATE public.video_output v
SET
  workflow_stage = 'published',
  reviewed = true,
  published_date = COALESCE(v.published_date, v.planned_publish_date),
  updated_at = now()
WHERE v.workflow_stage <> 'published'
  AND (
    (v.platform_publish ->> 'youtube') = 'true'
    OR (v.platform_publish ->> 'instagram') = 'true'
    OR (v.platform_publish ->> 'facebook') = 'true'
    OR (v.platform_publish ->> 'threads') = 'true'
    OR (v.platform_publish ->> 'linkedin') = 'true'
    OR (v.platform_publish ->> 'xiaohongshu') = 'true'
    OR (v.platform_publish ->> 'douyin') = 'true'
    OR (v.platform_publish ->> 'wechat_channels') = 'true'
    OR (v.platform_publish ->> 'wechat_official') = 'true'
    OR COALESCE(NULLIF(v.platform_publish -> 'youtube' ->> 'url', ''), '') <> ''
    OR COALESCE(NULLIF(v.platform_publish -> 'instagram' ->> 'url', ''), '') <> ''
    OR COALESCE(NULLIF(v.platform_publish -> 'facebook' ->> 'url', ''), '') <> ''
    OR COALESCE(NULLIF(v.platform_publish -> 'threads' ->> 'url', ''), '') <> ''
    OR COALESCE(NULLIF(v.platform_publish -> 'linkedin' ->> 'url', ''), '') <> ''
    OR COALESCE(NULLIF(v.platform_publish -> 'xiaohongshu' ->> 'url', ''), '') <> ''
    OR COALESCE(NULLIF(v.platform_publish -> 'douyin' ->> 'url', ''), '') <> ''
    OR COALESCE(NULLIF(v.platform_publish -> 'wechat_channels' ->> 'url', ''), '') <> ''
    OR COALESCE(NULLIF(v.platform_publish -> 'wechat_official' ->> 'url', ''), '') <> ''
  );
