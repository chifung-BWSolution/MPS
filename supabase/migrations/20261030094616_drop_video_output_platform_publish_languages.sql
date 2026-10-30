-- Remove leftover Excel language flags from video_output.platform_publish.
-- zh_cn / zh_tw were checkbox columns (簡體 / 繁體), not publish URLs.

UPDATE public.video_output
SET platform_publish = platform_publish - 'zh_cn' - 'zh_tw'
WHERE jsonb_typeof(platform_publish) = 'object'
  AND (
    platform_publish ? 'zh_cn'
    OR platform_publish ? 'zh_tw'
  );
