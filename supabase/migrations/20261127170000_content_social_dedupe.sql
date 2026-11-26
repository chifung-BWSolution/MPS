-- ============================================================
-- 社媒自動化營運 · 去重（2026-11-26）
--
-- 問題：一個熱點會被系統產出「每組一篇」——兩個品牌組就是兩篇幾乎一樣的稿，
--       同一帳號（同時在多組）甚至會收到兩份文案。看板上同一件事出現兩張卡。
--
-- 本 migration 只做兩件事：
--   1. 把「已經生成」的重複稿件收斂成一個事件一篇（搬走導流 → 刪掉多餘的稿）
--   2. 加上資料庫層的約束／欄位，讓之後不可能再生成第二篇
--        - content_social_posts.event_id 唯一（同事件只能有一篇稿）
--        - content_hot_events.duplicate_of（記錄「這則熱點被併到哪」）
--        - content_social_posts.content_fingerprint（輸出層去重指紋，供稽核）
--
-- 保留哪一篇（與 src/lib/contentSocialDedupe.ts 的 comparePostForKeep 完全一致）：
--   狀態越先進越優先（published > publishing > scheduled > approved > pending_review
--   > draft > failed/cancelled）→ grok 優先於 template → 導流帳號多者優先
--   → 最早建立者優先 → id 最小者優先
--
-- 可重複執行：每一步都是 if exists／if not exists，或結果為空時不動資料。
-- ============================================================

-- ------------------------------------------------------------
-- 1) 欄位
-- ------------------------------------------------------------
ALTER TABLE public.content_hot_events
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.content_hot_events(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.content_hot_events.duplicate_of IS
  '被判定為重複時，併入的保留事件 id；status=ignored 且此欄非空＝已被合併';

CREATE INDEX IF NOT EXISTS content_hot_events_duplicate_of_idx
  ON public.content_hot_events (duplicate_of)
  WHERE duplicate_of IS NOT NULL;

ALTER TABLE public.content_social_posts
  ADD COLUMN IF NOT EXISTS content_fingerprint text;

COMMENT ON COLUMN public.content_social_posts.content_fingerprint IS
  '輸出層去重指紋：標題 + 正文前 1200 字的 simhash（16 位 hex），供稽核與回填';

-- ------------------------------------------------------------
-- 2) 同一事件多稿 → 收斂成一篇
--    2a. 先把重複稿的導流搬到保留稿（同帳號已存在就跳過）
--    2b. 已發佈狀態優先：保留稿的同帳號導流若是 pending、重複稿已發佈，補上發佈資訊
--    2c. 刪掉重複稿（targets 由 FK ON DELETE CASCADE 一併清掉）
-- ------------------------------------------------------------
WITH ranked AS (
  SELECT
    p.id AS post_id,
    p.event_id,
    row_number() OVER (
      PARTITION BY p.event_id
      ORDER BY
        CASE p.status
          WHEN 'published' THEN 6
          WHEN 'publishing' THEN 5
          WHEN 'scheduled' THEN 4
          WHEN 'approved' THEN 3
          WHEN 'pending_review' THEN 2
          WHEN 'changes_requested' THEN 2
          WHEN 'draft' THEN 1
          ELSE 0
        END DESC,
        CASE WHEN p.generator = 'grok' THEN 0 ELSE 1 END ASC,
        (SELECT count(*) FROM public.content_social_targets t WHERE t.post_id = p.id) DESC,
        p.created_at ASC,
        p.id ASC
    ) AS rn
  FROM public.content_social_posts p
  WHERE p.event_id IS NOT NULL
)
INSERT INTO public.content_social_targets
  (post_id, account_id, copy_text, status, published_url, published_at)
SELECT
  keeper.post_id,
  t.account_id,
  t.copy_text,
  t.status,
  t.published_url,
  t.published_at
FROM public.content_social_targets t
JOIN ranked loser ON loser.post_id = t.post_id AND loser.rn > 1
JOIN ranked keeper ON keeper.event_id = loser.event_id AND keeper.rn = 1
ON CONFLICT (post_id, account_id) DO NOTHING;

