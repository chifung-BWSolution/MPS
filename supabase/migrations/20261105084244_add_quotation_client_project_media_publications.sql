-- BWL client projects (市場項目 / #quotation) store 媒體發佈 links as JSON.
-- System-dev projects keep webandsystem_list_id and do not use this column in the UI.
ALTER TABLE public.quotation_client_project
  ADD COLUMN IF NOT EXISTS media_publications jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.quotation_client_project.media_publications IS
  'JSON array of media publication links for BWL client projects. Each item is { id, url }.';
