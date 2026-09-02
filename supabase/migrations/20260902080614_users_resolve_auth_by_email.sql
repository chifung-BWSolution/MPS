-- Allow resolve_users_for_auth() to return the whitelist row by Auth email
-- even when users.auth_user_id is already set (e.g. JWT not attached yet on
-- the first client query, or a second Auth identity for the same email).
-- Only write auth_user_id when the row is still unlinked.

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
  WHERE lower(trim(coalesce(u.email, ''))) = auth_email
  ORDER BY
    (
      CASE WHEN u.auth_user_id = uid THEN 200 ELSE 0 END
      + CASE WHEN u.auth_user_id IS NULL THEN 50 ELSE 0 END
      + CASE WHEN lower(coalesce(s.status, '')) = 'active' THEN 100 ELSE 0 END
      + CASE WHEN lower(trim(coalesce(u.email, ''))) = auth_email THEN 30 ELSE 0 END
    ) DESC,
    u.id
  LIMIT 1;

  IF rec.id IS NULL THEN
    RETURN rec;
  END IF;

  IF rec.auth_user_id IS NULL THEN
    UPDATE public.users
    SET auth_user_id = uid,
        updated_at = now()
    WHERE id = rec.id
      AND auth_user_id IS NULL;

    SELECT * INTO rec
    FROM public.users
    WHERE id = rec.id
    LIMIT 1;
  END IF;

  RETURN rec;
END;
$$;

COMMENT ON FUNCTION public.resolve_users_for_auth() IS
  'Return public.users for auth.uid(). Matches auth_user_id first, then email; links auth_user_id only when unlinked.';

REVOKE ALL ON FUNCTION public.resolve_users_for_auth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_users_for_auth() TO authenticated;
