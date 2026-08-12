-- ============================================================
-- Replace Bubble-text staff relations with UUID FKs → staffs.id
--
-- Columns converted (text Bubble ID → uuid FK):
--   users.staff_id
--   day_reports.staff_id
--   day_reports.reviewer_id
--   day_report_entries.staff_id
--   pending_report_items.staff_id
--   video_output_work_logs.staff_id
--   video_output_work_logs.created_by
--
-- staffs.bubble_staff_id is kept as the external Bubble identity.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 0) Ensure orphan Bubble IDs used as staff relations exist in staffs
-- ---------------------------------------------------------------------------
INSERT INTO public.staffs (id, bubble_staff_id, display_name, status)
VALUES (
  'd88d2465-42d1-4205-8a9b-8495083c3691',
  'manual_super_admin_lowell',
  'Lowell Lo (manual)',
  'active'
)
ON CONFLICT (bubble_staff_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helper pattern per table:
--   add temp uuid col → backfill via bubble_staff_id → swap → FK + indexes
-- ---------------------------------------------------------------------------

-- =========================
-- 1) users.staff_id
-- =========================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS staff_id_uuid uuid;

UPDATE public.users u
SET staff_id_uuid = s.id
FROM public.staffs s
WHERE u.staff_id_uuid IS NULL
  AND s.bubble_staff_id = u.staff_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE staff_id_uuid IS NULL) THEN
    RAISE EXCEPTION 'users.staff_id backfill left NULL rows';
  END IF;
END $$;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_staff_id_key;
DROP INDEX IF EXISTS public.users_staff_id_key;
DROP INDEX IF EXISTS public.idx_users_staff_id;

ALTER TABLE public.users
  DROP COLUMN staff_id;

ALTER TABLE public.users
  RENAME COLUMN staff_id_uuid TO staff_id;

ALTER TABLE public.users
  ALTER COLUMN staff_id SET NOT NULL;

ALTER TABLE public.users
  ADD CONSTRAINT users_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.staffs(id) ON DELETE RESTRICT;

ALTER TABLE public.users
  ADD CONSTRAINT users_staff_id_key UNIQUE (staff_id);

CREATE INDEX IF NOT EXISTS idx_users_staff_id
  ON public.users (staff_id);

COMMENT ON COLUMN public.users.staff_id IS
  'UUID FK to staffs.id (replaces legacy Bubble staff text id).';

-- =========================
-- 2) day_reports.staff_id + reviewer_id
-- =========================
ALTER TABLE public.day_reports
  ADD COLUMN IF NOT EXISTS staff_id_uuid uuid,
  ADD COLUMN IF NOT EXISTS reviewer_id_uuid uuid;

UPDATE public.day_reports d
SET staff_id_uuid = s.id
FROM public.staffs s
WHERE d.staff_id_uuid IS NULL
  AND s.bubble_staff_id = d.staff_id;

UPDATE public.day_reports d
SET reviewer_id_uuid = s.id
FROM public.staffs s
WHERE d.reviewer_id IS NOT NULL
  AND d.reviewer_id_uuid IS NULL
  AND s.bubble_staff_id = d.reviewer_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.day_reports WHERE staff_id_uuid IS NULL) THEN
    RAISE EXCEPTION 'day_reports.staff_id backfill left NULL rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.day_reports
    WHERE reviewer_id IS NOT NULL AND reviewer_id_uuid IS NULL
  ) THEN
    RAISE EXCEPTION 'day_reports.reviewer_id backfill left unmatched non-null rows';
  END IF;
END $$;

ALTER TABLE public.day_reports
  DROP CONSTRAINT IF EXISTS day_reports_staff_id_report_date_key;
DROP INDEX IF EXISTS public.day_reports_staff_id_report_date_key;
DROP INDEX IF EXISTS public.idx_day_reports_staff_id;

ALTER TABLE public.day_reports
  DROP COLUMN staff_id,
  DROP COLUMN reviewer_id;

ALTER TABLE public.day_reports
  RENAME COLUMN staff_id_uuid TO staff_id;
ALTER TABLE public.day_reports
  RENAME COLUMN reviewer_id_uuid TO reviewer_id;

ALTER TABLE public.day_reports
  ALTER COLUMN staff_id SET NOT NULL;

ALTER TABLE public.day_reports
  ADD CONSTRAINT day_reports_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.staffs(id) ON DELETE RESTRICT;

ALTER TABLE public.day_reports
  ADD CONSTRAINT day_reports_reviewer_id_fkey
    FOREIGN KEY (reviewer_id) REFERENCES public.staffs(id) ON DELETE SET NULL;

ALTER TABLE public.day_reports
  ADD CONSTRAINT day_reports_staff_id_report_date_key UNIQUE (staff_id, report_date);

CREATE INDEX IF NOT EXISTS idx_day_reports_staff_id
  ON public.day_reports (staff_id);

CREATE INDEX IF NOT EXISTS idx_day_reports_reviewer_id
  ON public.day_reports (reviewer_id);

COMMENT ON COLUMN public.day_reports.staff_id IS
  'UUID FK to staffs.id (replaces legacy Bubble staff text id).';
COMMENT ON COLUMN public.day_reports.reviewer_id IS
  'UUID FK to staffs.id (replaces legacy Bubble staff text id).';

