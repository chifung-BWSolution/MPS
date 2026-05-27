DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_users') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'system_users' AND column_name = 'phone') THEN
      ALTER TABLE public.system_users ADD COLUMN phone TEXT;
    END IF;
  END IF;
END $$;
