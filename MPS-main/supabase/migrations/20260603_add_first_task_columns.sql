-- ============================================================
-- Add denormalized helper columns for the first task in
-- company_project_details.tasks (jsonb array). These are
-- generated columns so they auto-update whenever tasks changes.
-- Useful when browsing the table in Supabase Table Editor.
-- ============================================================

ALTER TABLE public.company_project_details
  ADD COLUMN IF NOT EXISTS first_task_name text
    GENERATED ALWAYS AS (NULLIF(tasks->0->>'title', '')) STORED;

ALTER TABLE public.company_project_details
  ADD COLUMN IF NOT EXISTS first_task_status text
    GENERATED ALWAYS AS (NULLIF(tasks->0->>'status', '')) STORED;

ALTER TABLE public.company_project_details
  ADD COLUMN IF NOT EXISTS first_task_assignee text
    GENERATED ALWAYS AS (NULLIF(tasks->0->>'assignee', '')) STORED;

ALTER TABLE public.company_project_details
  ADD COLUMN IF NOT EXISTS first_task_priority text
    GENERATED ALWAYS AS (NULLIF(tasks->0->>'priority', '')) STORED;

ALTER TABLE public.company_project_details
  ADD COLUMN IF NOT EXISTS first_task_start_date text
    GENERATED ALWAYS AS (NULLIF(tasks->0->>'startDate', '')) STORED;

ALTER TABLE public.company_project_details
  ADD COLUMN IF NOT EXISTS first_task_end_date text
    GENERATED ALWAYS AS (NULLIF(tasks->0->>'endDate', '')) STORED;
