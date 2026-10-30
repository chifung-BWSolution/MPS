-- Remove the unused 文案 staff assignment from video prep assignments.

UPDATE public.video_output
SET prep_assignments = prep_assignments - 'copywriting'
WHERE prep_assignments ? 'copywriting';
