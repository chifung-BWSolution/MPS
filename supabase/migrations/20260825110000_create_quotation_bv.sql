-- Collaborator BV (business value) share per Pitching / Project row.

CREATE TABLE IF NOT EXISTS public.quotation_bv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_client_project_id text NOT NULL
    REFERENCES public.quotation_client_project(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL
    REFERENCES public.staffs(id) ON DELETE RESTRICT,
  bv_ratio numeric(6, 2) NOT NULL
    CHECK (bv_ratio > 0 AND bv_ratio <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotation_bv_project_staff_key UNIQUE (quotation_client_project_id, staff_id)
);

CREATE INDEX IF NOT EXISTS quotation_bv_project_id_idx
  ON public.quotation_bv (quotation_client_project_id);

CREATE INDEX IF NOT EXISTS quotation_bv_staff_id_idx
  ON public.quotation_bv (staff_id);

COMMENT ON TABLE public.quotation_bv IS
  'Collaborator BV ratio per quotation_client_project. Ratios for a project should add up to 100.';

COMMENT ON COLUMN public.quotation_bv.quotation_client_project_id IS
  'Related Pitching / Project row (quotation_client_project.id).';

COMMENT ON COLUMN public.quotation_bv.staff_id IS
  'Collaborator staff (staffs.id).';

COMMENT ON COLUMN public.quotation_bv.bv_ratio IS
  'Contribution share. Values for one project should add up to 100.';

ALTER TABLE public.quotation_bv ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on quotation_bv" ON public.quotation_bv;
CREATE POLICY "Allow select on quotation_bv"
  ON public.quotation_bv FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on quotation_bv" ON public.quotation_bv;
CREATE POLICY "Allow insert on quotation_bv"
  ON public.quotation_bv FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on quotation_bv" ON public.quotation_bv;
CREATE POLICY "Allow update on quotation_bv"
  ON public.quotation_bv FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on quotation_bv" ON public.quotation_bv;
CREATE POLICY "Allow delete on quotation_bv"
  ON public.quotation_bv FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_bv TO anon, authenticated;
GRANT ALL ON public.quotation_bv TO service_role;

-- Seed current projects: main PM owns 100% BV.
INSERT INTO public.quotation_bv (quotation_client_project_id, staff_id, bv_ratio)
SELECT p.id, p.main_pm_id, 100
FROM public.quotation_client_project p
WHERE p.main_pm_id IS NOT NULL
ON CONFLICT (quotation_client_project_id, staff_id) DO NOTHING;

-- New rows (and first-time main_pm assignment) get the same 100% seed when no BV exists.
CREATE OR REPLACE FUNCTION public.trg_quotation_bv_seed_main_pm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.main_pm_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.main_pm_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.quotation_bv
    WHERE quotation_client_project_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.quotation_bv (quotation_client_project_id, staff_id, bv_ratio)
  VALUES (NEW.id, NEW.main_pm_id, 100)
  ON CONFLICT (quotation_client_project_id, staff_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_bv_seed_main_pm ON public.quotation_client_project;
CREATE TRIGGER trg_quotation_bv_seed_main_pm
AFTER INSERT OR UPDATE OF main_pm_id ON public.quotation_client_project
FOR EACH ROW
EXECUTE FUNCTION public.trg_quotation_bv_seed_main_pm();
