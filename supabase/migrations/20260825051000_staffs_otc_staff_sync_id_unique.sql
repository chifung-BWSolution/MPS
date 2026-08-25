-- PostgREST upsert onConflict needs a non-partial UNIQUE constraint.
DROP INDEX IF EXISTS public.staffs_otc_staff_sync_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staffs_otc_staff_sync_id_key'
  ) THEN
    ALTER TABLE public.staffs
      ADD CONSTRAINT staffs_otc_staff_sync_id_key UNIQUE (otc_staff_sync_id);
  END IF;
END $$;
