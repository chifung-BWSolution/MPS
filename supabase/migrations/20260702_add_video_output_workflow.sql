-- Video workflow stage + prep/production metadata for process pages (schedule → publish)

ALTER TABLE public.video_output
  ADD COLUMN IF NOT EXISTS workflow_stage text NOT NULL DEFAULT 'prep'
    CHECK (workflow_stage IN ('prep', 'production', 'review', 'publish', 'published')),
  ADD COLUMN IF NOT EXISTS prep_assignments jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS production_progress jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location_notes text,
  ADD COLUMN IF NOT EXISTS review_reject_reason text,
  ADD COLUMN IF NOT EXISTS submitted_for_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

CREATE INDEX IF NOT EXISTS idx_video_output_workflow_stage
  ON public.video_output (workflow_stage);

-- Heuristic backfill for historical seed rows
UPDATE public.video_output
SET workflow_stage = CASE
  WHEN published_date IS NOT NULL THEN 'published'
  WHEN reviewed = true THEN 'publish'
  WHEN demo_done = true AND COALESCE(reviewed, false) = false THEN 'review'
  WHEN raw_footage_done = true
    OR needs_editing IS TRUE
    OR demo_done = true
    OR shoot_sz = true
    OR shoot_hk = true THEN 'production'
  ELSE 'prep'
END
WHERE workflow_stage = 'prep'
  OR workflow_stage IS NULL;

UPDATE public.video_output
SET reviewed = true
WHERE workflow_stage IN ('publish', 'published')
  AND COALESCE(reviewed, false) = false;
