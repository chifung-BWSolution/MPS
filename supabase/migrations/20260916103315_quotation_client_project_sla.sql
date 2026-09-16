-- SLA metrics on confirmed client projects (quotation_client_project).
ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS sla jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.quotation_client_project.sla IS
  'Service level agreement JSON: { serviceAvailabilityPercent, mttr, csOpeningHours, frt }.';
