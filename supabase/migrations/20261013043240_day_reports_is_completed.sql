-- True when the logged total matches the required day total.
-- Stored generated column, so it stays in sync when either value changes.

ALTER TABLE public.day_reports
  ADD COLUMN IF NOT EXISTS is_completed boolean
  GENERATED ALWAYS AS (total_hours = target_hours) STORED;

COMMENT ON COLUMN public.day_reports.is_completed IS
  'True when total_hours equals target_hours.';
