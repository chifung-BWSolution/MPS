-- Remove unused copy-language flags from video coordination (簡體 / 繁體 / 英文).

ALTER TABLE public.video_output
  DROP COLUMN IF EXISTS copy_sc,
  DROP COLUMN IF EXISTS copy_tc,
  DROP COLUMN IF EXISTS copy_en;
