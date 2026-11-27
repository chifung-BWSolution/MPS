-- ============================================================
-- 熱點雷達：列表第一頁用的只讀 view
--
-- 前端一次只取 30 筆。排序鍵對齊 src/lib/hotspotRadar.ts 的 compareBySort，
-- 也對齊 src/lib/hotspotFeed.ts 的 feedSortTuple。改 CASE 要三邊一起改。
--
-- security_invoker：查詢者的 RLS 照舊作用在 hotspot_items / hotspot_favorites
-- （authenticated 只讀）。不要改成 security definer，否則會繞過 RLS。
-- ============================================================

CREATE OR REPLACE VIEW public.hotspot_feed
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.platform,
  i.source_kind,
  i.target_id,
  i.external_id,
  i.url,
  i.media_type,
  i.caption,
  i.thumbnail_url,
  i.author_handle,
  i.author_name,
  i.author_followers,
  i.posted_at,
  i.likes,
  i.comments,
  i.plays,
  i.engagement,
  i.account_median_engagement,
  i.relative_heat,
  i.sample_size,
  i.low_sample,
  i.ad_started_at,
  i.ad_active_days,
  i.ad_status,
  i.first_seen_at,
  i.last_seen_at,
  i.captured_at,
  i.raw,
  f.id AS favorite_id,
  f.status AS favorite_status,
  f.note AS favorite_note,
  f.created_by AS favorite_created_by,
  f.created_at AS favorite_created_at,
  f.updated_at AS favorite_updated_at,
  -- 相對熱度分層：≥3 → 0；≥2 → 1；≥1.5 → 2；其餘（含 NULL）→ 3
  CASE
    WHEN i.relative_heat >= 3 THEN 0
    WHEN i.relative_heat >= 2 THEN 1
    WHEN i.relative_heat >= 1.5 THEN 2
    ELSE 3
  END::smallint AS heat_layer,
  CASE WHEN i.source_kind = 'ad_keyword' THEN 1 ELSE 0 END::smallint AS ad_rank,
  -- 綜合排序第三鍵：廣告比投放天數（NULL 當 0），自然內容比互動
  CASE
    WHEN i.source_kind = 'ad_keyword' THEN COALESCE(i.ad_active_days, 0)
    ELSE i.engagement
  END AS rank_metric,
  -- 相對熱度：兩邊都是 NULL 時只比 id。NULL 的 tie 固定為 0，非 NULL 才用互動。
  CASE
    WHEN i.relative_heat IS NULL THEN 0
    ELSE i.engagement
  END AS relative_tie
FROM public.hotspot_items i
LEFT JOIN public.hotspot_favorites f ON f.item_id = i.id;

COMMENT ON VIEW public.hotspot_feed IS
  '熱點雷達列表。排序鍵對齊 compareBySort；security_invoker 沿用底表 RLS。';

REVOKE ALL ON public.hotspot_feed FROM PUBLIC, anon;
GRANT SELECT ON public.hotspot_feed TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
