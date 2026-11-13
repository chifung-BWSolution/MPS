-- Fold kol_new_beauty back into kol_profile.
-- 新美容 stays source_system = beauty18.
-- Rows that share a phone or email are the same person. Keep one profile:
-- the existing kol_profile row when there is one, otherwise the new-beauty
-- row that already has applications, ratings, or cooperation. A cluster that
-- matches two different profiles stops the migration.

DO $$
DECLARE
  clashes text;
BEGIN
  IF to_regclass('public.kol_new_beauty') IS NULL THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE kol_nb_edge (
    a uuid NOT NULL,
    b uuid NOT NULL,
    PRIMARY KEY (a, b)
  ) ON COMMIT DROP;

  INSERT INTO kol_nb_edge (a, b)
  SELECT a.id, b.id
  FROM public.kol_new_beauty a
  JOIN public.kol_new_beauty b ON a.id < b.id
   AND (
     (
       a.phone IS NOT NULL AND btrim(a.phone) <> ''
       AND b.phone IS NOT NULL AND btrim(b.phone) <> ''
       AND lower(a.phone) = lower(b.phone)
     )
     OR (
       a.email IS NOT NULL AND btrim(a.email) <> ''
       AND b.email IS NOT NULL AND btrim(b.email) <> ''
       AND lower(a.email) = lower(b.email)
     )
   );

  CREATE TEMP TABLE kol_nb_component (
    id uuid PRIMARY KEY,
    component uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO kol_nb_component (id, component)
  WITH RECURSIVE walk AS (
    SELECT id, id AS seen
    FROM public.kol_new_beauty
    UNION
    SELECT w.id, CASE WHEN e.a = w.seen THEN e.b ELSE e.a END
    FROM walk w
    JOIN kol_nb_edge e ON e.a = w.seen OR e.b = w.seen
  )
  SELECT id, min(seen::text)::uuid
  FROM walk
  GROUP BY id;

  CREATE TEMP TABLE kol_nb_profile_match (
    component uuid NOT NULL,
    profile_id uuid NOT NULL,
    PRIMARY KEY (component, profile_id)
  ) ON COMMIT DROP;

  INSERT INTO kol_nb_profile_match (component, profile_id)
  SELECT DISTINCT c.component, p.id
  FROM kol_nb_component c
  JOIN public.kol_new_beauty nb ON nb.id = c.id
  JOIN public.kol_profile p ON p.id <> nb.id
   AND (
     (
       nb.phone IS NOT NULL AND btrim(nb.phone) <> ''
       AND p.phone IS NOT NULL AND btrim(p.phone) <> ''
       AND lower(nb.phone) = lower(p.phone)
     )
     OR (
       nb.email IS NOT NULL AND btrim(nb.email) <> ''
       AND p.email IS NOT NULL AND btrim(p.email) <> ''
       AND lower(nb.email) = lower(p.email)
     )
   );

  CREATE TEMP TABLE kol_nb_keeper (
    component uuid PRIMARY KEY,
    keeper_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO kol_nb_keeper (component, keeper_id)
  SELECT DISTINCT ON (c.component) c.component, nb.id
  FROM kol_nb_component c
  JOIN public.kol_new_beauty nb ON nb.id = c.id
  ORDER BY
    c.component,
    (
      (SELECT count(*) FROM public.kol_apply a WHERE a.kol_new_beauty_id = nb.id)
      + (SELECT count(*) FROM public.kol_rating r WHERE r.kol_new_beauty_id = nb.id)
      + (SELECT count(*) FROM public.kol_cooperation co WHERE co.kol_new_beauty_id = nb.id)
    ) DESC,
    nb.created_at ASC,
    nb.id ASC;

  CREATE TEMP TABLE kol_nb_target (
    new_id uuid PRIMARY KEY,
    target_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO kol_nb_target (new_id, target_id)
  SELECT
    c.id,
    COALESCE(one.profile_id, k.keeper_id)
  FROM kol_nb_component c
  JOIN kol_nb_keeper k ON k.component = c.component
  LEFT JOIN (
    SELECT component, min(profile_id::text)::uuid AS profile_id
    FROM kol_nb_profile_match
    GROUP BY component
    HAVING count(*) = 1
  ) one ON one.component = c.component;

  SELECT string_agg(line, E'\n' ORDER BY line)
  INTO clashes
  FROM (
    SELECT format('id %s already exists on kol_profile', nb.id) AS line
    FROM public.kol_new_beauty nb
    JOIN public.kol_profile p ON p.id = nb.id
    UNION ALL
    SELECT format('component %s matches more than one kol_profile row', component)
    FROM (
      SELECT component
      FROM kol_nb_profile_match
      GROUP BY component
      HAVING count(*) > 1
    ) ambiguous
    UNION ALL
    SELECT format('kol_apply %s points at two people', a.id)
    FROM public.kol_apply a
    JOIN kol_nb_target t ON t.new_id = a.kol_new_beauty_id
    WHERE a.kol_profile_id IS NOT NULL
      AND a.kol_profile_id <> t.target_id
    UNION ALL
    SELECT format('kol_rating %s points at two people', r.id)
    FROM public.kol_rating r
    JOIN kol_nb_target t ON t.new_id = r.kol_new_beauty_id
    WHERE r.kol_profile_id IS NOT NULL
      AND r.kol_profile_id <> t.target_id
    UNION ALL
    SELECT format('kol_cooperation %s points at two people', c.id)
    FROM public.kol_cooperation c
    JOIN kol_nb_target t ON t.new_id = c.kol_new_beauty_id
    WHERE c.kol_profile_id IS NOT NULL
      AND c.kol_profile_id <> t.target_id
  ) s;

  IF clashes IS NOT NULL THEN
    RAISE EXCEPTION 'kol_new_beauty merge blocked. Resolve these clashes first:%', E'\n' || clashes;
  END IF;

  INSERT INTO public.kol_profile
  SELECT (jsonb_populate_record(
    NULL::public.kol_profile,
    (to_jsonb(nb) - 'kol_apply_id') || jsonb_build_object('source_system', 'beauty18')
  )).*
  FROM public.kol_new_beauty nb
  JOIN kol_nb_target t ON t.new_id = nb.id AND t.target_id = nb.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.kol_profile p WHERE p.id = nb.id
  );

  UPDATE public.kol_apply a
  SET
    kol_profile_id = t.target_id,
    updated_at = now()
  FROM kol_nb_target t
  WHERE t.new_id = a.kol_new_beauty_id
    AND a.kol_profile_id IS NULL;

  UPDATE public.kol_rating r
  SET kol_profile_id = t.target_id
  FROM kol_nb_target t
  WHERE t.new_id = r.kol_new_beauty_id
    AND r.kol_profile_id IS NULL;

  UPDATE public.kol_cooperation c
  SET kol_profile_id = t.target_id
  FROM kol_nb_target t
  WHERE t.new_id = c.kol_new_beauty_id
    AND c.kol_profile_id IS NULL;
END $$;

ALTER TABLE public.kol_rating
  DROP CONSTRAINT IF EXISTS kol_rating_owner_check;
ALTER TABLE public.kol_cooperation
  DROP CONSTRAINT IF EXISTS kol_cooperation_owner_check;

ALTER TABLE public.kol_apply
  DROP COLUMN IF EXISTS kol_new_beauty_id;
ALTER TABLE public.kol_rating
  DROP COLUMN IF EXISTS kol_new_beauty_id;
ALTER TABLE public.kol_cooperation
  DROP COLUMN IF EXISTS kol_new_beauty_id;

ALTER TABLE public.kol_rating
  ALTER COLUMN kol_profile_id SET NOT NULL;
ALTER TABLE public.kol_cooperation
  ALTER COLUMN kol_profile_id SET NOT NULL;

DROP TABLE IF EXISTS public.kol_new_beauty;
