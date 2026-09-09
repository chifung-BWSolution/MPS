-- Rename catalog table vchannel_login_methods → login_methods.
-- Relation tables (vchannel_account_login_methods, supplier_login_methods, …)
-- keep their names and continue to FK to public.login_methods(id).

DO $$
BEGIN
  IF to_regclass('public.vchannel_login_methods') IS NOT NULL
     AND to_regclass('public.login_methods') IS NULL THEN
    ALTER TABLE public.vchannel_login_methods RENAME TO login_methods;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.vchannel_login_methods_pkey
  RENAME TO login_methods_pkey;
ALTER INDEX IF EXISTS public.vchannel_login_methods_login_method_idx
  RENAME TO login_methods_login_method_idx;
ALTER INDEX IF EXISTS public.vchannel_login_methods_display_name_idx
  RENAME TO login_methods_display_name_idx;
ALTER INDEX IF EXISTS public.vchannel_login_methods_updated_at_idx
  RENAME TO login_methods_updated_at_idx;
ALTER INDEX IF EXISTS public.vchannel_login_methods_is_active_idx
  RENAME TO login_methods_is_active_idx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vchannel_login_methods_two_fa_valid'
      AND conrelid = 'public.login_methods'::regclass
  ) THEN
    ALTER TABLE public.login_methods
      RENAME CONSTRAINT vchannel_login_methods_two_fa_valid
      TO login_methods_two_fa_valid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vchannel_login_methods_two_fa_na_exclusive'
      AND conrelid = 'public.login_methods'::regclass
  ) THEN
    ALTER TABLE public.login_methods
      RENAME CONSTRAINT vchannel_login_methods_two_fa_na_exclusive
      TO login_methods_two_fa_na_exclusive;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vchannel_login_methods_login_method_check'
      AND conrelid = 'public.login_methods'::regclass
  ) THEN
    ALTER TABLE public.login_methods
      RENAME CONSTRAINT vchannel_login_methods_login_method_check
      TO login_methods_login_method_check;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'login_methods'
      AND policyname = 'Allow select on vchannel_login_methods'
  ) THEN
    ALTER POLICY "Allow select on vchannel_login_methods"
      ON public.login_methods
      RENAME TO "Allow select on login_methods";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'login_methods'
      AND policyname = 'Allow insert on vchannel_login_methods'
  ) THEN
    ALTER POLICY "Allow insert on vchannel_login_methods"
      ON public.login_methods
      RENAME TO "Allow insert on login_methods";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'login_methods'
      AND policyname = 'Allow update on vchannel_login_methods'
  ) THEN
    ALTER POLICY "Allow update on vchannel_login_methods"
      ON public.login_methods
      RENAME TO "Allow update on login_methods";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'login_methods'
      AND policyname = 'Allow delete on vchannel_login_methods'
  ) THEN
    ALTER POLICY "Allow delete on vchannel_login_methods"
      ON public.login_methods
      RENAME TO "Allow delete on login_methods";
  END IF;
END $$;

COMMENT ON TABLE public.login_methods IS
  'Canonical login-method catalog. Relation tables are named <entity>_login_methods.';

COMMENT ON TABLE public.vchannel_account_login_methods IS
  'Join: vchannel_accounts ↔ login_methods';

COMMENT ON TABLE public.supplier_login_methods IS
  'Join: suppliers ↔ login_methods';
