-- ============================================================
-- 社媒自動化營運 · AI 生成（Grok）作者標記
--
-- 目的：區分「AI 生成」與「模板」稿件，讓 UI 能誠實標示來源；
--       也方便日後統計 AI 產出比例與成本。
-- 只做加法。
-- ============================================================

ALTER TABLE public.content_social_posts
  ADD COLUMN IF NOT EXISTS generator text NOT NULL DEFAULT 'template';

COMMENT ON COLUMN public.content_social_posts.generator IS
  '生成來源：template（模板）／grok（xAI Grok）；日後可擴 gemini';
