-- ============================================================
-- Generated columns for tasks 2..5 in company_project_details.tasks.
-- Because they are GENERATED from the jsonb array by index,
-- deleting a task in the middle naturally shifts later tasks
-- forward (e.g. removing task 3 makes the old task 4 become 3).
-- ============================================================

ALTER TABLE public.company_project_details
  ADD COLUMN IF NOT EXISTS second_task_name text
    GENERATED ALWAYS AS (NULLIF(tasks->1->>'title', '')) STORED,
  ADD COLUMN IF NOT EXISTS second_task_status text
    GENERATED ALWAYS AS (NULLIF(tasks->1->>'status', '')) STORED,
  ADD COLUMN IF NOT EXISTS second_task_assignee text
    GENERATED ALWAYS AS (NULLIF(tasks->1->>'assignee', '')) STORED,
  ADD COLUMN IF NOT EXISTS second_task_priority text
    GENERATED ALWAYS AS (NULLIF(tasks->1->>'priority', '')) STORED,
  ADD COLUMN IF NOT EXISTS second_task_start_date text
    GENERATED ALWAYS AS (NULLIF(tasks->1->>'startDate', '')) STORED,
  ADD COLUMN IF NOT EXISTS second_task_end_date text
    GENERATED ALWAYS AS (NULLIF(tasks->1->>'endDate', '')) STORED;

ALTER TABLE public.company_project_details
  ADD COLUMN IF NOT EXISTS third_task_name text
    GENERATED ALWAYS AS (NULLIF(tasks->2->>'title', '')) STORED,
  ADD COLUMN IF NOT EXISTS third_task_status text
    GENERATED ALWAYS AS (NULLIF(tasks->2->>'status', '')) STORED,
  ADD COLUMN IF NOT EXISTS third_task_assignee text
    GENERATED ALWAYS AS (NULLIF(tasks->2->>'assignee', '')) STORED,
  ADD COLUMN IF NOT EXISTS third_task_priority text
    GENERATED ALWAYS AS (NULLIF(tasks->2->>'priority', '')) STORED,
  ADD COLUMN IF NOT EXISTS third_task_start_date text
    GENERATED ALWAYS AS (NULLIF(tasks->2->>'startDate', '')) STORED,
  ADD COLUMN IF NOT EXISTS third_task_end_date text
    GENERATED ALWAYS AS (NULLIF(tasks->2->>'endDate', '')) STORED;

ALTER TABLE public.company_project_details
  ADD COLUMN IF NOT EXISTS fourth_task_name text
    GENERATED ALWAYS AS (NULLIF(tasks->3->>'title', '')) STORED,
  ADD COLUMN IF NOT EXISTS fourth_task_status text
    GENERATED ALWAYS AS (NULLIF(tasks->3->>'status', '')) STORED,
  ADD COLUMN IF NOT EXISTS fourth_task_assignee text
    GENERATED ALWAYS AS (NULLIF(tasks->3->>'assignee', '')) STORED,
  ADD COLUMN IF NOT EXISTS fourth_task_priority text
    GENERATED ALWAYS AS (NULLIF(tasks->3->>'priority', '')) STORED,
  ADD COLUMN IF NOT EXISTS fourth_task_start_date text
    GENERATED ALWAYS AS (NULLIF(tasks->3->>'startDate', '')) STORED,
  ADD COLUMN IF NOT EXISTS fourth_task_end_date text
    GENERATED ALWAYS AS (NULLIF(tasks->3->>'endDate', '')) STORED;

ALTER TABLE public.company_project_details
  ADD COLUMN IF NOT EXISTS fifth_task_name text
    GENERATED ALWAYS AS (NULLIF(tasks->4->>'title', '')) STORED,
  ADD COLUMN IF NOT EXISTS fifth_task_status text
    GENERATED ALWAYS AS (NULLIF(tasks->4->>'status', '')) STORED,
  ADD COLUMN IF NOT EXISTS fifth_task_assignee text
    GENERATED ALWAYS AS (NULLIF(tasks->4->>'assignee', '')) STORED,
  ADD COLUMN IF NOT EXISTS fifth_task_priority text
    GENERATED ALWAYS AS (NULLIF(tasks->4->>'priority', '')) STORED,
  ADD COLUMN IF NOT EXISTS fifth_task_start_date text
    GENERATED ALWAYS AS (NULLIF(tasks->4->>'startDate', '')) STORED,
  ADD COLUMN IF NOT EXISTS fifth_task_end_date text
    GENERATED ALWAYS AS (NULLIF(tasks->4->>'endDate', '')) STORED;
