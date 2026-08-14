-- Normalize vchannel_accounts.platform to the same keys as vchannels.platform_status.

UPDATE public.vchannel_accounts
SET
  platform = CASE
    WHEN lower(btrim(platform)) IN ('youtube', 'yt') THEN 'youtube'
    WHEN lower(btrim(platform)) IN ('instagram', 'ig', 'ig page', 'igpage') THEN 'instagram'
    WHEN lower(btrim(platform)) IN ('facebook', 'fb', 'facebook page', 'facebookpage') THEN 'facebook'
    WHEN btrim(platform) IN ('小紅書')
      OR lower(btrim(platform)) IN ('xiaohongshu', 'xhs') THEN 'xiaohongshu'
    WHEN btrim(platform) IN ('微信視頻號', 'WeChat視頻號', '視頻號')
      OR lower(replace(replace(btrim(platform), ' ', ''), '_', '')) IN (
        'wechat', 'wechatchannels', 'wechat視頻號'
      ) THEN 'wechat_channels'
    WHEN btrim(platform) IN ('抖音號', '抖音')
      OR lower(btrim(platform)) IN ('douyin') THEN 'douyin'
    WHEN lower(btrim(platform)) IN ('threads') THEN 'threads'
    WHEN lower(btrim(platform)) IN ('linkedin') THEN 'linkedin'
    ELSE btrim(platform)
  END,
  updated_at = now()
WHERE platform IS DISTINCT FROM (
  CASE
    WHEN lower(btrim(platform)) IN ('youtube', 'yt') THEN 'youtube'
    WHEN lower(btrim(platform)) IN ('instagram', 'ig', 'ig page', 'igpage') THEN 'instagram'
    WHEN lower(btrim(platform)) IN ('facebook', 'fb', 'facebook page', 'facebookpage') THEN 'facebook'
    WHEN btrim(platform) IN ('小紅書')
      OR lower(btrim(platform)) IN ('xiaohongshu', 'xhs') THEN 'xiaohongshu'
    WHEN btrim(platform) IN ('微信視頻號', 'WeChat視頻號', '視頻號')
      OR lower(replace(replace(btrim(platform), ' ', ''), '_', '')) IN (
        'wechat', 'wechatchannels', 'wechat視頻號'
      ) THEN 'wechat_channels'
    WHEN btrim(platform) IN ('抖音號', '抖音')
      OR lower(btrim(platform)) IN ('douyin') THEN 'douyin'
    WHEN lower(btrim(platform)) IN ('threads') THEN 'threads'
    WHEN lower(btrim(platform)) IN ('linkedin') THEN 'linkedin'
    ELSE btrim(platform)
  END
);

ALTER TABLE public.vchannel_accounts
  DROP CONSTRAINT IF EXISTS vchannel_accounts_platform_check;

ALTER TABLE public.vchannel_accounts
  ADD CONSTRAINT vchannel_accounts_platform_check
  CHECK (platform IN (
    'youtube',
    'instagram',
    'facebook',
    'xiaohongshu',
    'wechat_channels',
    'douyin',
    'threads',
    'linkedin'
  ));
