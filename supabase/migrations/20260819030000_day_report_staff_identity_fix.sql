-- Day-report identity: atomic entry replace + reattribute rows written
-- under the wrong staff_id after email-first resolveStaffUuid (2026-08-14).
--
-- Submit now keys off users.staff_id. This migration moves leftover reports
-- from the email-matched staff row back to the login whitelist identity.

CREATE OR REPLACE FUNCTION public.replace_day_report_entries(
  p_report_id uuid,
  p_staff_id uuid,
  p_entries jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_report_id IS NULL OR p_staff_id IS NULL THEN
    RAISE EXCEPTION 'replace_day_report_entries: report_id and staff_id are required';
  END IF;

  DELETE FROM public.day_report_entries
  WHERE day_report_id = p_report_id;

  IF p_entries IS NULL
     OR jsonb_typeof(p_entries) <> 'array'
     OR jsonb_array_length(p_entries) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.day_report_entries (
    day_report_id, staff_id, category, related_id, related_name, title, hours,
    outcome_type, outcome_url, outcome_images, growth_experience,
    is_ai_assisted, ai_tools, ai_tools_v2, sort_order
  )
  SELECT
    p_report_id,
    p_staff_id,
    rec.category,
    rec.related_id,
    rec.related_name,
    COALESCE(rec.title, ''),
    COALESCE(rec.hours, 0),
    rec.outcome_type,
    rec.outcome_url,
    rec.outcome_images,
    rec.growth_experience,
    COALESCE(rec.is_ai_assisted, false),
    rec.ai_tools,
    rec.ai_tools_v2,
    COALESCE(rec.sort_order, 0)
  FROM jsonb_to_recordset(p_entries) AS rec(
    category text,
    related_id text,
    related_name text,
    title text,
    hours numeric,
    outcome_type text,
    outcome_url text,
    outcome_images jsonb,
    growth_experience text,
    is_ai_assisted boolean,
    ai_tools jsonb,
    ai_tools_v2 jsonb,
    sort_order integer
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_day_report_entries(uuid, uuid, jsonb)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reattribute_staff_owned_rows(src uuid, dst uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF src IS NULL OR dst IS NULL OR src = dst THEN
    RETURN;
  END IF;

  UPDATE public.day_reports d
  SET staff_id = dst
  WHERE d.staff_id = src
    AND NOT EXISTS (
      SELECT 1
      FROM public.day_reports x
      WHERE x.staff_id = dst
        AND x.report_date = d.report_date
    );

  UPDATE public.day_report_entries e
  SET staff_id = dst
  WHERE e.staff_id = src
    AND EXISTS (
      SELECT 1
      FROM public.day_reports d
      WHERE d.id = e.day_report_id
        AND d.staff_id = dst
    );

  UPDATE public.pending_report_items p
  SET staff_id = dst
  WHERE p.staff_id = src
    AND NOT EXISTS (
      SELECT 1
      FROM public.pending_report_items x
      WHERE x.staff_id = dst
        AND x.source_module = p.source_module
        AND x.source_type = p.source_type
        AND x.source_id = p.source_id
    );

  UPDATE public.video_output_work_logs
  SET staff_id = dst
  WHERE staff_id = src;

  UPDATE public.video_output_work_logs
  SET created_by = dst
  WHERE created_by = src;

  UPDATE public.day_reports
  SET reviewer_id = dst
  WHERE reviewer_id = src;
END;
$$;

DO $$
DECLARE
  lowell_manual uuid := 'd88d2465-42d1-4205-8a9b-8495083c3691';
  lowell_canonical uuid := '04102dd8-8d0f-4536-82cd-904cc0769227';
  rec RECORD;
  dest uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.staffs WHERE id = lowell_manual)
     AND EXISTS (SELECT 1 FROM public.staffs WHERE id = lowell_canonical) THEN
    PERFORM public.reattribute_staff_owned_rows(lowell_manual, lowell_canonical);
  END IF;

  FOR rec IN
    SELECT DISTINCT
      s.id AS src_id,
      CASE
        WHEN u.staff_id = lowell_manual THEN lowell_canonical
        ELSE u.staff_id
      END AS dst_id,
      s.display_name AS src_name,
      u.display_name AS dst_name,
      (
        lower(coalesce(s.status, '')) <> 'active'
        OR lower(coalesce(s.bubble_staff_id, '')) LIKE 'manual_%'
        OR lower(coalesce(s.display_name, '')) LIKE '%(manual)%'
        OR NOT EXISTS (SELECT 1 FROM public.users u2 WHERE u2.staff_id = s.id)
      ) AS safe_source
    FROM public.users u
    JOIN public.staffs s
      ON s.work_email IS NOT NULL
     AND lower(trim(s.work_email)) IN (
       lower(trim(coalesce(u.email, ''))),
       lower(trim(coalesce(u.google_email, '')))
     )
    WHERE s.id IS DISTINCT FROM (
      CASE
        WHEN u.staff_id = lowell_manual THEN lowell_canonical
        ELSE u.staff_id
      END
    )
  LOOP
    dest := rec.dst_id;
    IF rec.safe_source THEN
      RAISE NOTICE 'reattribute % (%) → % (%)', rec.src_name, rec.src_id, rec.dst_name, dest;
      PERFORM public.reattribute_staff_owned_rows(rec.src_id, dest);
    ELSE
      -- Active coworker who also has a login: move only post-bug dates that
      -- the destination does not already own (Jane/Elena writes onto a
      -- shared work_email row).
      UPDATE public.day_reports d
      SET staff_id = dest
      WHERE d.staff_id = rec.src_id
        AND d.created_at >= TIMESTAMPTZ '2026-08-14 10:55:00+00'
        AND NOT EXISTS (
          SELECT 1
          FROM public.day_reports x
          WHERE x.staff_id = dest
            AND x.report_date = d.report_date
        );
      UPDATE public.day_report_entries e
      SET staff_id = dest
      WHERE e.staff_id = rec.src_id
        AND EXISTS (
          SELECT 1
          FROM public.day_reports d
          WHERE d.id = e.day_report_id
            AND d.staff_id = dest
        );
      RAISE NOTICE 'partial reattribute (active login) % (%) → % (%)', rec.src_name, rec.src_id, rec.dst_name, dest;
    END IF;
  END LOOP;
END $$;
