-- ============================================================
-- kol_profile workflow fields — 6-page KOL lifecycle views
-- ============================================================

ALTER TABLE public.kol_profile
  ADD COLUMN IF NOT EXISTS primary_category text NOT NULL DEFAULT 'other'
    CHECK (primary_category IN ('food', 'beauty', 'both', 'other')),
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'manual'
    CHECK (source_system IN ('foodies', 'beauty18', 'emailmeform', 'manual', 'excel')),
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'unprocessed'
    CHECK (lifecycle_status IN ('unprocessed', 'shortlist', 'meeting', 'cooperated', 'star')),
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS fee_standard text,
  ADD COLUMN IF NOT EXISTS recognized_at timestamptz,
  ADD COLUMN IF NOT EXISTS recognized_by text,
  ADD COLUMN IF NOT EXISTS shortlist_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_location text,
  ADD COLUMN IF NOT EXISTS meeting_notes text,
  ADD COLUMN IF NOT EXISTS meeting_status text
    CHECK (meeting_status IS NULL OR meeting_status IN ('pending', 'scheduled', 'completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS cooperated_at timestamptz;

CREATE INDEX IF NOT EXISTS kol_profile_primary_category_idx
  ON public.kol_profile (primary_category);
CREATE INDEX IF NOT EXISTS kol_profile_lifecycle_status_idx
  ON public.kol_profile (lifecycle_status);
CREATE INDEX IF NOT EXISTS kol_profile_category_lifecycle_idx
  ON public.kol_profile (primary_category, lifecycle_status);

-- Backfill primary_category from blog_themes (美容 = 美麗事件 Beauty)
UPDATE public.kol_profile
SET primary_category = CASE
  WHEN EXISTS (
    SELECT 1 FROM unnest(blog_themes) AS t
    WHERE t ILIKE '%food%' OR t ILIKE '%美食%'
  ) AND EXISTS (
    SELECT 1 FROM unnest(blog_themes) AS t
    WHERE t ILIKE '%beauty%' OR t ILIKE '%美麗%'
  ) THEN 'both'
  WHEN EXISTS (
    SELECT 1 FROM unnest(blog_themes) AS t
    WHERE t ILIKE '%food%' OR t ILIKE '%美食%'
  ) THEN 'food'
  WHEN EXISTS (
    SELECT 1 FROM unnest(blog_themes) AS t
    WHERE t ILIKE '%beauty%' OR t ILIKE '%美麗%'
  ) THEN 'beauty'
  ELSE 'other'
END
WHERE primary_category = 'other';

-- Mark Excel import rows
UPDATE public.kol_profile
SET source_system = 'excel'
WHERE source_system = 'manual'
  AND raw_payload IS NOT NULL
  AND raw_payload <> '{}'::jsonb;
