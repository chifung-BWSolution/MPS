-- 一次性回填：只貼了標題的熱點，用已生成文章的首段補上摘要（讓看板卡片有「標題 + 註釋」）
-- 只影響 summary 仍是 NULL 的熱點，不動已有人工摘要的資料。

UPDATE public.content_hot_events AS event
SET summary = (
  SELECT left(regexp_replace(post.body_md, '[#*_`>\n]+', ' ', 'g'), 160)
  FROM public.content_social_posts AS post
  WHERE post.event_id = event.id
  ORDER BY post.created_at ASC
  LIMIT 1
)
WHERE event.summary IS NULL
  AND EXISTS (
    SELECT 1 FROM public.content_social_posts AS post WHERE post.event_id = event.id
  );
