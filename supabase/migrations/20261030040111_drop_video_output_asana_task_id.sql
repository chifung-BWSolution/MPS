-- Drop unused video_output.asana_task_id.
-- The column held leftover Excel import text (client names), not Asana task ids.
-- Asana links stay on asana_url.

ALTER TABLE public.video_output
  DROP COLUMN IF EXISTS asana_task_id;
