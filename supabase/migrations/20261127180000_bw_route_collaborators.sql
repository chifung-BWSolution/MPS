-- Extra Asana followers for one BW keyword. Global collaborators stay on bw_asana_mail_settings.

ALTER TABLE public.bw_asana_mail_routes
  ADD COLUMN IF NOT EXISTS collaborator_gids text[] NOT NULL DEFAULT '{}';
