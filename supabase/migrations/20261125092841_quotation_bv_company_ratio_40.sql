-- Branding Works moves from 30% to 40%. Collaborators share the remaining 60%.
-- Keep src/lib/quotationBv.ts COMPANY_BV_RATIO / STAFF_BV_POOL in sync.
--
-- One-shot rescale of existing staff rows from the 70% pool onto the 60% pool.
-- Relative shares inside a project stay the same (largest-remainder cents).
-- Projects already at or under 60 are left alone, so this is safe to re-run.

CREATE OR REPLACE FUNCTION public.quotation_bv_company_ratio()
RETURNS numeric(6, 2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 40::numeric(6, 2);
$$;

CREATE OR REPLACE FUNCTION public.quotation_bv_staff_pool()
RETURNS numeric(6, 2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 60::numeric(6, 2);
$$;

COMMENT ON FUNCTION public.quotation_bv_company_ratio() IS
  'Fixed company BV share (Branding Works). Not stored on quotation_bv.';

COMMENT ON FUNCTION public.quotation_bv_staff_pool() IS
  'Max sum of quotation_bv.bv_ratio per project. New main-PM seeds use this value.';

WITH project_pool AS (
  SELECT
    project_id,
    SUM((bv_ratio * 100)::bigint) AS old_cents
  FROM public.quotation_bv
  GROUP BY project_id
  HAVING SUM(bv_ratio) > 60
),
targets AS (
  SELECT
    project_id,
    old_cents,
    ROUND(old_cents * 60::numeric / 70, 0)::bigint AS target_cents
  FROM project_pool
),
parts AS (
  SELECT
    bv.id,
    bv.project_id,
    (bv.bv_ratio * 100)::bigint AS old_cents,
    t.old_cents AS project_old_cents,
    t.target_cents,
    ((bv.bv_ratio * 100)::bigint * t.target_cents) / t.old_cents AS floor_cents,
    ((bv.bv_ratio * 100)::bigint * t.target_cents) % t.old_cents AS remainder
  FROM public.quotation_bv bv
  JOIN targets t ON t.project_id = bv.project_id
),
ranked AS (
  SELECT
    id,
    floor_cents,
    GREATEST(target_cents - SUM(floor_cents) OVER (PARTITION BY project_id), 0) AS leftover_cents,
    ROW_NUMBER() OVER (
      PARTITION BY project_id
      ORDER BY remainder DESC, old_cents DESC, id
    ) AS rn
  FROM parts
)
UPDATE public.quotation_bv bv
SET
  bv_ratio = GREATEST(
    0.01,
    (
      r.floor_cents + CASE WHEN r.rn <= r.leftover_cents THEN 1 ELSE 0 END
    )::numeric / 100
  ),
  updated_at = now()
FROM ranked r
WHERE bv.id = r.id;

ALTER TABLE public.quotation_bv
  DROP CONSTRAINT IF EXISTS quotation_bv_bv_ratio_check;

ALTER TABLE public.quotation_bv
  ADD CONSTRAINT quotation_bv_bv_ratio_check
  CHECK (bv_ratio > 0 AND bv_ratio <= 60);

COMMENT ON TABLE public.quotation_bv IS
  'Staff collaborator BV ratio per projects hub row. Staff ratios for a project should add up to quotation_bv_staff_pool() (60). Branding Works company share is quotation_bv_company_ratio() (40) and is not stored here.';

COMMENT ON COLUMN public.quotation_bv.bv_ratio IS
  'Staff contribution share of the 60% collaborator pool.';

DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM (
    SELECT project_id
    FROM public.quotation_bv
    GROUP BY project_id
    HAVING ROUND(SUM(bv_ratio), 2) > 60
        OR MAX(bv_ratio) > 60
        OR MIN(bv_ratio) <= 0
  ) bad;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'quotation_bv staff pool still exceeds 60 on % project(s)', v_bad;
  END IF;
END $$;
