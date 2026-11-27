-- Let each custom form open its own Asana task, and allow unlimited file counts.

ALTER TABLE public.inquiry_form_fields
  DROP CONSTRAINT IF EXISTS inquiry_form_fields_file_max_count_check,
  ADD CONSTRAINT inquiry_form_fields_file_max_count_check
    CHECK (file_max_count BETWEEN 0 AND 20);

COMMENT ON COLUMN public.inquiry_form_fields.file_max_count IS
  'Maximum files for this field. 0 means no count limit; each submission is still capped at 20 MB total.';

ALTER TABLE public.inquiry_forms
  ADD COLUMN IF NOT EXISTS asana_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asana_project_gid text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS asana_project_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS asana_assignee_gid text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS asana_assignee_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS asana_assignee_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS asana_collaborator_gids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS asana_task_name_template text NOT NULL DEFAULT '{{form_name}}';

ALTER TABLE public.inquiry_form_submissions
  ADD COLUMN IF NOT EXISTS asana_task_gid text,
  ADD COLUMN IF NOT EXISTS asana_error text;
