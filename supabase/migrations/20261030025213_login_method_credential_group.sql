-- One login kind per row, grouped when they share a password and contact details.
-- A platform account links a single row, so YouTube can use Google without also linking WeChat.

ALTER TABLE public.login_methods
  ADD COLUMN IF NOT EXISTS credential_group_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS login_methods_group_kind_unique
  ON public.login_methods (credential_group_id, login_method);

CREATE INDEX IF NOT EXISTS login_methods_credential_group_id_idx
  ON public.login_methods (credential_group_id);

COMMENT ON COLUMN public.login_methods.credential_group_id IS
  'Rows that share a password, contact details, and 2FA. Each row is still one login kind.';
