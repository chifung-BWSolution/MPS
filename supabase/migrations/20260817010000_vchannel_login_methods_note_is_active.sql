-- Add note and is_active to vchannel_login_methods

ALTER TABLE public.vchannel_login_methods
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS vchannel_login_methods_is_active_idx
  ON public.vchannel_login_methods (is_active);

COMMENT ON COLUMN public.vchannel_login_methods.note IS
  'Optional note for this login method';

COMMENT ON COLUMN public.vchannel_login_methods.is_active IS
  'Whether this login method is active and available for use';
