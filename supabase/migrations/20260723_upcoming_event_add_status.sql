-- Add publish status for manual marketing calendar events
ALTER TABLE public.upcoming_event
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_publish';

ALTER TABLE public.upcoming_event
  DROP CONSTRAINT IF EXISTS upcoming_event_status_check;

ALTER TABLE public.upcoming_event
  ADD CONSTRAINT upcoming_event_status_check
  CHECK (status IN ('pending_publish', 'published'));

COMMENT ON COLUMN public.upcoming_event.status IS 'Manual calendar event publish status: pending_publish | published';