WITH ranked AS (
  SELECT
    p.id AS post_id,
    p.event_id,
    row_number() OVER (
      PARTITION BY p.event_id
      ORDER BY
        CASE p.status
          WHEN 'published' THEN 6
          WHEN 'publishing' THEN 5
          WHEN 'scheduled' THEN 4
          WHEN 'approved' THEN 3
          WHEN 'pending_review' THEN 2
          WHEN 'changes_requested' THEN 2
          WHEN 'draft' THEN 1
          ELSE 0
        END DESC,
        CASE WHEN p.generator = 'grok' THEN 0 ELSE 1 END ASC,
        (SELECT count(*) FROM public.content_social_targets t WHERE t.post_id = p.id) DESC,
        p.created_at ASC,
        p.id ASC
    ) AS rn
  FROM public.content_social_posts p
  WHERE p.event_id IS NOT NULL
)
UPDATE public.content_social_targets AS keeper_target
SET
  status = moved.status,
  published_url = coalesce(keeper_target.published_url, moved.published_url),
  published_at = coalesce(keeper_target.published_at, moved.published_at)
FROM (
  SELECT
    keeper.post_id AS keeper_id,
    t.account_id,
    t.status,
    t.published_url,
    t.published_at
  FROM public.content_social_targets t
  JOIN ranked loser ON loser.post_id = t.post_id AND loser.rn > 1
  JOIN ranked keeper ON keeper.event_id = loser.event_id AND keeper.rn = 1
  WHERE t.status = 'published'
) AS moved
WHERE keeper_target.post_id = moved.keeper_id
  AND keeper_target.account_id = moved.account_id
  AND keeper_target.status <> 'published';

WITH ranked AS (
  SELECT
    p.id AS post_id,
    row_number() OVER (
      PARTITION BY p.event_id
      ORDER BY
        CASE p.status
          WHEN 'published' THEN 6
          WHEN 'publishing' THEN 5
          WHEN 'scheduled' THEN 4
          WHEN 'approved' THEN 3
          WHEN 'pending_review' THEN 2
          WHEN 'changes_requested' THEN 2
          WHEN 'draft' THEN 1
          ELSE 0
        END DESC,
        CASE WHEN p.generator = 'grok' THEN 0 ELSE 1 END ASC,
        (SELECT count(*) FROM public.content_social_targets t WHERE t.post_id = p.id) DESC,
        p.created_at ASC,
        p.id ASC
    ) AS rn
  FROM public.content_social_posts p
  WHERE p.event_id IS NOT NULL
)
DELETE FROM public.content_social_posts p
USING ranked
WHERE p.id = ranked.post_id
  AND ranked.rn > 1;

-- ------------------------------------------------------------
-- 3) 一篇稿服務所有品牌組：清掉舊的 group_id 歸屬
--    （品牌組從此只決定「誰會收到」，不再決定「產幾篇」）
-- ------------------------------------------------------------
UPDATE public.content_social_posts
SET group_id = NULL
WHERE event_id IS NOT NULL
  AND group_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4) 資料庫層守住「一個事件只有一篇稿」
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS content_social_posts_event_uidx
  ON public.content_social_posts (event_id)
  WHERE event_id IS NOT NULL;

-- 舊的 (event_id, group_id) 冪等鍵已被 event_id 唯一鍵取代
DROP INDEX IF EXISTS public.content_social_posts_event_group_uidx;

COMMENT ON INDEX public.content_social_posts_event_uidx IS
  '一個熱點只能有一篇社媒稿：這是「同事件不重複生成」的最後一道防線';

-- ------------------------------------------------------------
-- 5) 驗證（migration 結束前把數字留進 log，方便遠端核對）
-- ------------------------------------------------------------
DO $$
DECLARE
  dup_events int;
  orphan_targets int;
BEGIN
  SELECT count(*) INTO dup_events FROM (
    SELECT event_id
    FROM public.content_social_posts
    WHERE event_id IS NOT NULL
    GROUP BY event_id
    HAVING count(*) > 1
  ) AS d;

  SELECT count(*) INTO orphan_targets
  FROM public.content_social_targets t
  LEFT JOIN public.content_social_posts p ON p.id = t.post_id
  WHERE p.id IS NULL;

  RAISE NOTICE 'content dedupe: 同事件多稿事件數 = %（預期 0），孤立導流 = %（預期 0）',
    dup_events, orphan_targets;

  IF dup_events > 0 THEN
    RAISE EXCEPTION '去重後仍有 % 個事件有多篇稿，中止 migration', dup_events;
  END IF;
END
$$;
