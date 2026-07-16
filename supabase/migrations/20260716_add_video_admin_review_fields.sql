-- Two-step review: 行政審查 then 管理批核
ALTER TABLE public.video_output
  ADD COLUMN IF NOT EXISTS admin_review_passed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_reviewed_by text;

COMMENT ON COLUMN public.video_output.admin_review_passed IS '行政審查是否已通過；通過後才可進行管理批核';
COMMENT ON COLUMN public.video_output.admin_reviewed_at IS '行政審查時間';
COMMENT ON COLUMN public.video_output.admin_reviewed_by IS '行政審查人';
