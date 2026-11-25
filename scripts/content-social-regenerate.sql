-- 刪除接模型前產生的模板稿（10 篇），並把對應熱點重設為待處理，
-- 讓 Grok 立即重新生成。只刪 generator='template'，AI 稿與已發佈紀錄不受影響。

-- 1) 先把這些熱點放回待處理（否則自動掃描不會再處理 status='used' 的熱點）
UPDATE public.content_hot_events AS event
SET status = 'open'
WHERE event.id IN (
  SELECT DISTINCT post.event_id
  FROM public.content_social_posts AS post
  WHERE post.generator = 'template' AND post.event_id IS NOT NULL
);

-- 2) 刪除模板稿；targets 由 FK ON DELETE CASCADE 一併清掉
DELETE FROM public.content_social_posts
WHERE generator = 'template';

-- 3) 檢查
SELECT
  (SELECT count(*) FROM public.content_social_posts) AS posts_left,
  (SELECT count(*) FROM public.content_social_posts WHERE generator = 'grok') AS grok_posts,
  (SELECT count(*) FROM public.content_hot_events WHERE status = 'open') AS open_events;