-- =========================
-- 3) day_report_entries.staff_id
-- =========================
ALTER TABLE public.day_report_entries
  ADD COLUMN IF NOT EXISTS staff_id_uuid uuid;

UPDATE public.day_report_entries e
SET staff_id_uuid = s.id
FROM public.staffs s
WHERE e.staff_id_uuid IS NULL
  AND s.bubble_staff_id = e.staff_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.day_report_entries WHERE staff_id_uuid IS NULL) THEN
    RAISE EXCEPTION 'day_report_entries.staff_id backfill left NULL rows';
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_day_report_entries_staff_id;

ALTER TABLE public.day_report_entries
  DROP COLUMN staff_id;

ALTER TABLE public.day_report_entries
  RENAME COLUMN staff_id_uuid TO staff_id;

ALTER TABLE public.day_report_entries
  ALTER COLUMN staff_id SET NOT NULL;

ALTER TABLE public.day_report_entries
  ADD CONSTRAINT day_report_entries_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.staffs(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_day_report_entries_staff_id
  ON public.day_report_entries (staff_id);

COMMENT ON COLUMN public.day_report_entries.staff_id IS
  'UUID FK to staffs.id (replaces legacy Bubble staff text id).';

-- =========================
-- 4) pending_report_items.staff_id
-- =========================
ALTER TABLE public.pending_report_items
  ADD COLUMN IF NOT EXISTS staff_id_uuid uuid;

UPDATE public.pending_report_items p
SET staff_id_uuid = s.id
FROM public.staffs s
WHERE p.staff_id_uuid IS NULL
  AND s.bubble_staff_id = p.staff_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pending_report_items WHERE staff_id_uuid IS NULL) THEN
    RAISE EXCEPTION 'pending_report_items.staff_id backfill left NULL rows';
  END IF;
END $$;

ALTER TABLE public.pending_report_items
  DROP CONSTRAINT IF EXISTS pending_report_items_unique_source;
DROP INDEX IF EXISTS public.pending_report_items_unique_source;
DROP INDEX IF EXISTS public.pending_report_items_staff_date_status_idx;

ALTER TABLE public.pending_report_items
  DROP COLUMN staff_id;

ALTER TABLE public.pending_report_items
  RENAME COLUMN staff_id_uuid TO staff_id;

ALTER TABLE public.pending_report_items
  ALTER COLUMN staff_id SET NOT NULL;

ALTER TABLE public.pending_report_items
  ADD CONSTRAINT pending_report_items_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.staffs(id) ON DELETE RESTRICT;

ALTER TABLE public.pending_report_items
  ADD CONSTRAINT pending_report_items_unique_source
    UNIQUE (staff_id, source_module, source_type, source_id);

CREATE INDEX IF NOT EXISTS pending_report_items_staff_date_status_idx
  ON public.pending_report_items (staff_id, report_date, status);

COMMENT ON COLUMN public.pending_report_items.staff_id IS
  'UUID FK to staffs.id (replaces legacy Bubble staff text id).';

-- =========================
-- 5) video_output_work_logs.staff_id + created_by
-- =========================
ALTER TABLE public.video_output_work_logs
  ADD COLUMN IF NOT EXISTS staff_id_uuid uuid,
  ADD COLUMN IF NOT EXISTS created_by_uuid uuid;

UPDATE public.video_output_work_logs v
SET staff_id_uuid = s.id
FROM public.staffs s
WHERE v.staff_id_uuid IS NULL
  AND s.bubble_staff_id = v.staff_id;

UPDATE public.video_output_work_logs v
SET created_by_uuid = s.id
FROM public.staffs s
WHERE v.created_by IS NOT NULL
  AND v.created_by_uuid IS NULL
  AND s.bubble_staff_id = v.created_by;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.video_output_work_logs WHERE staff_id_uuid IS NULL) THEN
    RAISE EXCEPTION 'video_output_work_logs.staff_id backfill left NULL rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.video_output_work_logs
    WHERE created_by IS NOT NULL AND created_by_uuid IS NULL
  ) THEN
    RAISE EXCEPTION 'video_output_work_logs.created_by backfill left unmatched non-null rows';
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_video_output_work_logs_staff_date;

ALTER TABLE public.video_output_work_logs
  DROP COLUMN staff_id,
  DROP COLUMN created_by;

ALTER TABLE public.video_output_work_logs
  RENAME COLUMN staff_id_uuid TO staff_id;
ALTER TABLE public.video_output_work_logs
  RENAME COLUMN created_by_uuid TO created_by;

ALTER TABLE public.video_output_work_logs
  ALTER COLUMN staff_id SET NOT NULL;

ALTER TABLE public.video_output_work_logs
  ADD CONSTRAINT video_output_work_logs_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.staffs(id) ON DELETE RESTRICT;

ALTER TABLE public.video_output_work_logs
  ADD CONSTRAINT video_output_work_logs_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.staffs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_video_output_work_logs_staff_date
  ON public.video_output_work_logs (staff_id, work_date);

CREATE INDEX IF NOT EXISTS idx_video_output_work_logs_created_by
  ON public.video_output_work_logs (created_by);

COMMENT ON COLUMN public.video_output_work_logs.staff_id IS
  'UUID FK to staffs.id (replaces legacy Bubble staff text id).';
COMMENT ON COLUMN public.video_output_work_logs.created_by IS
  'UUID FK to staffs.id (replaces legacy Bubble staff text id).';
