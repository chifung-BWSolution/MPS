-- Spreadsheet project ids that Asana no longer recognizes should stay unset.

UPDATE public.bw_asana_mail_routes
SET
  project_name = '',
  project_gid = '',
  updated_at = now()
WHERE project_name LIKE '%試算表專案已找不到%'
   OR keyword IN ('Material', 'Green Power') AND project_gid IN ('1205116845880552', '1209429597341889');
