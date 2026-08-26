-- Link a pitching / project row to a client website or system profile.
ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS webandsystem_list_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotation_client_project_webandsystem_list_id_fkey'
  ) THEN
    ALTER TABLE public.quotation_client_project
      ADD CONSTRAINT quotation_client_project_webandsystem_list_id_fkey
      FOREIGN KEY (webandsystem_list_id)
      REFERENCES public.webandsystem_list(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS quotation_client_project_webandsystem_list_id_idx
  ON public.quotation_client_project (webandsystem_list_id);

COMMENT ON COLUMN public.quotation_client_project.webandsystem_list_id IS
  'Optional FK to webandsystem_list.id. Used to link a client website/system profile to a pitching or project.';
