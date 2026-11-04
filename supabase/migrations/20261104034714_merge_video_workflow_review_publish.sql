-- Merge workflow stages review and publish into review (display: 待發佈).

UPDATE public.video_output
SET workflow_stage = 'review',
    updated_at = now()
WHERE workflow_stage = 'publish';

ALTER TABLE public.video_output
  DROP CONSTRAINT IF EXISTS video_output_workflow_stage_check;

ALTER TABLE public.video_output
  ADD CONSTRAINT video_output_workflow_stage_check
  CHECK (workflow_stage IN ('prep', 'production', 'review', 'published', 'delisted'));
