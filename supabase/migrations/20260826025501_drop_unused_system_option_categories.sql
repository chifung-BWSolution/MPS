-- Settings → 選項設定 used to store unused brand_category and project_type
-- chips. No screen reads those categories; keep only platform for the
-- website/system form dropdown.

DO $$
BEGIN
  IF to_regclass('public.system_options') IS NOT NULL THEN
    DELETE FROM public.system_options
    WHERE category IN ('brand_category', 'project_type');
  END IF;
END $$;
