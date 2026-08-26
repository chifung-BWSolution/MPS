-- Point login_logs.user_id at public.users (system_users is gone).
-- Backfill from email / google_email. New inserts fill user_id when the
-- email matches a whitelist row, so login recording still works if the
-- client omits user_id. Unknown emails stay null.

ALTER TABLE public.login_logs
  DROP CONSTRAINT IF EXISTS login_logs_user_id_fkey;

CREATE OR REPLACE FUNCTION public.login_logs_match_user_id(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT u.id
  FROM public.users u
  WHERE p_email IS NOT NULL
    AND btrim(p_email) <> ''
    AND (
      lower(trim(coalesce(u.email, ''))) = lower(trim(p_email))
      OR lower(trim(coalesce(u.google_email, ''))) = lower(trim(p_email))
    )
  ORDER BY
    CASE WHEN lower(trim(coalesce(u.google_email, ''))) = lower(trim(p_email)) THEN 0 ELSE 1 END,
    CASE WHEN lower(trim(coalesce(u.system_status, ''))) = 'active' THEN 0 ELSE 1 END,
    u.created_at NULLS LAST
  LIMIT 1;
$$;

UPDATE public.login_logs ll
SET user_id = public.login_logs_match_user_id(ll.email)
WHERE ll.user_id IS NULL
  AND public.login_logs_match_user_id(ll.email) IS NOT NULL;

ALTER TABLE public.login_logs
  ADD CONSTRAINT login_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs(user_id);

COMMENT ON COLUMN public.login_logs.user_id IS
  'Whitelist user (public.users.id). Null when the login email is not in users.';

CREATE OR REPLACE FUNCTION public.login_logs_fill_user_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := public.login_logs_match_user_id(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_login_logs_fill_user_id ON public.login_logs;
CREATE TRIGGER trg_login_logs_fill_user_id
  BEFORE INSERT ON public.login_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.login_logs_fill_user_id();
