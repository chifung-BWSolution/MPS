-- Realign pitching_code after project_types corrections.
-- Keep codes that already match type prefix + inquiry_date FY.
-- Reallocate the rest with public.allocate_pitching_code (same as the assign trigger).

DO $$
DECLARE
  r record;
  v_prefix text;
  v_fy_label text;
  v_pattern text;
BEGIN
  FOR r IN
    SELECT
      q.id,
      q.project_types,
      q.inquiry_date,
      q.pitching_code
    FROM public.quotation_client_project q
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

    UPDATE public.quotation_client_project
    SET pitching_code = public.allocate_pitching_code(r.project_types, r.inquiry_date)
    WHERE id = r.id;
  END LOOP;
END
$$;
