-- Add cooperation_stage to confirmed_artist for 藝人列表 Stage workflow
ALTER TABLE public.confirmed_artist
  ADD COLUMN IF NOT EXISTS cooperation_stage text NOT NULL DEFAULT 'stage3';

ALTER TABLE public.confirmed_artist
  DROP CONSTRAINT IF EXISTS confirmed_artist_cooperation_stage_check;

ALTER TABLE public.confirmed_artist
  ADD CONSTRAINT confirmed_artist_cooperation_stage_check
  CHECK (cooperation_stage IN ('stage1', 'stage2', 'stage3', 'stage4', 'stage5'));

CREATE INDEX IF NOT EXISTS confirmed_artist_cooperation_stage_idx
  ON public.confirmed_artist (cooperation_stage);
