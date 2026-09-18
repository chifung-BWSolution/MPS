-- Realign pitching_code for every quotation_client_project whose current
-- code no longer matches project_types prefix + inquiry_date FY.
-- Uses public.allocate_pitching_code / pitching_code_prefix / pitching_code_fy.

CREATE TEMP TABLE IF NOT EXISTS pitching_code_backfill_log (
  id text PRIMARY KEY,
  old_code text,
  new_code text,
  type_code text,
  inquiry_date date,
  display_name text
);

DO $$
DECLARE
  r record;
  v_prefix text;
  v_fy_label text;
  v_pattern text;
  v_new text;
BEGIN
  FOR r IN
    SELECT
      q.id,
      q.project_types,
      q.inquiry_date,
      q.pitching_code,
      q.created_at,
      t.code AS type_code,
      q.display_name
    FROM public.quotation_client_project q
    LEFT JOIN public.quotation_project_types t ON t.id = q.project_types
    ORDER BY
      public.pitching_code_prefix(q.project_types),
      public.pitching_code_fy(q.inquiry_date),
      q.inquiry_date,
      q.created_at,
      q.id
  LOOP
    IF r.inquiry_date IS NULL THEN
      RAISE EXCEPTION 'inquiry_date is required to allocate pitching_code for %', r.id;
    END IF;

    v_prefix := public.pitching_code_prefix(r.project_types);
    v_fy_label := lpad(public.pitching_code_fy(r.inquiry_date)::text, 2, '0');
    v_pattern := '^' || v_prefix || v_fy_label || '-[0-9]{3}$';

    IF r.pitching_code IS NOT NULL
       AND btrim(r.pitching_code) <> ''
       AND r.pitching_code ~ v_pattern
    THEN
      CONTINUE;
    END IF;

    v_new := public.allocate_pitching_code(r.project_types, r.inquiry_date);

    UPDATE public.quotation_client_project
    SET pitching_code = v_new
    WHERE id = r.id;

    INSERT INTO pitching_code_backfill_log (
      id, old_code, new_code, type_code, inquiry_date, display_name
    ) VALUES (
      r.id, r.pitching_code, v_new, r.type_code, r.inquiry_date, r.display_name
    );
  END LOOP;
END
$$;

SELECT
  old_code,
  new_code,
  type_code,
  inquiry_date,
  display_name
FROM pitching_code_backfill_log
ORDER BY new_code;
