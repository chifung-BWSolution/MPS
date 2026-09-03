-- seo_ranking_history is written by sync-gsc but no frontend reads it.
-- social_posts was never queried by the app (website social tab uses local sample data).
-- seo_keywords is kept: WebsiteSeoTab / useSeoKeywords read and write it.

DROP TABLE IF EXISTS public.seo_ranking_history CASCADE;
DROP TABLE IF EXISTS public.social_posts CASCADE;

NOTIFY pgrst, 'reload schema';
