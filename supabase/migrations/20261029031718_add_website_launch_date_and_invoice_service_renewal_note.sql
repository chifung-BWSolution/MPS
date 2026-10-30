-- Domain go-live date for a website/system, and the optional invoice sentence
-- that quotes it. The sentence is stored as text; the editor toggle is not.

ALTER TABLE public.webandsystem_list
  ADD COLUMN IF NOT EXISTS launch_date date;

COMMENT ON COLUMN public.webandsystem_list.launch_date IS
  'Date the site bound its domain and went live. Used as the default in the invoice service-renewal sentence.';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS service_renewal_note text;

COMMENT ON COLUMN public.invoices.service_renewal_note IS
  'Go-live and next-year service fee sentence. The editor toggle is not stored; preview and download include this text only while that toggle is on.';
