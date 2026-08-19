-- Delete leftover "Lowell Lo (manual, merged)" and point remaining FKs
-- at the canonical Bubble staff row. Idempotent: skip unique collisions
-- (dest already owns that date / pending item / login), then delete src.

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

  IF to_regprocedure('public.reattribute_staff_owned_rows(uuid, uuid)') IS NOT NULL THEN
    PERFORM public.reattribute_staff_owned_rows(src, dst);
  END IF;

  -- Leftover reports whose date already exists on dest: drop the duplicate.
  -- Entries cascade from day_reports.
  DELETE FROM public.day_reports d
  WHERE d.staff_id = src
    AND EXISTS (
      SELECT 1
      FROM public.day_reports x
      WHERE x.staff_id = dst
        AND x.report_date = d.report_date
    );

  UPDATE public.day_reports
  SET staff_id = dst
  WHERE staff_id = src;

  UPDATE public.day_report_entries
  SET staff_id = dst
  WHERE staff_id = src;

  DELETE FROM public.pending_report_items p
  WHERE p.staff_id = src
    AND EXISTS (
      SELECT 1
      FROM public.pending_report_items x
      WHERE x.staff_id = dst
        AND x.source_module = p.source_module
        AND x.source_type = p.source_type
        AND x.source_id = p.source_id
    );

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

  IF EXISTS (SELECT 1 FROM public.users WHERE staff_id = src) THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE staff_id = dst) THEN
      RAISE EXCEPTION
        'users.staff_id cannot be remapped from leftover Lowell %: canonical % already has a login',
        src, dst;
    END IF;
    UPDATE public.users
    SET staff_id = dst
    WHERE staff_id = src;
  END IF;

  DELETE FROM public.staffs
  WHERE id = src;
END $$;
