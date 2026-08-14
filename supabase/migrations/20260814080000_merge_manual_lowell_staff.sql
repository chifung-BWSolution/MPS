-- Merge leftover "Lowell Lo (manual)" staff into the canonical Bubble staff row.
-- Submit (#day-report/submit) was writing reports to the manual UUID from the
-- hardcoded bypass profile; team-view (#day-report/team-view) listed the real
-- staffs row (BWT OB System). Same person, two identities, mismatched calendars.

DO $$
DECLARE
  src uuid := 'd88d2465-42d1-4205-8a9b-8495083c3691';
  dst uuid := '04102dd8-8d0f-4536-82cd-904cc0769227';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staffs WHERE id = src) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staffs WHERE id = dst) THEN
    RAISE EXCEPTION 'canonical Lowell staff % is missing', dst;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.day_reports a
    JOIN public.day_reports b
      ON a.report_date = b.report_date
    WHERE a.staff_id = src
      AND b.staff_id = dst
  ) THEN
    RAISE EXCEPTION 'day_reports date collision while merging Lowell identities';
  END IF;

  UPDATE public.day_reports
  SET staff_id = dst
  WHERE staff_id = src;

  UPDATE public.day_report_entries
  SET staff_id = dst
  WHERE staff_id = src;

  UPDATE public.pending_report_items
  SET staff_id = dst
  WHERE staff_id = src;

  UPDATE public.video_output_work_logs
  SET staff_id = dst
  WHERE staff_id = src;

  UPDATE public.video_output_work_logs
  SET created_by = dst
  WHERE created_by = src;

  UPDATE public.day_reports
  SET reviewer_id = dst
  WHERE reviewer_id = src;

  -- users.staff_id is UNIQUE and already points at dst; leave it alone.

  UPDATE public.staffs
  SET
    status = 'inactive',
    display_name = 'Lowell Lo (manual, merged)'
  WHERE id = src;
END $$;
