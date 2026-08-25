-- Restore system_users.auth_user_id on public.users (user_info + system_users merged).
-- Unique FK to auth.users(id). Backfill 1:1 from Auth email / identity email.
-- resolve_users_for_auth() links the current JWT to a whitelist row without a client email join.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

COMMENT ON COLUMN public.users.auth_user_id IS
  'Supabase Auth UID (auth.users.id). Login join key. Written on first successful login if not backfilled.';

WITH auth_emails AS (
  SELECT
    u.id AS auth_user_id,
    lower(trim(u.email)) AS email
  FROM auth.users u
  WHERE u.email IS NOT NULL
    AND trim(u.email) <> ''
  UNION
  SELECT
    i.user_id,
    lower(trim(i.email))
  FROM auth.identities i
  WHERE i.email IS NOT NULL
    AND trim(i.email) <> ''
  UNION
  SELECT
    i.user_id,
    lower(trim(i.identity_data ->> 'email'))
  FROM auth.identities i
  WHERE nullif(trim(i.identity_data ->> 'email'), '') IS NOT NULL
),
candidates AS (
  SELECT
    pu.id AS users_id,
    ae.auth_user_id,
    (
      CASE WHEN lower(coalesce(s.status, '')) = 'active' THEN 100 ELSE 0 END
      + CASE WHEN lower(coalesce(pu.system_status, '')) = 'active' THEN 10 ELSE 0 END
      + CASE WHEN lower(trim(coalesce(pu.google_email, ''))) = ae.email THEN 20 ELSE 0 END
      + CASE WHEN lower(trim(coalesce(pu.email, ''))) = ae.email THEN 10 ELSE 0 END
    ) AS score
  FROM public.users pu
  LEFT JOIN public.staffs s ON s.id = pu.staff_id
  JOIN auth_emails ae
    ON lower(trim(coalesce(pu.google_email, ''))) = ae.email
    OR lower(trim(coalesce(pu.email, ''))) = ae.email
  WHERE pu.auth_user_id IS NULL
),
ranked AS (
  SELECT
    users_id,
    auth_user_id,
    score,
    row_number() OVER (PARTITION BY users_id ORDER BY score DESC, auth_user_id) AS rn_user,
    row_number() OVER (PARTITION BY auth_user_id ORDER BY score DESC, users_id) AS rn_auth
  FROM candidates
  WHERE score > 0
)
UPDATE public.users u
SET auth_user_id = r.auth_user_id,
    updated_at = now()
FROM ranked r
WHERE u.id = r.users_id
  AND r.rn_user = 1
  AND r.rn_auth = 1
  AND u.auth_user_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_auth_user_id_key'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_auth_user_id_fkey'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_auth_user_id_fkey
      FOREIGN KEY (auth_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

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
    AND (
      lower(trim(coalesce(u.google_email, ''))) = auth_email
      OR lower(trim(coalesce(u.email, ''))) = auth_email
    )
  ORDER BY
    (
      CASE WHEN lower(coalesce(s.status, '')) = 'active' THEN 100 ELSE 0 END
      + CASE WHEN lower(coalesce(u.system_status, '')) = 'active' THEN 10 ELSE 0 END
      + CASE WHEN lower(trim(coalesce(u.google_email, ''))) = auth_email THEN 20 ELSE 0 END
      + CASE WHEN lower(trim(coalesce(u.email, ''))) = auth_email THEN 10 ELSE 0 END
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
