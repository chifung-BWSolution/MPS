-- 1. Allow anon role to UPDATE webandsystem_list (app uses anon key without auth session)
DROP POLICY IF EXISTS "Allow anon update on webandsystem_list" ON public.webandsystem_list;
CREATE POLICY "Allow anon update on webandsystem_list"
  ON public.webandsystem_list FOR UPDATE
  TO anon
  USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE ON public.webandsystem_list TO anon;

-- 2. DB trigger: auto-sync total_hours on day_report_entries changes
CREATE OR REPLACE FUNCTION public.sync_website_total_hours()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.related_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If related_id changed, recalculate the old one first
    IF OLD.related_id IS DISTINCT FROM NEW.related_id AND OLD.related_id IS NOT NULL THEN
      UPDATE public.webandsystem_list
      SET total_hours = (
        SELECT COALESCE(SUM(hours), 0)
        FROM public.day_report_entries
        WHERE related_id = OLD.related_id
      )
      WHERE id = OLD.related_id;
    END IF;
    target_id := NEW.related_id;
  ELSE
    target_id := NEW.related_id;
  END IF;

  IF target_id IS NOT NULL THEN
    UPDATE public.webandsystem_list
    SET total_hours = (
      SELECT COALESCE(SUM(hours), 0)
      FROM public.day_report_entries
      WHERE related_id = target_id
    )
    WHERE id = target_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_website_hours ON public.day_report_entries;
CREATE TRIGGER trg_sync_website_hours
AFTER INSERT OR UPDATE OR DELETE ON public.day_report_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_website_total_hours();

-- 3. Backfill all existing entries
UPDATE public.webandsystem_list ws
SET total_hours = (
  SELECT COALESCE(SUM(e.hours), 0)
  FROM public.day_report_entries e
  WHERE e.related_id = ws.id
);
