-- Re-attribute Dylan Peng's 2026-08-12 / 2026-08-13 day reports.
--
-- During the staff UUID FK migration window (2026-08-12 .. 2026-08-14),
-- resolveStaffUuid picked the first staffs row matching work_email
-- cfb.app01@chifung.net without filtering inactive rows. That email is
-- shared by the legacy "Ashley Chen" / "Ken Wen" rows and Dylan's
-- canonical row, so these two submissions landed on the inactive
-- "Ashley Chen" row (a92eff85-...) and disappeared from Dylan's list.
-- The resolver was fixed on 2026-08-14 (commit 21f8457); this migration
-- moves the already-written rows back to Dylan's identity.

DO $$
DECLARE
  src uuid := 'a92eff85-b415-4971-9b6e-086327c7d361'; -- Ashley Chen (legacy, inactive)
  dst uuid := '0706292c-b551-4b07-82d1-70fd127cbc75'; -- Dylan Peng (canonical)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staffs WHERE id = src)
     OR NOT EXISTS (SELECT 1 FROM public.staffs WHERE id = dst) THEN
    RAISE EXCEPTION 'expected staff rows are missing (src=%, dst=%)', src, dst;
  END IF;

  -- Same safety check as the Lowell merge: refuse on date collisions.
  IF EXISTS (
    SELECT 1
    FROM public.day_reports a
    JOIN public.day_reports b
      ON a.report_date = b.report_date
    WHERE a.staff_id = src
      AND b.staff_id = dst
  ) THEN
    RAISE EXCEPTION 'day_reports date collision while re-attributing Dylan reports';
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
END $$;
