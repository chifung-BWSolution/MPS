-- Manual close reason on Asana staging rows. Sync must not overwrite this column.

ALTER TABLE public.asana_synced_tasks
  ADD COLUMN IF NOT EXISTS case_closed_reason text;

COMMENT ON COLUMN public.asana_synced_tasks.case_closed_reason IS
  'Optional 放棄跟進 reason on /asana-pending. Empty means still pending follow-up.';
