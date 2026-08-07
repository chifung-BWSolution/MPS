-- ============================================================
-- 1) vchannels → brand_list UUID FK + backfill
-- 2) Drop staffs.brands (Bubble brand IDs; no longer used)
-- 3) DROP unused project/event tables (keep webandsystem_list)
-- ============================================================

-- A) vchannels.brand_list_id
ALTER TABLE public.vchannels
  ADD COLUMN IF NOT EXISTS brand_list_id uuid REFERENCES public.brand_list(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vchannels_brand_list_id_idx
  ON public.vchannels (brand_list_id);

-- Backfill from brand_code with aliases
UPDATE public.vchannels v
SET brand_list_id = b.id
FROM public.brand_list b
WHERE v.brand_list_id IS NULL
  AND b.brand_code = CASE v.brand_code
    WHEN 'BSC Beauty' THEN 'BSC'
    WHEN 'FC Catering' THEN 'FCC'
    ELSE v.brand_code
  END;

-- CFA+CFB / Franco intentionally left NULL (no matching brand_list row)

-- B) Drop staff brand relation column
ALTER TABLE public.staffs
  DROP COLUMN IF EXISTS brands;

-- C) Drop unused tables
DROP TABLE IF EXISTS public.client_project CASCADE;
DROP TABLE IF EXISTS public.company_project CASCADE;
DROP TABLE IF EXISTS public.projects_list CASCADE;
DROP TABLE IF EXISTS public.upcoming_event CASCADE;
DROP TABLE IF EXISTS public.seo_upgrades CASCADE;
