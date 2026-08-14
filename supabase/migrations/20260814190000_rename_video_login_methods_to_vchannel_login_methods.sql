-- Rename video_login_methods → vchannel_login_methods (keep data, indexes, RLS)

DO $$
BEGIN
  IF to_regclass('public.video_login_methods') IS NOT NULL
     AND to_regclass('public.vchannel_login_methods') IS NULL THEN
    ALTER TABLE public.video_login_methods RENAME TO vchannel_login_methods;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.video_login_methods_pkey
  RENAME TO vchannel_login_methods_pkey;
ALTER INDEX IF EXISTS public.video_login_methods_login_method_idx
  RENAME TO vchannel_login_methods_login_method_idx;
ALTER INDEX IF EXISTS public.video_login_methods_display_name_idx
  RENAME TO vchannel_login_methods_display_name_idx;
ALTER INDEX IF EXISTS public.video_login_methods_updated_at_idx
  RENAME TO vchannel_login_methods_updated_at_idx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_login_methods_two_fa_valid'
      AND conrelid = 'public.vchannel_login_methods'::regclass
  ) THEN
    ALTER TABLE public.vchannel_login_methods
      RENAME CONSTRAINT video_login_methods_two_fa_valid
      TO vchannel_login_methods_two_fa_valid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_login_methods_two_fa_na_exclusive'
      AND conrelid = 'public.vchannel_login_methods'::regclass
  ) THEN
    ALTER TABLE public.vchannel_login_methods
      RENAME CONSTRAINT video_login_methods_two_fa_na_exclusive
      TO vchannel_login_methods_two_fa_na_exclusive;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_login_methods_login_method_check'
      AND conrelid = 'public.vchannel_login_methods'::regclass
  ) THEN
    ALTER TABLE public.vchannel_login_methods
      RENAME CONSTRAINT video_login_methods_login_method_check
      TO vchannel_login_methods_login_method_check;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vchannel_login_methods'
      AND policyname = 'Allow select on video_login_methods'
  ) THEN
    ALTER POLICY "Allow select on video_login_methods"
      ON public.vchannel_login_methods
      RENAME TO "Allow select on vchannel_login_methods";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vchannel_login_methods'
      AND policyname = 'Allow insert on video_login_methods'
  ) THEN
    ALTER POLICY "Allow insert on video_login_methods"
      ON public.vchannel_login_methods
      RENAME TO "Allow insert on vchannel_login_methods";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vchannel_login_methods'
      AND policyname = 'Allow update on video_login_methods'
  ) THEN
    ALTER POLICY "Allow update on video_login_methods"
      ON public.vchannel_login_methods
      RENAME TO "Allow update on vchannel_login_methods";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vchannel_login_methods'
      AND policyname = 'Allow delete on video_login_methods'
  ) THEN
    ALTER POLICY "Allow delete on video_login_methods"
      ON public.vchannel_login_methods
      RENAME TO "Allow delete on vchannel_login_methods";
  END IF;
END $$;

COMMENT ON TABLE public.vchannel_login_methods IS
  'Vchannel login methods (影片製作 → 設定 → 登入方式)';
