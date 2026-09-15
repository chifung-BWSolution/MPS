SELECT
  (SELECT count(*)
   FROM public.quotation_client_project
   WHERE project_types && ARRAY['bwl_event', 'bwg_gift']::text[]
     AND project_types && ARRAY['bwt_web', 'bwt_system']::text[]) AS illegal_mixes,
  (SELECT project_types
   FROM public.quotation_client_project
   WHERE pitching_code = 'BWT-S26-001') AS bwt_s26_001_types,
  (SELECT count(*)
   FROM public.quotation_client_project
   WHERE pitching_code LIKE 'BWL-E%'
     AND project_types = ARRAY['bwt_web']::text[]) AS bwl_e_now_web_only,
  (SELECT count(*)
   FROM public.quotation_client_project
   WHERE pitching_code LIKE 'BWT-S%'
     AND project_types = ARRAY['bwt_system']::text[]
     AND pitching_code IN ('BWT-S25-002', 'BWT-S26-001', 'BWT-S26-002', 'BWT-S26-004')) AS bwt_s_system_only,
  (SELECT project_types
   FROM public.quotation_client_project
   WHERE pitching_code = 'BWT-S26-003') AS bwt_s26_003_types,
  (SELECT pitching_code
   FROM public.quotation_client_project
   WHERE pitching_code = 'BWL-E25-001') AS code_e25_001_unchanged,
  (SELECT tgenabled
   FROM pg_trigger
   WHERE tgname = 'trg_assign_pitching_code') AS pitching_code_trigger_enabled;
