-- Allow manually created projects on the master `projects` table
-- (項目總覽 CRUD). Synced rows remain quotation_client / webandsystem / vchannel.

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_related_type_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_related_type_check
  CHECK (related_type IN ('quotation_client', 'webandsystem', 'vchannel', 'manual'));
