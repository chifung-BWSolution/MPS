-- Convert quotation_client_list.id to UUID, then replace
-- quotation_client_project.client_id (empty text) with a UUID FK.
-- Existing projects are matched to clients by client_name
-- (company_name_zh / company_name_en / contact_person).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) quotation_client_list.id: text → uuid
-- ---------------------------------------------------------------------------
ALTER TABLE public.quotation_client_list
  ADD COLUMN IF NOT EXISTS id_uuid uuid;

UPDATE public.quotation_client_list
SET id_uuid = gen_random_uuid()
WHERE id_uuid IS NULL;

ALTER TABLE public.quotation_client_list
  ALTER COLUMN id_uuid SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id_uuid SET NOT NULL;

ALTER TABLE public.quotation_client_list
  DROP CONSTRAINT quotation_client_list_pkey;

ALTER TABLE public.quotation_client_list
  DROP COLUMN id;

ALTER TABLE public.quotation_client_list
  RENAME COLUMN id_uuid TO id;

ALTER TABLE public.quotation_client_list
  ADD CONSTRAINT quotation_client_list_pkey PRIMARY KEY (id);

COMMENT ON COLUMN public.quotation_client_list.id IS
  'UUID primary key for 客戶列表.';

-- ---------------------------------------------------------------------------
-- 2) quotation_client_project.client_id: text → uuid (temp column)
-- ---------------------------------------------------------------------------
ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS client_id_uuid uuid;

-- Missing clients for project names that were added after the original seed
INSERT INTO public.quotation_client_list (
  company_name_zh,
  contact_person,
  inquiry_date,
  status,
  notes,
  created_at,
  updated_at
)
SELECT DISTINCT ON (lower(btrim(src.client_name)))
  src.client_name,
  src.client_name,
  src.inquiry_date,
  src.status,
  src.notes,
  src.created_at,
  now()
FROM (
  SELECT
    NULLIF(btrim(p.client_name), '') AS client_name,
    p.inquiry_date,
    CASE p.status
      WHEN 'confirmed' THEN 'active'
      WHEN 'closed' THEN 'inactive'
      ELSE 'prospect'
    END AS status,
    p.notes,
    p.created_at
  FROM public.quotation_client_project p
) src
WHERE src.client_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.quotation_client_list c
    WHERE lower(btrim(c.company_name_zh)) = lower(src.client_name)
       OR lower(btrim(COALESCE(c.company_name_en, ''))) = lower(src.client_name)
       OR (
         NULLIF(btrim(c.contact_person), '') IS NOT NULL
         AND btrim(c.contact_person) <> '—'
         AND lower(btrim(c.contact_person)) = lower(src.client_name)
       )
  )
ORDER BY lower(btrim(src.client_name)), src.inquiry_date DESC;

-- Backfill UUID from client_name (then display_name as last resort)
UPDATE public.quotation_client_project p
SET client_id_uuid = m.client_id
FROM (
  SELECT DISTINCT ON (p.id)
    p.id AS project_id,
    c.id AS client_id
  FROM public.quotation_client_project p
  JOIN public.quotation_client_list c
    ON (
      (
        NULLIF(btrim(p.client_name), '') IS NOT NULL
        AND (
          lower(btrim(c.company_name_zh)) = lower(btrim(p.client_name))
          OR lower(btrim(COALESCE(c.company_name_en, ''))) = lower(btrim(p.client_name))
          OR (
            NULLIF(btrim(c.contact_person), '') IS NOT NULL
            AND btrim(c.contact_person) <> '—'
            AND lower(btrim(c.contact_person)) = lower(btrim(p.client_name))
          )
        )
      )
      OR lower(btrim(c.company_name_zh)) = lower(btrim(p.display_name))
    )
  ORDER BY
    p.id,
    CASE
      WHEN NULLIF(btrim(p.client_name), '') IS NOT NULL
        AND lower(btrim(c.company_name_zh)) = lower(btrim(p.client_name)) THEN 1
      WHEN NULLIF(btrim(p.client_name), '') IS NOT NULL
        AND lower(btrim(COALESCE(c.company_name_en, ''))) = lower(btrim(p.client_name)) THEN 2
      WHEN NULLIF(btrim(p.client_name), '') IS NOT NULL
        AND lower(btrim(c.contact_person)) = lower(btrim(p.client_name)) THEN 3
      ELSE 4
    END,
    c.created_at ASC
) m
WHERE p.id = m.project_id
  AND p.client_id_uuid IS NULL;

ALTER TABLE public.quotation_client_project
  DROP COLUMN client_id;

ALTER TABLE public.quotation_client_project
  RENAME COLUMN client_id_uuid TO client_id;

ALTER TABLE public.quotation_client_project
  ADD CONSTRAINT quotation_client_project_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES public.quotation_client_list(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotation_client_project_client_id_idx
  ON public.quotation_client_project (client_id);

COMMENT ON COLUMN public.quotation_client_project.client_id IS
  'UUID FK to quotation_client_list.id; backfilled from client_name.';
