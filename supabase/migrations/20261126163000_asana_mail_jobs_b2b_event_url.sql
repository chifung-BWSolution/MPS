-- WP detail links live on the shared mail-job log. FC and BW leave this empty.
-- Stored value matches WPP: /b2b/{event id}. The public page is
-- https://www.winepassions-portal.com plus that path.

ALTER TABLE public.asana_mail_jobs
  ADD COLUMN IF NOT EXISTS b2b_event_url text;
