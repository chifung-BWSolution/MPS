-- Copywriting, subtitle, and review flags for video_output

ALTER TABLE public.video_output
  ADD COLUMN IF NOT EXISTS copy_sc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS copy_tc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS copy_en boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subtitle_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false;
