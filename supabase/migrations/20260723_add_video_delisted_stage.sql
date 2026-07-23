-- Allow workflow stage 「已下架」(delisted)

ALTER TABLE public.video_output
  DROP CONSTRAINT IF EXISTS video_output_workflow_stage_check;

ALTER TABLE public.video_output
  ADD CONSTRAINT video_output_workflow_stage_check
  CHECK (workflow_stage IN ('prep', 'production', 'review', 'publish', 'published', 'delisted'));
