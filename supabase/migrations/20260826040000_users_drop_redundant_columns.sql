-- users is a login allowlist only.
-- Remove disabled/inactive rows (they must not be able to sign in),
-- then drop denormalized columns that duplicate staffs / each other.

CREATE OR REPLACE FUNCTION public.login_logs_match_user_id(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT u.id
  FROM public.users u
  WHERE p_email IS NOT NULL
    AND btrim(p_email) <> ''
    AND lower(trim(coalesce(u.email, ''))) = lower(trim(p_email))
  ORDER BY u.created_at NULLS LAST
  LIMIT 1;
$$;

DELETE FROM public.users
WHERE lower(coalesce(system_status, '')) = 'inactive'
   OR lower(coalesce(classification, '')) = 'disabled';

DROP FUNCTION IF EXISTS public.resolve_users_for_auth();

DROP INDEX IF EXISTS public.idx_users_classification;
DROP INDEX IF EXISTS public.idx_users_google_email;
DROP INDEX IF EXISTS public.idx_users_system_status;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS system_status,
  DROP COLUMN IF EXISTS classification,
  DROP COLUMN IF EXISTS google_email,
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS office,
  DROP COLUMN IF EXISTS department;

CREATE OR REPLACE FUNCTION public.resolve_users_for_auth()
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  auth_email text;
  rec public.users%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO rec
  FROM public.users
  WHERE auth_user_id = uid
  LIMIT 1;

  IF rec.id IS NOT NULL THEN
    RETURN rec;
  END IF;

  SELECT lower(trim(u.email)) INTO auth_email
  FROM auth.users u
  WHERE u.id = uid;

  IF auth_email IS NULL OR auth_email = '' THEN
    SELECT lower(trim(i.email)) INTO auth_email
    FROM auth.identities i
    WHERE i.user_id = uid
      AND i.email IS NOT NULL
      AND trim(i.email) <> ''
    LIMIT 1;
  END IF;

  IF auth_email IS NULL OR auth_email = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.* INTO rec
  FROM public.users u
  LEFT JOIN public.staffs s ON s.id = u.staff_id
  WHERE u.auth_user_id IS NULL
    AND lower(trim(coalesce(u.email, ''))) = auth_email
  ORDER BY
    (
      CASE WHEN lower(coalesce(s.status, '')) = 'active' THEN 100 ELSE 0 END
      + CASE WHEN lower(trim(coalesce(u.email, ''))) = auth_email THEN 30 ELSE 0 END
    ) DESC,
    u.id
  LIMIT 1;

  IF rec.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.users
  SET auth_user_id = uid,
      updated_at = now()
  WHERE id = rec.id
    AND auth_user_id IS NULL;

  SELECT * INTO rec
  FROM public.users
  WHERE auth_user_id = uid
  LIMIT 1;

  RETURN rec;
END;
$$;

COMMENT ON FUNCTION public.resolve_users_for_auth() IS
  'Return public.users for auth.uid(). Looks up auth_user_id first; one-time email link if unlinked.';

REVOKE ALL ON FUNCTION public.resolve_users_for_auth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_users_for_auth() TO authenticated;

COMMENT ON TABLE public.users IS
  'App login allowlist. Presence grants login. Display name / office / department come from staffs via staff_id.';
