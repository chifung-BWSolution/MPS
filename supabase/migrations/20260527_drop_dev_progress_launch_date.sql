-- Remove dev_progress and launch_date columns from webandsystem_list
ALTER TABLE webandsystem_list
  DROP COLUMN IF EXISTS dev_progress,
  DROP COLUMN IF EXISTS launch_date;
