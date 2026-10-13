-- Copy OTC2 staff_sync.staff_id onto day_reports from staffs.otc_staff_id
-- via day_reports.staff_id (staffs.id). App identity stays staffs.id.

ALTER TABLE public.day_reports
  ADD COLUMN IF NOT EXISTS otc_staff_id bigint;

COMMENT ON COLUMN public.day_reports.otc_staff_id IS
  'OTC2 staff_sync.staff_id, copied from staffs.otc_staff_id via day_reports.staff_id.';

UPDATE public.day_reports AS d
SET otc_staff_id = s.otc_staff_id
FROM public.staffs AS s
WHERE d.staff_id = s.id
  AND d.otc_staff_id IS DISTINCT FROM s.otc_staff_id;

CREATE INDEX IF NOT EXISTS day_reports_otc_staff_id_idx
  ON public.day_reports (otc_staff_id);

CREATE OR REPLACE FUNCTION private.set_day_report_otc_staff_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT s.otc_staff_id
    INTO NEW.otc_staff_id
  FROM public.staffs AS s
  WHERE s.id = NEW.staff_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.set_day_report_otc_staff_id() IS
  'Sets day_reports.otc_staff_id from staffs.otc_staff_id for the report staff_id.';

REVOKE ALL ON FUNCTION private.set_day_report_otc_staff_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.set_day_report_otc_staff_id() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS day_reports_set_otc_staff_id ON public.day_reports;
CREATE TRIGGER day_reports_set_otc_staff_id
  BEFORE INSERT OR UPDATE OF staff_id ON public.day_reports
  FOR EACH ROW
  EXECUTE FUNCTION private.set_day_report_otc_staff_id();

CREATE OR REPLACE FUNCTION private.sync_day_reports_otc_staff_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.otc_staff_id IS DISTINCT FROM OLD.otc_staff_id THEN
    UPDATE public.day_reports
    SET otc_staff_id = NEW.otc_staff_id
    WHERE staff_id = NEW.id
      AND otc_staff_id IS DISTINCT FROM NEW.otc_staff_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.sync_day_reports_otc_staff_id() IS
  'Keeps day_reports.otc_staff_id aligned when staffs.otc_staff_id changes.';

REVOKE ALL ON FUNCTION private.sync_day_reports_otc_staff_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.sync_day_reports_otc_staff_id() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS staffs_sync_day_reports_otc_staff_id ON public.staffs;
CREATE TRIGGER staffs_sync_day_reports_otc_staff_id
  AFTER UPDATE OF otc_staff_id ON public.staffs
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_day_reports_otc_staff_id();
