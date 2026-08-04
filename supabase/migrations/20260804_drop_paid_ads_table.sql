-- Remove legacy mock paid_ads table (replaced by google_ads_* sync tables).
-- Target: MPS production project kwcevjcmdjadhrygjyfp only.

DROP TABLE IF EXISTS public.paid_ads CASCADE;
